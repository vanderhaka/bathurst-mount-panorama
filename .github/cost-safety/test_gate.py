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

    def test_common_client_hooks_and_retry_options_are_detected(self):
        for content in ("refetchInterval: 5", "useSWR(key)", "refetch()", "retryDelay: 0", "client.request(url)"):
            with self.subTest(content=content):
                self.assertTrue(gate.risks("src/client.ts", content.encode()))

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
