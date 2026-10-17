#!/usr/bin/env python3
"""Self tests, including a real-git CLI regression in a disposable directory."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("cost_gate", HERE / "gate.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)
VALID_WORKFLOW = """name: Cost safety
on:
  pull_request:
permissions:
  contents: read
jobs:
  cost-safety:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
"""


class ScannerTests(unittest.TestCase):
    def test_docs_and_generated_files_are_low_risk(self):
        for path in ("README.md", "docs/polling.md", "vendor/a.js", ".env.production", "dist/app.js", "generated/client.js", "secrets/token.json", "package-lock.json"):
            with self.subTest(path=path):
                self.assertEqual(gate.risks(path, b"setInterval(fetch, 1); retry();"), [])

    def test_recurring_and_fanout_surfaces_are_detected(self):
        fixtures = {
            "polling/timers": ("src/poller.ts", "setInterval(poll, 1000)"),
            "retry/failure": ("src/client.py", "retry(attempt)"),
            "schedule/cron": ("vercel.json", '{"crons": [{"schedule": "* * * * *"}]}'),
            "network/fanout": ("src/api.go", "http.Get(url)"),
            "routing/cache": ("next.config.js", "rewrites: async () => []"),
        }
        for expected, (path, content) in fixtures.items():
            with self.subTest(expected=expected):
                self.assertIn(expected, gate.risks(path, content.encode()))

    def test_guardrail_changes_are_always_reviewed(self):
        self.assertEqual(gate.risks(".github/cost-safety/gate.py", b"pass"), ["guardrail"])
        self.assertEqual(gate.risks(gate.WORKFLOW_PATH, b""), ["guardrail"])
        self.assertEqual(gate.risks("agents.md", b""), ["guardrail"])

    def test_common_client_hooks_and_retry_options_are_detected(self):
        for content in ("refetchInterval: 5", "useSWR(key)", "refetch()", "retryDelay: 0", "client.request(url)"):
            with self.subTest(content=content):
                self.assertTrue(gate.risks("src/client.ts", content.encode()))

    def test_workflow_matrix_fanout_is_detected(self):
        for content in ("strategy:\n  matrix:\n    version: [1, 2, 3]", 'strategy:\n  "matrix":\n    version: [1, 2]', "parallelism: ${{ strategy.matrix }}", '{"strategy": {"matrix": {"version": [1, 2]}}}'):
            with self.subTest(content=content):
                self.assertIn("workflow/fanout", gate.risks(".github/workflows/build.yml", content.encode()))

    def test_ordinary_workflow_job_changes_require_review(self):
        content = "name: CI\non:\n  push:\njobs:\n  first:\n    runs-on: ubuntu-latest\n  second:\n    runs-on: ubuntu-latest\n"
        self.assertIn("workflow/fanout", gate.risks(".github/workflows/build.yml", content.encode()))

    def test_module_typescript_extensions_are_scanned(self):
        for path in ("src/provider.mts", "src/provider.cts"):
            self.assertIn("network/fanout", gate.risks(path, b"fetch(endpoint)"))

    def test_native_query_builders_and_rpc_calls_are_detected(self):
        for content in ("db.from('messages').select('*')", "db.from('messages').insert(row)",
                        "db.from('messages').update(row)", "db.from('messages').upsert(row)",
                        "db.from('messages').delete()", "db.from('messages').execute()",
                        "db.from('messages').select().maybeSingle()", "db.rpc('expensive')",
                        'client.functions.invoke("expensive")',
                        'SupabaseClientProvider.shared.functions.invoke("generate-narration")'):
            with self.subTest(content=content):
                self.assertTrue(gate.risks("src/client.ts", content.encode()))

    def test_common_provider_ai_firebase_storage_and_auth_primitives_are_detected(self):
        for content in ("stripe.v2.core.accounts.create(input)", "stripe.paymentIntents.create(input)",
                        "resend.emails.send(input)", "openai.responses.create(input)",
                        "cachedCallLlm(input)", "callLlm(input)", "generateText(input)",
                        "model.generateContent(input)", 'doc.setData(["name": value])',
                        'getDoc(ref)', "storage.from(bucket).upload(path, data)",
                        "client.auth.signIn(input)", "signInWithEmailAndPassword(auth, email, password)"):
            with self.subTest(content=content):
                self.assertIn("provider/client", gate.risks("src/provider.ts", content.encode()))

    def test_common_cache_calls_and_settings_are_detected(self):
        for content in ("cache.set(key, value)", "redis.expire(key, 60)", "cache_ttl = 60", "export const dynamic = 'force-static'"):
            with self.subTest(content=content):
                self.assertIn("routing/cache", gate.risks("src/cache.ts", content.encode()))

    def test_swift_and_supabase_network_and_timer_surfaces_are_detected(self):
        for path, content, category in (
            ("App/Client.swift", "URLSession.shared.data(for: request)", "network/fanout"),
            ("App/Client.swift", "Timer.scheduledTimer(withTimeInterval: 1, repeats: true)", "polling/timers"),
            ("App/Client.swift", 'supabase.functions.invoke("expensive")', "network/fanout"),
            ("src/client.py", 'database.from("events").select("*").execute()', "network/fanout"),
        ):
            with self.subTest(path=path, content=content):
                self.assertIn(category, gate.risks(path, content.encode()))

    def test_swift_timer_publish_and_dispatch_queue_delays_are_detected(self):
        for content in ("Timer.publish(every: 1, on: .main, in: .common)",
                        "Timer(timeInterval: 1, repeats: true)",
                        "DispatchQueue.main.asyncAfter(deadline: .now() + 1)"):
            with self.subTest(content=content):
                self.assertIn("polling/timers", gate.risks("App/Waves.swift", content.encode()))

    def test_local_dynamic_import_does_not_create_bytecode(self):
        with tempfile.TemporaryDirectory(prefix="cost-gate-bytecode-") as temp:
            target = Path(temp)
            for name in ("gate.py", "test_gate.py"):
                (target / name).write_bytes((HERE / name).read_bytes())
            env = dict(os.environ)
            env.pop("PYTHONDONTWRITEBYTECODE", None)
            env.pop("PYTHONPYCACHEPREFIX", None)
            code = "import runpy; runpy.run_path(" + repr(str(target / "test_gate.py")) + ", run_name='fixture_import')"
            result = subprocess.run([sys.executable, "-c", code], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            self.assertEqual((result.returncode, result.stderr), (0, b""))
            self.assertEqual(list(target.rglob("*.pyc")), [])

    def test_workflow_requires_pr_trigger_and_rejects_dispatch(self):
        for content in (VALID_WORKFLOW.replace("on:\n  pull_request:\n", ""),
                        VALID_WORKFLOW.replace("  pull_request:", "  push:"),
                        VALID_WORKFLOW.replace("  pull_request:", "  workflow_dispatch:"),
                        VALID_WORKFLOW.replace("  pull_request:", "  pull_request:\n  workflow_dispatch:")):
            with self.subTest(content=content):
                self.assertIn("only the pull_request trigger", " ".join(gate.workflow_errors(content.encode())))

    def test_workflow_rejects_every_nested_pr_trigger_filter(self):
        for value in ("types: closed", "branches: do-not-run", "paths: no-such-file", "paths-ignore: '**'"):
            content = VALID_WORKFLOW.replace("  pull_request:", "  pull_request:\n    " + value)
            self.assertIn("nested pull_request trigger configuration", " ".join(gate.workflow_errors(content.encode())))

    def test_workflow_rejects_whole_secrets_context(self):
        for expression in ("${{ toJSON(secrets) }}", "${{ secrets }}", "${{ format('{0}', secrets) }}"):
            content = VALID_WORKFLOW + "    env:\n      LEAK: " + expression + "\n"
            self.assertIn("secrets and write credentials", " ".join(gate.workflow_errors(content.encode())))

    def test_workflow_rejects_privileged_event(self):
        self.assertTrue(gate.workflow_errors(VALID_WORKFLOW.replace("pull_request:", "pull_request_target:").encode()))

    def test_workflow_rejects_write_token_and_secrets(self):
        for unsafe in (VALID_WORKFLOW.replace("contents: read", "contents: write"),
                       VALID_WORKFLOW + "    env:\n      TOKEN: ${{ secrets.PROD_TOKEN }}\n",
                       VALID_WORKFLOW.replace("    steps:", "    permissions: write-all\n    steps:")):
            with self.subTest(unsafe=unsafe):
                self.assertTrue(gate.workflow_errors(unsafe.encode()))

    def test_workflow_requires_bounded_timeout_for_every_job(self):
        for unsafe in (VALID_WORKFLOW.replace("    timeout-minutes: 5\n", ""),
                       VALID_WORKFLOW.replace("timeout-minutes: 5", "timeout-minutes: 999"),
                       VALID_WORKFLOW + "  second-job:\n    runs-on: ubuntu-latest\n    steps: []\n"):
            self.assertTrue(gate.workflow_errors(unsafe.encode()))

    def test_workflow_requires_pinned_actions(self):
        self.assertTrue(gate.workflow_errors(VALID_WORKFLOW.replace("11bd71901bbe5b1630ceea73d27597364c9af683", "v4").encode()))

    def assert_unsupported_workflow(self, content):
        errors = gate.workflow_errors(content.encode())
        self.assertTrue(errors)
        self.assertIn("unsupported workflow YAML format", " ".join(errors))

    def test_quoted_write_permission_key_is_rejected(self):
        for quote in ('"', "'"):
            self.assert_unsupported_workflow(VALID_WORKFLOW.replace(
                "  contents: read", "  contents: read\n  " + quote + "id-token" + quote + ": write"))

    def test_quoted_job_without_timeout_is_rejected(self):
        for quote in ('"', "'"):
            self.assert_unsupported_workflow(VALID_WORKFLOW + "  " + quote + "unbounded" + quote
                                             + ":\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo unsafe\n")

    def test_flow_style_unpinned_action_is_rejected(self):
        self.assert_unsupported_workflow(VALID_WORKFLOW + "      - { uses: attacker/action@main }\n")

    def test_related_unsupported_yaml_forms_fail_closed(self):
        fixtures = (
            VALID_WORKFLOW.replace("permissions:\n  contents: read", "permissions: { contents: read, id-token: write }"),
            VALID_WORKFLOW.replace("permissions:", '"permissions":'),
            VALID_WORKFLOW.replace("  contents: read", '  "contents": read'),
            VALID_WORKFLOW.replace("  cost-safety:", '  "cost-safety":'),
            VALID_WORKFLOW.replace("jobs:", '"jobs":'),
            VALID_WORKFLOW.replace("    timeout-minutes: 5", '    "timeout-minutes": 5'),
            VALID_WORKFLOW.replace("    steps:", "    steps: [{ uses: attacker/action@main }]"),
            VALID_WORKFLOW.replace("      - uses:", '      - "uses":'),
            VALID_WORKFLOW.replace("  cost-safety:", "  cost-safety: { runs-on: ubuntu-latest }"),
            VALID_WORKFLOW.replace("permissions:\n  contents: read", "permissions: &read_only\n  contents: read"),
            VALID_WORKFLOW.replace("permissions:\n  contents: read", "permissions: *read_only"),
            VALID_WORKFLOW.replace("    timeout-minutes: 5", "    timeout-minutes: 5\n    timeout-minutes: 999"),
            VALID_WORKFLOW + "---\nname: Second document\n",
        )
        for content in fixtures:
            with self.subTest(content=content):
                self.assert_unsupported_workflow(content)

    def test_quoted_permission_values_and_unpinned_action_values_fail(self):
        for content in (VALID_WORKFLOW.replace("contents: read", 'contents: "write"'),
                        VALID_WORKFLOW.replace("11bd71901bbe5b1630ceea73d27597364c9af683", "main"),
                        VALID_WORKFLOW.replace("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", '"attacker/action@main"')):
            with self.subTest(content=content):
                self.assertTrue(gate.workflow_errors(content.encode()))

    def test_run_block_is_not_mistaken_for_yaml_structure(self):
        content = VALID_WORKFLOW + "      - run: |\n          echo 'permissions: { id-token: write }'\n          echo '\"unbounded\":'\n          echo '- { uses: attacker/action@main }'\n"
        self.assertEqual(gate.workflow_errors(content.encode()), [])

    def test_safe_workflow_passes(self):
        self.assertEqual(gate.workflow_errors(VALID_WORKFLOW.encode()), [])
        self.assertEqual(gate.workflow_errors(VALID_WORKFLOW.replace("permissions:", "\npermissions:").encode()), [])

    def test_placeholder_or_nonnumeric_control_is_rejected(self):
        self.assertFalse(gate.substantive("TBD"))
        self.assertFalse(gate.substantive("Requests are bounded to a small amount per client", numeric=True))
        self.assertTrue(gate.substantive("At most 1 outstanding request per active client", numeric=True))


class GitIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cost-safety-test-")
        self.repo = Path(self.temp.name)
        self.env = dict(os.environ, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
                        GIT_AUTHOR_NAME="Gate fixture", GIT_AUTHOR_EMAIL="fixture@example.invalid",
                        GIT_COMMITTER_NAME="Gate fixture", GIT_COMMITTER_EMAIL="fixture@example.invalid")
        self.git("init", "--quiet")
        self.write("README.md", "Fixture\n")
        self.write("tests/poll.test.js", "function test_request_limit_stops_after_three_failures() { return true; }\n")
        self.base = self.save()

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        result = subprocess.run(["git", "-C", str(self.repo), *args], env=self.env,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=15)
        return result.stdout.decode().strip()

    def write(self, path, content):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def save(self):
        self.git("add", ".")
        self.git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Fixture revision")
        return self.git("rev-parse", "HEAD")

    def review(self, path="src/poll.js", content=None):
        content = (self.repo / path).read_bytes() if content is None else content
        test_content = (self.repo / "tests/poll.test.js").read_bytes()
        return {"version": 1, "base_commit": self.base, "reviews": [{
            "path": path, "sha256": gate.digest(content), "reviewer": "Fixture reviewer",
            "rationale": "The timer can repeatedly issue requests; the regression names the cancellation and failure limit.",
            "controls": {
                "request_bound": "At most 1 outstanding request per active client with a 30 second minimum interval.",
                "fanout_bound": "At most 1 endpoint is requested per timer tick; there is no nested per-item request fanout.",
                "termination": "The timer is cancelled when the view unmounts and after three consecutive failures.",
                "failure_behavior": "A failed request increments the failure counter; after three failures polling stops.",
            },
            "evidence": [{"path": "tests/poll.test.js", "sha256": gate.digest(test_content),
                          "anchor": "test_request_limit_stops_after_three_failures"}],
        }]}

    def save_review(self, review):
        self.write(gate.REVIEW_PATH, json.dumps(review))
        return self.save()

    def cli(self, head, base=None):
        result = subprocess.run([sys.executable, str(HERE / "gate.py"), "--repo", str(self.repo),
                                 "--base", base or self.base, "--head", head],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, env=self.env)
        self.assertEqual(result.stderr, b"")
        return result.returncode, json.loads(result.stdout)

    def risky(self):
        self.write("src/poll.js", "const timer = setInterval(() => fetch('/status'), 30000);\n")

    def test_low_risk_docs_change_passes_without_review(self):
        self.write("README.md", "Explain polling and fetch without changing application code.\n")
        code, report = self.cli(self.save())
        self.assertEqual((code, report["status"], report["review_required"]), (0, "pass", []))

    def test_missing_review_fails(self):
        self.risky()
        code, report = self.cli(self.save())
        self.assertEqual(code, 1)
        self.assertIn("current cost review", report["errors"][0])

    def test_guardrail_helpers_in_excluded_folders_still_require_review(self):
        for path in (".github/cost-safety/vendor/helper.py", ".github/cost-safety/generated/helper.py"):
            with self.subTest(path=path):
                self.write(path, "pass\n")
                code, report = self.cli(self.save())
                self.assertEqual(code, 1)
                self.assertIn("current cost review", report["errors"][0])

    def test_secret_guardrail_paths_fail_without_reading_any_blob(self):
        for path in (".github/cost-safety/vendor/.env.production", ".github/cost-safety/generated/credentials.json"):
            with self.subTest(path=path):
                self.write(path, "synthetic fixture content\n")
                head = self.save()
                with mock.patch.object(gate, "blob") as reader:
                    report = gate.run(self.repo, self.base, head)
                    reader.assert_not_called()
                self.assertEqual(report["status"], "fail")
                self.assertIn("rejected without reading contents", " ".join(report["errors"]))
                code, report = self.cli(head)
                self.assertEqual(code, 1)
                self.assertIn("rejected without reading contents", " ".join(report["errors"]))

    def test_ordinary_secret_files_are_never_read_even_on_modification_or_removal(self):
        self.write(".env.production", "synthetic fixture content\n")
        self.write("secrets/credentials.json", "synthetic fixture content\n")
        head = self.save()
        with mock.patch.object(gate, "blob") as reader:
            self.assertEqual(gate.run(self.repo, self.base, head)["status"], "pass")
            reader.assert_not_called()
        self.base = head
        self.write(".env.production", "changed synthetic fixture content\n")
        (self.repo / "secrets/credentials.json").unlink()
        with mock.patch.object(gate, "blob") as reader:
            self.assertEqual(gate.run(self.repo, self.base, self.save())["status"], "pass")
            reader.assert_not_called()

    def test_sdk_queries_and_module_source_require_current_review(self):
        for path, content in (("src/provider.mts", "db.from('events').insert(row)"),
                              ("src/provider.cts", "cachedCallLlm(input)")):
            self.write(path, content)
            code, report = self.cli(self.save())
            self.assertEqual(code, 1)
            self.assertIn("current cost review", report["errors"][0])

    def test_deleted_risky_configuration_requires_explicit_current_review(self):
        self.write("vercel.json", '{"headers": [{"key": "Cache-Control", "value": "max-age=3600"}]}')
        self.base = self.save()
        (self.repo / "vercel.json").unlink()
        code, report = self.cli(self.save())
        self.assertEqual(code, 1)
        self.assertIn("current cost review", report["errors"][0])
        code, report = self.cli(self.save_review(self.review("vercel.json", b"")))
        self.assertEqual(code, 0)
        self.assertIn("cost configuration removal", report["review_required"][0]["categories"])

    def test_root_policy_truncation_and_removal_require_review(self):
        self.write("AGENTS.md", "Keep cost review and application regressions required.\n")
        self.base = self.save()
        self.write("AGENTS.md", "")
        code, report = self.cli(self.save())
        self.assertEqual(code, 1)
        self.assertIn("current cost review", report["errors"][0])
        (self.repo / "AGENTS.md").unlink()
        code, report = self.cli(self.save())
        self.assertEqual(code, 1)
        code, report = self.cli(self.save_review(self.review("AGENTS.md", b"")))
        self.assertEqual(code, 0)

    def test_lowercase_root_policy_requires_review(self):
        self.write("agents.md", "Keep cost reviews required.\n")
        code, report = self.cli(self.save())
        self.assertEqual(code, 1)
        self.assertIn("current cost review", report["errors"][0])

    def test_current_review_cannot_allow_secrets_or_narrowed_pr_triggers(self):
        for content, expected in (
            (VALID_WORKFLOW + "    env:\n      LEAK: ${{ toJSON(secrets) }}\n", "secrets and write credentials"),
            (VALID_WORKFLOW.replace("  pull_request:", "  pull_request:\n    types: closed"), "nested pull_request trigger"),
        ):
            with self.subTest(content=content):
                self.write(gate.WORKFLOW_PATH, content)
                code, report = self.cli(self.save_review(self.review(gate.WORKFLOW_PATH)))
                self.assertEqual(code, 1)
                self.assertIn(expected, " ".join(report["errors"]))

    def test_unsupported_workflow_fails_cli_even_with_current_review(self):
        for unsafe in (VALID_WORKFLOW.replace("  contents: read", '  contents: read\n  "id-token": write'),
                       VALID_WORKFLOW + '  "unbounded":\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo unsafe\n',
                       VALID_WORKFLOW + "      - { uses: attacker/action@main }\n"):
            with self.subTest(unsafe=unsafe):
                self.write(gate.WORKFLOW_PATH, unsafe)
                code, report = self.cli(self.save_review(self.review(gate.WORKFLOW_PATH)))
                self.assertEqual(code, 1)
                self.assertIn("unsupported workflow YAML format", " ".join(report["errors"]))

    def test_removed_pr_trigger_fails_cli_even_with_current_review(self):
        self.write(gate.WORKFLOW_PATH, VALID_WORKFLOW.replace("on:\n  pull_request:\n", ""))
        code, report = self.cli(self.save_review(self.review(gate.WORKFLOW_PATH)))
        self.assertEqual(code, 1)
        self.assertIn("only the pull_request trigger", " ".join(report["errors"]))

    def test_current_concrete_review_passes_without_executing_evidence(self):
        self.risky()
        review = self.review()
        review["reviews"][0]["command"] = "touch SHOULD_NOT_EXIST"
        code, report = self.cli(self.save_review(review))
        self.assertEqual((code, report["status"]), (0, "pass"))
        self.assertFalse((self.repo / "SHOULD_NOT_EXIST").exists())

    def test_stale_source_digest_fails(self):
        self.risky()
        review = self.review()
        self.write("src/poll.js", "setInterval(() => fetch('/status'), 1);\n")
        code, report = self.cli(self.save_review(review))
        self.assertEqual(code, 1)
        self.assertIn("stale source sha256", " ".join(report["errors"]))

    def test_stale_base_review_fails(self):
        self.risky()
        review = self.review()
        review["base_commit"] = "0" * 40
        code, report = self.cli(self.save_review(review))
        self.assertEqual(code, 1)
        self.assertIn("exact PR base", report["errors"][0])

    def test_missing_or_stale_test_and_anchor_fail(self):
        self.risky()
        for change, expected in (({"path": "tests/missing.test.js"}, "missing/nonregular"),
                                 ({"sha256": "0" * 64}, "stale regression test"),
                                 ({"anchor": "test_never_written_anywhere"}, "anchor is missing"),
                                 ({"path": "src/poll.js"}, "test/spec")):
            with self.subTest(change=change):
                review = self.review()
                review["reviews"][0]["evidence"][0].update(change)
                code, report = self.cli(self.save_review(review))
                self.assertEqual(code, 1)
                self.assertIn(expected, " ".join(report["errors"]))

    def test_empty_controls_and_missing_review_entry_fail(self):
        self.risky()
        review = self.review()
        review["reviews"][0]["controls"] = {}
        code, report = self.cli(self.save_review(review))
        self.assertEqual(code, 1)
        self.assertEqual(len(report["errors"]), 4)
        review["reviews"] = []
        code, report = self.cli(self.save_review(review))
        self.assertEqual(code, 1)
        self.assertIn("missing review", report["errors"][0])

    def test_duplicate_review_paths_and_invalid_json_fail(self):
        self.risky()
        review = self.review()
        review["reviews"].append(dict(review["reviews"][0]))
        code, report = self.cli(self.save_review(review))
        self.assertEqual(code, 1)
        self.assertIn("duplicate review path", report["errors"][0])
        self.write(gate.REVIEW_PATH, "{invalid json}")
        code, report = self.cli(self.save())
        self.assertEqual(code, 1)
        self.assertIn("invalid", report["errors"][0])

    def test_array_and_null_review_documents_fail_as_structured_json(self):
        self.risky()
        for value in ([], None):
            with self.subTest(value=value):
                self.write(gate.REVIEW_PATH, json.dumps(value))
                code, report = self.cli(self.save())
                self.assertEqual((code, report["status"]), (1, "fail"))
                self.assertIn("JSON object", report["errors"][0])

    def test_unknown_commit_or_symbolic_ref_does_not_become_empty_diff(self):
        for base in ("f" * 40, "HEAD"):
            with self.subTest(base=base):
                code, report = self.cli(self.base, base)
                self.assertEqual((code, report["status"]), (1, "fail"))

    def test_removed_guardrail_requires_explicit_review(self):
        self.write(".github/cost-safety/gate.py", "pass\n")
        self.base = self.save()
        (self.repo / ".github/cost-safety/gate.py").unlink()
        code, _ = self.cli(self.save())
        self.assertEqual(code, 1)
        review = self.review(".github/cost-safety/gate.py", b"")
        code, report = self.cli(self.save_review(review))
        self.assertEqual((code, report["status"]), (0, "pass"))

    def test_symlink_cannot_be_regression_evidence(self):
        self.risky()
        (self.repo / "tests/link.test.js").symlink_to("poll.test.js")
        review = self.review()
        review["reviews"][0]["evidence"][0]["path"] = "tests/link.test.js"
        code, report = self.cli(self.save_review(review))
        self.assertEqual(code, 1)
        self.assertIn("tracked regular file", " ".join(report["errors"]))

    def test_unchanged_preexisting_risk_is_not_certified(self):
        self.risky()
        self.base = self.save()
        self.write("README.md", "Only documentation changed.\n")
        code, report = self.cli(self.save())
        self.assertEqual(code, 0)
        self.assertEqual(report["review_required"], [])

    def test_removing_last_risk_marker_from_modified_file_still_requires_review(self):
        self.risky()
        self.base = self.save()
        self.write("src/poll.js", "export const enabled = false;\n")
        code, report = self.cli(self.save())
        self.assertEqual(code, 1)
        self.assertIn("current cost review", report["errors"][0])
        code, report = self.cli(self.save_review(self.review()))
        self.assertEqual(code, 0)
        self.assertIn("polling/timers", report["review_required"][0]["categories"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
