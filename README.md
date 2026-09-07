# NFL Pick'em

A web app for running NFL pick'em pools — weekly-picks and survivor formats,
automatic scoring from the ESPN API, leaderboards, and email invitations.

Astro 7 + React 19 on the front, Express on the back, with a pluggable
database layer that runs SQLite locally and DynamoDB in production.

---

## Quick start

**Requires Node ≥ 22.12** (Astro 7's floor). `.nvmrc` pins 22.12.0, so
`nvm use` picks it up.

```bash
npm install
npm run setup   # creates the SQLite database, seeds teams, creates an admin user
npm run dev     # frontend on :4321, backend on :3001
```

`npm run setup` prints the generated admin credentials — save them.

The Astro dev server proxies `/api` and `/logos` through to the Express
backend, so use <http://localhost:4321> for everything.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Frontend (:4321) and backend (:3001) together |
| `npm run dev:frontend` | Astro dev server only |
| `npm run dev:backend` | Express server only, under nodemon |
| `npm run dev:local` | As `dev`, but loads `.env.local` (LocalStack) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run setup` | Create and seed the local SQLite database |
| `npm run init-db` | Database schema only, no seed data |
| **`npm run verify`** | **lint + type-check + test — run this before pushing** |
| `npm run lint` | ESLint (`lint:fix` to autofix) |
| `npm run check` | `astro check` type-check |
| `npm run test` | Vitest (`test:watch`, `test:coverage`) |
| `npm run format` | Prettier (`format:check` to verify only) |
| `npm run docker:build` / `docker:run` | Build and run the container locally |
| `npm run localstack:*` | LocalStack lifecycle — see [Local DynamoDB](#local-dynamodb-with-localstack) |

CI runs lint → type-check → test → build on every PR to `main` and
`develop` (`.github/workflows/ci.yml`).

### Lint baseline

`npm run lint` is green at **0 errors**, with roughly 530 warnings that are
a deliberate, annotated backlog rather than a silenced one — each demoted
rule carries its count and reason in `eslint.config.js`. The
`react-hooks/*` warnings are the ones worth reading first; they point at
real render loops and leaked intervals.

Keep errors at zero. Drive warnings down and promote rules back to `error`
as each category empties.

## Project layout

```
football-pick-em/
├── src/                      # Frontend — Astro pages wrapping React islands
│   ├── components/           # React components (one per screen)
│   ├── layouts/              # Astro layouts
│   ├── pages/                # File-based routes
│   ├── lib/slug.ts           # Game-slug rules (mirrored in server/utils/slug.js)
│   ├── stores/auth.ts        # Nanostores auth state
│   └── utils/api.ts          # Typed API client
├── server/                   # Backend — Express
│   ├── routes/               # HTTP handlers
│   ├── middleware/auth.js    # JWT verification, requireAdmin, requireGameOwner
│   ├── providers/            # SQLiteProvider / DynamoDBProvider
│   ├── services/
│   │   ├── database/         # Per-entity services, one impl per provider
│   │   ├── espnApi.js        # ESPN integration + response cache
│   │   ├── scheduler.js      # node-cron score updates
│   │   ├── configService.js  # Config + Secrets Manager resolution
│   │   └── emailService.js   # Invitation email
│   └── utils/                # logger, coerce, slug, seedTeams
├── test/
│   ├── server/               # Node-pool specs
│   └── client/               # jsdom specs
├── infrastructure/           # CloudFormation for the DynamoDB tables
├── plans/                    # Planned / in-progress work — see plans/README.md
├── scripts/                  # setup, init-db, LocalStack helpers
└── Dockerfile                # Multi-stage production image
```

### Database abstraction

`DatabaseServiceFactory` returns a SQLite or DynamoDB implementation of each
service interface based on `DATABASE_TYPE`:

- `sqlite` — local file
- `dynamodb` — AWS
- `auto` — DynamoDB when `NODE_ENV=production`, SQLite otherwise

Both implement the interfaces in `server/services/database/interfaces/`.
Anything added to one must be added to the other.

> **The two providers encode booleans differently** — SQLite uses `0`/`1`,
> DynamoDB uses the strings `"true"`/`"false"`. Never test a persisted flag
> for truthiness: `!"false"` is `false` and `Boolean("false")` is `true`.
> Route every such flag through `server/utils/coerce.js#toBoolean`. This
> exact bug once made every logged-in user an admin in production.

### Tables

`football_teams`, `seasons`, `football_games`, `pickem_games`,
`game_participants`, `picks`, `weekly_standings`, `game_invitations`,
`system_settings`, `users`.

SQLite schema lives in `server/providers/SQLiteProvider.js`; the DynamoDB
equivalents, including their GSIs, are in
`infrastructure/dynamodb-tables-optimized.yml`.

`infrastructure/` holds two templates:

| Template | Purpose |
|---|---|
| `dynamodb-tables-optimized.yml` | The 10 tables and every GSI the code queries |
| `dynamodb-stack-template.yml` | Wraps the above, and adds the application IAM role for DynamoDB plus SSM parameters publishing the database config and role ARN |

Deploy the stack template to get the roles and parameters as well, or the
tables template alone if you manage IAM separately.

> Two earlier table templates (`dynamodb-tables.yml`,
> `dynamodb-tables-simple.yml`) were removed: each omitted GSIs the code
> queries, and a missing index fails quietly — the app keeps working and
> silently falls back to full table scans. Recover them from git history if
> you ever need the comparison.

## Configuration

Copy a template and fill it in — `.env.local.template` for local
development, `.env.production.template` for deployment. Both are committed;
the resulting `.env*` files are gitignored.

### Core

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` enables the scheduler, memory monitoring, and health-endpoint gating |
| `PORT` | Express port. Defaults to 3001 locally, 8080 in the container |
| `DATABASE_TYPE` | `sqlite`, `dynamodb`, or `auto` |
| `DATABASE_PATH` | SQLite file location |
| `JWT_SECRET` | **Required.** Signs auth tokens |
| `SETTINGS_ENCRYPTION_KEY` | **Required.** Encrypts admin SMTP settings at rest |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeds the initial admin account |
| `LOG_LEVEL` | `ERROR`, `WARN`, `INFO`, `DEBUG` |

Generate the secrets with:

```bash
openssl rand -hex 48   # JWT_SECRET
openssl rand -hex 32   # SETTINGS_ENCRYPTION_KEY
```

### DynamoDB

| Variable | Notes |
|---|---|
| `AWS_REGION` | `us-east-1` — must match the region the tables live in |
| `DYNAMODB_TABLE_PREFIX` | e.g. `football_pickem_` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Omit in AWS — use the instance/task role instead |
| `USE_LOCALSTACK`, `LOCALSTACK_ENDPOINT` | Point the SDK at LocalStack |

### Secrets Manager

`configService` resolves any value beginning with `arn:aws:secretsmanager:`
through Secrets Manager at startup, in production or when
`USE_LOCALSTACK=true`. So set `JWT_SECRET` to a secret ARN rather than a
literal and the application fetches it at boot.

The role needs `secretsmanager:GetSecretValue` on that secret:

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:*:*:secret:football-pickem/*"
}
```

**Never commit literal secret values.** `apprunner.yaml` is in version
control; put ARNs there, or set the values as service-level secrets.

If resolution fails in production the app enters *degraded mode*: it keeps
serving so health checks pass, but `JWT_SECRET` becomes a random
per-process value. That is deliberate — it fails safe. Every existing
session stops verifying until the configuration is fixed, which is the
correct outcome and visible in the logs.

### Health endpoints

| Path | Auth | Use |
|---|---|---|
| `/health` | none | **Liveness. Point load balancers here.** No database work, always 200 |
| `/api/health` | none | Fast check with database-initialised and config status |
| `/api/health/*` | gated | `detailed`, `ready`, `database`, `dynamodb/*`, `performance` |

Everything under `/api/health` except the index requires an admin JWT or an
`x-health-token` header, **and in production returns 404 outright unless
`ENABLE_DETAILED_HEALTH=true`**. Pointing a health check at
`/api/health/live` will therefore fail in production — use `/health`.

### SMTP

Either set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, or
configure it in Admin → Settings, where it is stored encrypted with
`SETTINGS_ENCRYPTION_KEY`. For Gmail, enable 2FA and use an App Password.

> Password reset is **not wired to email yet** — the endpoint logs the token
> instead of sending it. See `plans/2026-09-05-code-review.md` §1.6.

## Local DynamoDB with LocalStack

Exercises the DynamoDB code path without touching AWS. Requires Docker.

```bash
npm run localstack:start   # start, then seed secrets
npm run localstack:setup   # create tables and GSIs
npm run localstack:test    # verify connectivity
npm run dev:local          # run the app against LocalStack
```

Also available: `localstack:status`, `localstack:logs`,
`localstack:reset` (recreate + reseed), `localstack:stop`, and
`localstack:clean` (tear down *and delete* `./localstack-data`).

State persists in `./localstack-data` between restarts. Container config is
in `docker-compose.localstack.yml`.

## Admin setup

After `npm run setup`, sign in with the printed credentials:

1. **Admin → Seasons** — mark the current NFL season active.
2. **Admin Dashboard → Sync Full Schedule** — import games from ESPN.
3. **Admin → Settings** — configure SMTP if you want invitation emails.
4. **Create Game** — start a pool and invite players.

The scheduler then keeps scores current on its own: every 15 minutes during
game windows, hourly pick recalculation, and a six-hourly off-hours check.

## Deployment

The production image is built by the multi-stage `Dockerfile` on
`node:22-alpine`. Stage one installs all dependencies and runs
`npm run build`; stage two gets the built output plus pruned production
dependencies and runs as the non-root `node` user.

```bash
docker build -t football-pickem .
docker run -p 8080:8080 --env-file .env.production football-pickem
```

Deployment checklist:

- [ ] `npm run verify` passes
- [ ] `JWT_SECRET` and `SETTINGS_ENCRYPTION_KEY` set — as Secrets Manager ARNs, not literals
- [ ] `DATABASE_TYPE` correct for the target (`auto` or `dynamodb`)
- [ ] `AWS_REGION` and `DYNAMODB_TABLE_PREFIX` match the deployed tables
- [ ] DynamoDB tables and **their GSIs** created from `infrastructure/dynamodb-tables-optimized.yml` (the only complete template)
- [ ] Role has DynamoDB access — on ECS this is the **task** role, not the execution role
- [ ] Outbound internet available, or the ESPN sync silently stops
- [ ] Health check pointed at `/health`
- [ ] `CLIENT_URL` / `FRONTEND_URL` set to the real origin, for CORS
- [ ] One instance only, or the in-process scheduler runs N times over

DynamoDB tables:

```bash
aws cloudformation deploy \
  --template-file infrastructure/dynamodb-tables-optimized.yml \
  --stack-name football-pickem-tables \
  --parameter-overrides TablePrefix=football_pickem_
```

GSIs matter — the code falls back to full table scans when an index is
missing, which is correct but slow and expensive. An index can be added
later from the DynamoDB console with no downtime and no data loss; it takes
a couple of minutes to become `Active`.

### Current state: AWS App Runner

Deployed via `apprunner.yaml` using App Runner's source-based build.

**App Runner is closed to new customers.** Existing services keep working
and AWS still patches them, but there will be no new features. Migration to
ECS Express Mode is planned — see
[`plans/2026-09-06-ecs-express-migration.md`](plans/2026-09-06-ecs-express-migration.md).

Note that `scripts/start.sh`, the current container entrypoint, is a
process supervisor written for App Runner. It must not survive the move to
ECS: the shell becomes PID 1, so a dead Node process still looks like a
healthy task.

## Contributing

1. Branch from `develop`.
2. Make the change, with tests.
3. `npm run verify` — must be clean.
4. Open a PR against `develop`.

Planned and in-flight work lives in [`plans/`](plans/README.md). The known
open issues — security, correctness, architecture, and design — are indexed
in [`plans/2026-09-05-code-review.md`](plans/2026-09-05-code-review.md).

## Acknowledgments

NFL data from the public ESPN API. Team logos and marks are the property of
their respective clubs.
