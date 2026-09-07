# Plans

Working documents for work that is planned, in progress, or awaiting a
decision. This is the counterpart to the `README.md`, which describes the
system as it exists today.

## Convention

- One file per thread of work: `YYYY-MM-DD-short-slug.md`.
- Start each file with a **Status** line — `Planned`, `In progress`,
  `Blocked`, or `Shipped`.
- When the work ships, delete the file. The code, its tests, and the PR
  description are the durable record; a plan doc that survives its own
  completion just rots and misleads the next reader.
- Anything that describes how the system *currently* works belongs in
  `README.md`, not here.

## Current

| File | Status | Summary |
|---|---|---|
| [`2026-09-05-code-review.md`](2026-09-05-code-review.md) | In progress | Full repo audit. The security and correctness fixes shipped in #6; the open items are tracked below. |
| [`2026-09-06-ecs-express-migration.md`](2026-09-06-ecs-express-migration.md) | Planned | Move off AWS App Runner, which is closed to new customers. |
| [`2026-09-06-product-backlog.md`](2026-09-06-product-backlog.md) | Planned | Feature and UX work, carried over from the old `support_docs/TODO.md`. |
