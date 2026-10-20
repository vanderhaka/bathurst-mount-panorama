# Project instructions

## Code Review Rules

Flag these cost risks as P1 and name the limit you expect:

- New or increased recurring or repeated work that calls a paid service (Supabase, OpenAI, Anthropic, Stripe, Resend, Vercel functions or any other API): polling, timers, retries, queues, webhooks, loops, one-off batches that fan out into many calls, or a cron or schedule that is added or runs more often, without a clear limit on how often or how many times it runs.
- A request handler (API route, server action, webhook or public endpoint) whose change adds paid calls per request, fans out into many calls, or removes or raises a rate limit, retry cap, timeout or budget check.
- Unbounded billable work inside a single paid call, such as no cap on AI output tokens, unbounded input size, or unpaginated large queries.
- A caching or routing change that turns cached responses into uncached paid work or multiplies requests.
- A GitHub Actions change that adds triggers, schedules, jobs, steps or matrix entries, moves jobs to a more expensive runner (macOS, Windows or larger runners), or makes jobs much longer.
- Removal of an existing limit, such as a rate limit, max retries, timeout or budget check.

Do not flag a change only when both the cost of each call and how often it runs stay the same. Spending caps at each provider are the hard stop; these findings catch runaway usage before it reaches them.
