# Cost safety review gate

This dependency-free Python 3.9+ gate flags changed source/configuration with timer,
polling, retry, scheduling, network/fanout, routing or cache signatures. It requires a
current review of each flagged file, bound to its exact SHA-256 and the current PR
base commit. Low-risk documentation changes pass without a review.

This is a review acknowledgement, not a semantic program proof or a cryptographic
reviewer signature. A passing result does not prove request bounds, run application
regressions, certify unchanged code, or impose a spend cap. The reviewer must inspect
the controls and ensure the cited regressions actually test the changed behavior.
Keep project-specific regression CI alongside this check.

## Install

Copy these files without changing their contents:

| Shared file                 | Repository destination              |
| --------------------------- | ----------------------------------- |
| `gate/gate.py`              | `.github/cost-safety/gate.py`       |
| `gate/test_gate.py`         | `.github/cost-safety/test_gate.py`  |
| `templates/cost-safety.yml` | `.github/workflows/cost-safety.yml` |

Add this project review instruction to the repository's existing contribution/agent
instructions without overwriting them:

> For changed recurring traffic, network fanout, retry, cron, routing/cache or cost
> gate surfaces, add a current `.cost-safety/review.json` using the cost safety gate
> schema. State concrete request/fanout bounds, termination, failure behavior and
> the actual risk. Cite regression test files, their exact SHA-256 and existing test
> names. Run the actual project regressions separately. Never treat the generic gate
> as proof that application traffic is bounded or unchanged code is safe.

The workflow runs only on `pull_request`, with a read-only token, no
secrets, pinned checkout actions and a five-minute job timeout. Checkouts disable
persisted credentials, LFS and submodules. No app dependency installation is needed.
It checks out the exact candidate and exact trusted base into separate directories,
then executes **the base's gate and self-tests** against candidate git blobs. It never
imports candidate application code or runs review-supplied commands.

First installation is explicitly a bootstrap: if `git ls-tree` successfully confirms
the base has no gate, it runs the candidate gate/self-tests and emits a visible
warning. The coordinator must independently review the byte-identical installation
and its fixture results before merging. A bootstrap green run is not established
enforcement. Errors, missing self-tests or a damaged existing base gate fail rather
than trigger fallback. Later candidate changes/removals of the gate and workflow
require current risk review; unsafe permissions/events/timeouts in a changed gate
workflow fail even when acknowledged. Workflow validation is deliberately limited
to the conventional vendored workflow layout, not arbitrary YAML semantics. It
accepts unquoted mapping keys, conventional block mappings/sequences, one explicit
global `permissions` map containing only `contents: read`, and a numeric bounded
timeout for every job. The `on` block must contain only `pull_request`; missing or
manual-only triggers fail. Manual dispatch is excluded because a same-commit base
and head would not inspect a PR diff. Flow collections, quoted mapping/job keys, duplicate mapping
keys, anchors, aliases, tags, multiple documents and non-`run` block scalars fail
with an `unsupported workflow YAML format` diagnostic. Shell text inside a supported
`run: |` block is opaque to this structural check; it still needs normal code review.
Use the installed template's formatting when changing this workflow.

Installation, green CI, a required branch check and semantic application regression
coverage are separate states. Configure the `Cost safety review` check as required
only after it has actually run, while preserving existing required checks. Workflow
files still need trusted human review: a PR can propose changing its own workflow,
and the review JSON itself does not authenticate its claimed reviewer.

A required status check alone cannot prevent a candidate from replacing its own job with a successful no-op; protecting workflow changes requires maintainer review or an external required-workflow policy.

## Run

```sh
python3 .github/cost-safety/test_gate.py
python3 .github/cost-safety/gate.py --repo /absolute/candidate-checkout --base FULL_BASE_COMMIT_ID --head FULL_HEAD_COMMIT_ID
```

Both arguments must be exact full commit IDs available in the candidate checkout.
The base must be an ancestor of the candidate: update a stale PR branch before
review. An unknown, shallow, invalid or unrelated revision fails closed rather than
becoming an empty diff. The gate reads committed blobs, not uncommitted working
files. Output is JSON with changed-file count, flagged paths/categories/digests and
errors; exit `0` means its review checks passed and `1` means failure. It never
prints file contents, review prose, test contents or environment values.

To review an uncommitted change, first put it in an isolated local commit using
your normal repository workflow. Do not use this gate as a reason to stage or commit
unrelated work. The self-tests create and remove disposable git repositories only;
they do not change the repository under review or contact providers. They disable
bytecode writes before importing the gate, so the documented local command does not
create an untracked `__pycache__` directory.

## Review schema

Store this JSON in `.cost-safety/review.json`, replacing every illustrative value
with evidence for the actual change:

