# Project instructions

## Code Review Rules

Flag these cost risks as P1 and name the limit you expect:

- New or increased recurring work that calls a paid service (Supabase, OpenAI, Anthropic, Stripe, Resend, Vercel functions or any other API): polling, timers, retries, queues, webhooks, loops, or a cron or schedule that is added or runs more often, without a clear limit on how often or how many times it runs.
- A request handler (API route, server action, webhook or public endpoint) whose change adds paid calls per request, fans out into many calls, or removes or raises a rate limit, retry cap, timeout or budget check.
- A caching or routing change that turns cached responses into uncached paid work or multiplies requests.
- A GitHub Actions change that adds triggers, schedules, jobs, steps or matrix entries, or makes jobs much longer.
- Removal of an existing limit, such as a rate limit, max retries, timeout or budget check.

Do not flag code that keeps its existing per-request cost. Spending caps at each provider are the hard stop; these findings catch runaway usage before it reaches them.
