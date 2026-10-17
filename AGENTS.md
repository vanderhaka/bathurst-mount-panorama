# Project instructions

## Cost safety for pull requests

- Follow [.github/cost-safety/README.md](.github/cost-safety/README.md) for changed polling, retries, schedules, network fan-out, routing/cache and guardrail files.
- Add current controls and regression evidence in `.cost-safety/review.json`; run the actual relevant application tests as well as the generic gate.
- A passing review gate does not prove arbitrary request bounds, certify unchanged code, or impose a provider spending cap. Preserve existing budget, security and release protections.