```json
{
  "version": 1,
  "base_commit": "<exact full PR base commit ID>",
  "reviews": [
    {
      "path": "src/polling.ts",
      "sha256": "<SHA-256 of the entire candidate file bytes>",
      "reviewer": "<actual reviewer acknowledgement>",
      "rationale": "The changed mounted-view poller can repeatedly fetch status; the tests cover cleanup and repeated failure.",
      "controls": {
        "request_bound": "At most 1 outstanding request per client, with at least 30 seconds between starts.",
        "fanout_bound": "At most 1 status endpoint is called per tick, with no per-row network requests.",
        "termination": "The view cancels its timer and request on unmount; three consecutive failures stop polling.",
        "failure_behavior": "Each failure increments the counter; after three failures no replacement timer is scheduled."
      },
      "evidence": [
        {
          "path": "tests/polling.test.ts",
          "sha256": "<SHA-256 of the exact candidate regression test file bytes>",
          "anchor": "stops_after_three_consecutive_failures"
        }
      ]
    }
  ]
}
```

Use `python3 -c 'import hashlib,pathlib; print(hashlib.sha256(pathlib.Path("src/polling.ts").read_bytes()).hexdigest())'`
to compute a digest without exposing source. Repeat for each test file. On a
missing review, the CLI prints only the review-document error; source digests can
be computed using this command. Once the review document exists, per-file failures
also include the current flagged-file digests in the JSON report.

Each flagged path needs one review entry. Source/test digest mismatches, duplicate
paths, a stale base, missing tests or absent anchors fail. Controls/rationale must
be substantive (at least 30 characters each); the request and fanout bounds must
include numbers. Reviewer acknowledgements must contain at least three characters.
These are schema checks, not a prose quality or honesty detector. Tests must be
tracked regular files at a recognizable `test`/`tests`/`spec`/`specs` path/name; each
anchor must be at least eight characters and exist verbatim in that file. Symlink
evidence is rejected. Extra fields, including a declared command, are inert and
never executed. Only entries for the currently flagged changes are validated for
source/evidence freshness; old unrelated review entries convey no coverage.

For an explicitly reviewed removal of a gate file/workflow, use the removed path
with SHA-256 of empty bytes
(`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
Still cite an existing test and explain why removal is acceptable. Human review
and branch policy must decide whether to accept weakened future enforcement.

## Scope and limits

The scanner examines the entire base and candidate contents of modified source/config
files, not just added lines. Removing the last recognized timer/retry/cache marker
still requires review; existing risky code touched by a change also requires review.
New files use their candidate contents. Signatures include common client hooks and
options (`refetchInterval`, `useSWR`, `refetch`, `retryDelay`, `client.request`).
They also cover workflow matrix fanout, `cache.set`, `redis.expire`, `cache_ttl`,
`force-static`, Swift `URLSession`, `Timer` APIs (including `Timer.publish`) and
`DispatchQueue.main.asyncAfter`, Supabase function invocation
and common `.from(...).select(...).execute()` chains. The chain matcher bounds each
argument span to 512 characters; unusual wrappers/long chains still need human review.
Common source extensions and configuration files are included. Gate files
and its workflow are always reviewed, including removal. Ordinary source deletion
does not require review.

It excludes documentation, `.env`/common credential/key files, lockfiles, common
generated/minified files, and `vendor`, `node_modules`, `generated`, common secret,
build, distribution and coverage directories. These exclusions reduce noise and avoid reading common
secret locations; they are not a secret scanner or certification of generated code.
Guardrail paths under `.github/cost-safety/` override ordinary vendor/generated
exclusions, so helpers there still require review. Secret-bearing guardrail paths
are rejected from path metadata without reading their contents; move executable
helpers to a non-secret filename and keep credentials out of the guardrail tree.
Unsupported languages, dynamic calls, obfuscated behavior, unusual generated file
locations and external services can evade signatures. Harmless strings/comments,
test fixtures and existing calls in a touched file can cause false positives. Use
an honest concrete review when flagged; do not rename files to evade the gate.

Inputs are bounded to 3,000 changed paths and 2 MiB per inspected file. Git commands
have 30-second timeouts; CI has its own five-minute overall bound. The gate uses
raw git blobs, disables external diffs/text conversion, follows no evidence symlinks
and never executes the cited command/test. An excluded or unchanged cost bug still
needs project-specific tests, runtime safeguards and accepted provider budget policy.

The self-tests cover detection/exclusions, current/missing/stale reviews, numeric
controls, dangling/stale test references, inert commands, unknown revisions, guardrail
removal and unsafe workflow fixtures. Real-git tests exercise the CLI across actual
temporary commits. The tiny test function inside those fixtures is contract data;
its existence is intentionally **not** evidence of real application correctness.
