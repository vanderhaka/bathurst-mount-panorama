#!/usr/bin/env python3
"""Review changed cost-sensitive surfaces. Standard library only; never runs app code."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import PurePosixPath

REVIEW_PATH = ".cost-safety/review.json"
GATE_PREFIX = ".github/cost-safety/"
WORKFLOW_PATH = ".github/workflows/cost-safety.yml"
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_CHANGED_FILES = 3000
SOURCE_SUFFIXES = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".rs",
    ".rb", ".php", ".java", ".kt", ".swift", ".sh", ".bash", ".html",
    ".vue", ".svelte", ".json", ".yaml", ".yml", ".toml", ".ini", ".conf",
    ".config", ".sql", ".tf", ".xml", ".cs", ".ex", ".exs", ".dart",
}
EXCLUDED_PARTS = {"node_modules", "vendor", "generated", "dist", "build", "coverage", ".next", ".git", "__pycache__", ".aws", ".ssh", "secrets", ".secrets"}
EXCLUDED_NAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "poetry.lock", "Cargo.lock", "uv.lock"}
PATTERNS = {
    "polling/timers": r"\b(?:setInterval|setTimeout|requestAnimationFrame|poll(?:ing)?|ticker|interval|sleep|refetchInterval|useSWR|refetch|Timer\s*\.\s*scheduledTimer)\b",
    "retry/failure": r"\b(?:retr(?:y|ies)|retryDelay|retryCount|backoff|reconnect|recurs(?:e|ion))\b",
    "schedule/cron": r"\b(?:crons?|crontab|schedule(?:d|s)?|PeriodicTask|while\s*\(?\s*(?:true|True|1))\b",
    "network/fanout": r"\b(?:fetch|axios|https?|requests|urllib|httpx|(?:client|session)\.request|URLSession|supabase\s*\.\s*functions\s*\.\s*invoke|WebSocket|EventSource|Promise\.all(?:Settled)?|ThreadPoolExecutor|gather|fanout|parallel)\b|\.from\s*\([^;]{0,512}?\)\s*\.select\s*\([^;]{0,512}?\)\s*\.execute\s*\(",
    "workflow/fanout": r"\bstrategy\s*\.\s*matrix\b|\bmatrix[\"']?\s*:",
    "routing/cache": r"\b(?:rewrites?|redirects?|proxy|middleware|cache-control|revalidate|no-store|cache_ttl|force-static|cache\s*\.\s*set|redis\s*\.\s*expire)\b",
}
RISK_PATTERNS = {name: re.compile(pattern, re.IGNORECASE | re.MULTILINE) for name, pattern in PATTERNS.items()}
PLACEHOLDER = re.compile(r"^(?:todo|tbd|n/?a|none|unknown|pending|placeholder|test|example|fixme)[.!\s]*$", re.I)


class GateError(Exception):
    pass


def git(repo, *args):
    try:
        result = subprocess.run(
            ["git", "--no-pager", "--literal-pathspecs", "-C", str(repo), *args],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GateError("git could not complete: " + str(exc)) from exc
    if result.returncode:
        # Git errors may include URLs or source text; keep diagnostics deliberately small.
        raise GateError("git " + args[0] + " failed (exit " + str(result.returncode) + ")")
    return result.stdout


def commit(repo, ref):
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", ref):
        raise GateError("base and head must be full commit IDs, not branch names")
    resolved = git(repo, "rev-parse", "--verify", ref + "^{commit}").decode().strip()
    if resolved != ref.lower():
        raise GateError("commit did not resolve exactly: " + ref)
    return resolved


def safe_path(path):
    if not isinstance(path, str) or not path or "\\" in path:
        return False
    parts = PurePosixPath(path).parts
    return not path.startswith("/") and all(p not in (".", "..") for p in parts) and str(PurePosixPath(path)) == path


def excluded(path):
    p = PurePosixPath(path)
    name = p.name.lower()
    return (bool(set(p.parts) & EXCLUDED_PARTS) or p.name in EXCLUDED_NAMES
            or name == ".env" or name.startswith(".env.")
            or name.endswith((".pem", ".key", ".p12", ".pfx", ".crt"))
            or name in {"credentials", "credentials.json", "secrets.json", "secrets.yml", "secrets.yaml"}
            or name.endswith((".min.js", ".map", ".generated.ts", ".generated.js")))


def risks(path, content):
    if path.startswith(GATE_PREFIX) or path == WORKFLOW_PATH:
        return ["guardrail"]
    if excluded(path):
        return []
    p = PurePosixPath(path)
    if p.suffix.lower() not in SOURCE_SUFFIXES and p.name not in {"Dockerfile", "Makefile", "Procfile"}:
        return []
    text = content.decode("utf-8", errors="replace")
    return [name for name, pattern in RISK_PATTERNS.items() if pattern.search(text)]


def digest(content):
    return hashlib.sha256(content).hexdigest()


def blob(repo, revision, path):
    if not safe_path(path):
        raise GateError("invalid repository-relative path")
    object_id = revision + ":" + path
    size = int(git(repo, "cat-file", "-s", object_id).decode().strip())
    if size > MAX_FILE_BYTES:
        raise GateError(path + ": file exceeds 2 MiB review limit; split the file for review")
    # Reject symlinks/submodules as evidence or review files: use tracked regular files only.
    entry = git(repo, "ls-tree", revision, "--", path).decode("utf-8", errors="replace")
    if not entry.startswith(("100644 blob ", "100755 blob ")):
        raise GateError(path + ": expected a tracked regular file")
    return git(repo, "cat-file", "blob", object_id)


def substantive(value, minimum=30, numeric=False):
    return (isinstance(value, str) and len(value.strip()) >= minimum
            and not PLACEHOLDER.fullmatch(value.strip())
            and (not numeric or re.search(r"\d", value) is not None))


def workflow_lines(text):
    """Recognize only the vendored block-mapping layout; reject other YAML forms."""
    tokens, errors = [], []
    block_indent = None
    scopes = {}
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if block_indent is not None:
            if indent > block_indent:
                continue  # Shell block content is not YAML structure.
            block_indent = None
        stripped = line[indent:]
        sequence = stripped.startswith("- ")
        if sequence:
            stripped = stripped[2:]
        match = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?", stripped)
        if indent % 2 or "\t" in line[:indent + 1] or not match:
            errors.append("unsupported workflow YAML format at line " + str(number)
                          + ": use unquoted keys and conventional block mappings")
            continue
        key, value = match.group(1), match.group(2) or ""
        value = re.sub(r"[ \t]+#.*$", "", value).rstrip()
        if value.startswith(("{", "[", "&", "*", "!", ">", "|")):
            if key == "run" and value in ("|", "|-", "|+"):
                block_indent = indent
            else:
                errors.append("unsupported workflow YAML format at line " + str(number)
                              + ": flow collections, aliases, anchors, tags and non-run block scalars are forbidden")
        effective_indent = indent + (2 if sequence else 0)
        # Each sequence item opens a fresh mapping; ordinary mappings share a scope.
        for depth in list(scopes):
            if depth > effective_indent or (sequence and depth >= effective_indent):
                del scopes[depth]
        seen = scopes.setdefault(effective_indent, set())
        if key in seen:
            errors.append("unsupported workflow YAML format at line " + str(number) + ": duplicate mapping key")
        seen.add(key)
        tokens.append((indent, key, value, sequence))
    return tokens, errors


def workflow_errors(content):
    """Validate a conservative vendored layout, never arbitrary YAML semantics."""
    text = content.decode("utf-8", errors="replace")
    tokens, errors = workflow_lines(text)
    events = []
    inside_events = False
    for indent, key, value, sequence in tokens:
        if indent == 0:
            inside_events = (key, value, sequence) == ("on", "", False)
        elif inside_events and indent == 2:
            events.append((key, value, sequence))
    if events != [("pull_request", "", False)]:
        errors.append("the supported workflow requires an on block with only the pull_request trigger; manual dispatch is unsupported")
    if re.search(r"\bpull_request_target\b", text):
        errors.append("privileged pull_request_target event is forbidden")
    if re.search(r"\bsecrets\s*(?:\.|\[|:)|\bwrite-all\b", text):
        errors.append("secrets and write credentials are forbidden")
    permission_indices = [i for i, token in enumerate(tokens) if token[1] == "permissions"]
    permission_body = []
    if len(permission_indices) == 1:
        index = permission_indices[0]
        if tokens[index] == (0, "permissions", "", False):
            for token in tokens[index + 1:]:
                if token[0] == 0:
                    break
                permission_body.append(token)
    if permission_body != [(2, "contents", "read", False)]:
        errors.append("only explicit global permissions with contents: read are supported; job overrides/write permissions are forbidden")
    uses = [value for _, key, value, _ in tokens if key == "uses"]
    if any(not re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", use) for use in uses):
        errors.append("actions must be pinned to full commit IDs")
    jobs, current = [], None
    inside_jobs = False
    for indent, key, value, sequence in tokens:
        if indent == 0:
            inside_jobs = key == "jobs" and value == "" and not sequence
            current = None
        elif inside_jobs and indent == 2:
            if value or sequence:
                errors.append("unsupported workflow YAML format: each job must use a conventional block mapping")
            current = (key, [])
            jobs.append(current)
        elif inside_jobs and current is not None and indent == 4 and key == "timeout-minutes" and not sequence:
            current[1].append(value)
    if not jobs:
        errors.append("a conventional jobs block is required")
    for name, values in jobs:
        if len(values) != 1 or not re.fullmatch(r"\d+", values[0]) or not 1 <= int(values[0]) <= 15:
            errors.append("job " + name + " requires a literal timeout-minutes between 1 and 15")
    return errors


def check_review(repo, base, head, required):
    try:
        document = json.loads(blob(repo, head, REVIEW_PATH))
    except (GateError, ValueError) as exc:
        raise GateError("missing or invalid " + REVIEW_PATH + "; add a current cost review") from exc
    if not isinstance(document, dict):
        raise GateError("review document must be a JSON object, not an array or null")
    if document.get("version") != 1 or document.get("base_commit") != base:
        raise GateError("review requires version 1 and base_commit matching the exact PR base")
    entries = document.get("reviews")
    if not isinstance(entries, list):
        raise GateError("review.reviews must be an array")
    indexed = {}
    for entry in entries:
        if not isinstance(entry, dict) or not safe_path(entry.get("path")):
            raise GateError("each review requires a valid path")
        if entry["path"] in indexed:
            raise GateError("duplicate review path: " + entry["path"])
        indexed[entry["path"]] = entry
    errors = []
    for path, content, categories in required:
        entry = indexed.get(path)
        if not entry:
            errors.append(path + ": missing review (" + ", ".join(categories) + ")")
            continue
        if entry.get("sha256") != digest(content):
            errors.append(path + ": stale source sha256")
        if not substantive(entry.get("reviewer"), 3):
            errors.append(path + ": reviewer acknowledgement is required")
        if not substantive(entry.get("rationale")):
            errors.append(path + ": explain the actual cost risk and why controls cover this change")
        controls = entry.get("controls", {})
        for name in ("request_bound", "fanout_bound", "termination", "failure_behavior"):
            if not isinstance(controls, dict) or not substantive(controls.get(name), numeric=name.endswith("bound")):
                errors.append(path + ": concrete " + name + " is required" + (" (include a numeric bound)" if name.endswith("bound") else ""))
        evidence = entry.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            errors.append(path + ": at least one regression test reference is required")
            continue
        for item in evidence:
            if not isinstance(item, dict) or not safe_path(item.get("path")) or excluded(item.get("path", "")):
                errors.append(path + ": invalid regression test path")
                continue
            test_path = item["path"]
            # Require a recognisable test location, not arbitrary source offered as proof.
            if not re.search(r"(?:^|[/_.-])(?:tests?|specs?)(?:[/_.-]|$)", test_path, re.I):
                errors.append(path + ": evidence must reference a test/spec file: " + test_path)
                continue
            try:
                test_content = blob(repo, head, test_path)
            except GateError:
                errors.append(path + ": missing/nonregular regression test: " + test_path)
                continue
            if item.get("sha256") != digest(test_content):
                errors.append(path + ": stale regression test sha256: " + test_path)
            anchor = item.get("anchor")
            if not isinstance(anchor, str) or len(anchor.strip()) < 8 or anchor not in test_content.decode("utf-8", errors="replace"):
                errors.append(path + ": regression test anchor is missing: " + test_path)
    return errors


def run(repo, base_ref, head_ref):
    base, head = commit(repo, base_ref), commit(repo, head_ref)
    # Missing/shallow/unrelated base must fail, never turn into a clean diff.
    git(repo, "merge-base", "--is-ancestor", base, head)
    records = git(repo, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-status", "-z", base, head).split(b"\0")
    changed = []
    for i in range(0, len(records) - 1, 2):
        status, path = records[i].decode(), records[i + 1].decode("utf-8", errors="strict")
        if not safe_path(path):
            raise GateError("changed file has an unsupported path")
        changed.append((status, path))
    if len(changed) > MAX_CHANGED_FILES:
        raise GateError("diff exceeds 3000 files; split the change for review")
    required, errors = [], []
    for status, path in changed:
        if status == "D":
            if path.startswith(GATE_PREFIX) or path == WORKFLOW_PATH:
                # Removal has no head blob. A digest of empty bytes explicitly acknowledges it.
                required.append((path, b"", ["guardrail removal"]))
            continue
        if path == REVIEW_PATH or excluded(path):
            continue
        suffix = PurePosixPath(path).suffix.lower()
        if suffix not in SOURCE_SUFFIXES and not path.startswith(GATE_PREFIX) and PurePosixPath(path).name not in {"Dockerfile", "Makefile", "Procfile"}:
            continue
        content = blob(repo, head, path)
        categories = risks(path, content)
        if status == "M":
            # Removing the last marker must not erase the need to review this change.
            categories = list(dict.fromkeys(categories + risks(path, blob(repo, base, path))))
        if categories:
            required.append((path, content, categories))
        if path == WORKFLOW_PATH:
            errors.extend(path + ": " + error for error in workflow_errors(content))
    if required:
        errors.extend(check_review(repo, base, head, required))
    return {"base_commit": base, "head_commit": head, "changed_files": len(changed),
            "review_required": [{"path": p, "sha256": digest(c), "categories": r} for p, c, r in required],
            "errors": errors, "status": "fail" if errors else "pass"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="candidate git checkout (read only)")
    parser.add_argument("--base", required=True, help="full PR base commit ID")
    parser.add_argument("--head", required=True, help="full candidate commit ID")
    args = parser.parse_args()
    try:
        result = run(args.repo, args.base, args.head)
    except (GateError, UnicodeError, ValueError) as exc:
        print(json.dumps({"status": "fail", "errors": [str(exc)]}, indent=2))
        return 1
    print(json.dumps(result, indent=2))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
