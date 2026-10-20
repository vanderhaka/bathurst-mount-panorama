# Project instructions

## Code Review Rules

- Flag as P1 any new or changed polling, timer, retry, cron or schedule, loop, webhook handler or parallel fan-out that calls a paid service (Supabase, OpenAI, Anthropic, Stripe, Resend, Vercel functions, other APIs) without a clear upper bound on how often or how many times it runs. Name the bound you expect.
- Flag as P1 any GitHub Actions change that adds triggers, schedules, matrix jobs or much longer jobs.
- Spending caps live at each provider. These findings exist to catch runaway usage before it reaches those caps.
