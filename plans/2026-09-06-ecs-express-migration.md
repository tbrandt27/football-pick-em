# Migrate off AWS App Runner to ECS Express Mode

**Status:** Planned

## Why

AWS App Runner is [closed to new customers](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html).
Existing customers can continue as normal, including creating new
resources, and AWS still invests in security and availability — but there
will be **no new features**, and no end-of-life date has been announced.

So nothing is urgent. But the platform is terminal, and AWS points
existing customers at **ECS Express Mode** as the migration path: one API
call provisions an ECS service on Fargate, an ALB, auto scaling, and
networking.

Background and evidence: [`2026-09-05-code-review.md`](2026-09-05-code-review.md) §8.

## Prerequisite: already done

ECS Express Mode deploys **container images**. `apprunner.yaml` currently
uses App Runner's *source-based* build (`runtime: nodejs22` plus
`build.commands`), which AWS calls out as the one structural difference
for source-based services.

The multi-stage `Dockerfile` merged in #6 is that missing piece. Before
that PR it was single-stage and ran `npm ci --only=production` *before*
`npm run build`, which only worked because every build tool was
mis-declared as a runtime dependency.

## Work

### 1. Retire `scripts/start.sh`

It is a process supervisor: background-launches Node, polls `/health`
every 60s, watches RSS against `MEMORY_LIMIT_MB`, restarts up to
`MAX_RESTARTS`. Reasonable on App Runner; **harmful on ECS**.

The shell becomes PID 1, so when Node dies ECS still sees a live task and
will not replace it. That forfeits the deployment circuit breaker,
task-level restarts, and honest exit codes, and leaves a task that looks
healthy to ECS while serving nothing.

- Change `CMD ["./scripts/start.sh"]` to `CMD ["node", "server/index.js"]`
  so Node is PID 1 and receives `SIGTERM` directly. `server/index.js`
  already has a working `gracefulShutdown` handler.
- Let ECS supervise: `healthCheckGracePeriodSeconds`, circuit breaker with
  rollback, and auto scaling cover everything the script hand-rolled.
- The only logic worth porting is the SQLite init branch, which is dead in
  production anyway (`DATABASE_TYPE: auto` resolves to DynamoDB).

### 2. Split the one role into four **[done]**

App Runner has a single instance role. ECS splits the job, and conflating
the parts is the most common migration bug — permissions look correct and
calls still fail at runtime with `AccessDeniedException`. In the event it
was four roles rather than the two this section originally assumed, all
created by `infrastructure/deploy-stack.yml`:

| Role | Assumed by | Needs |
|---|---|---|
| `football-pickem-github-deploy` | GitHub Actions, via OIDC | ECR push, `ecs:UpdateService`, `iam:PassRole` to the three below |
| `football-pickem-ecs-execution` | the ECS agent | ECR pull, CloudWatch Logs, *injecting* secrets |
| `football-pickem-ecs-task` | application code | **DynamoDB**, Secrets Manager reads from `secretsManager.js` |
| `football-pickem-ecs-infrastructure` | ECS Express Mode | provisioning the ALB, target groups, autoscaling, alarms |

DynamoDB permissions go on the **task role**, never the execution role. The
deploy role holds neither — a pipeline has no business reading application
secrets or writing to the users table.

`iam:PassRole` on the deploy role is pinned to those three exact ARNs with
an `iam:PassedToService` condition. A wildcard there would let the pipeline
register a task definition running any role in the account and read its
credentials out of the container — turning "can deploy this app" into "can
administer this account". This repository is public, so that pin and the
OIDC `sub` condition are the whole security boundary.

### 3. Health check path

Point the ALB target group at **`/health`**, not `/api/health/live`.
Everything under `/api/health` except the index passes through
`requireHealthAccess`, which returns 404 in production unless
`ENABLE_DETAILED_HEALTH=true`. The `Dockerfile` `HEALTHCHECK` was fixed in
#6; the ALB target group needs the same path. Getting this wrong is the
classic "service never stabilises" ECS failure.

### 4. Pin to one task until the scheduler moves out

`server/services/scheduler.js` runs `node-cron` **in process**. Scaling
past one task means every task runs the scheduler, so ESPN score syncs and
pick calculations execute N times concurrently. App Runner's single
instance hid this.

Start with `minTaskCount: 1, maxTaskCount: 1`. To scale beyond that, move
the scheduler to an EventBridge rule that hits an authenticated endpoint,
or to a separate single-task service.

### 5. Secrets and environment **[blocking — the pipeline is short four]**

Use the `secrets` field referencing Secrets Manager ARNs — never
`environment`, which is plaintext in the ECS task definition.

`deploy.yml` currently injects **only `JWT_SECRET`**. Compared against what
the live App Runner service actually sets (read from `describe-service` on
2026-09-08), four are missing:

| Variable | App Runner | `deploy.yml` | Effect if absent |
|---|---|---|---|
| `SETTINGS_ENCRYPTION_KEY` | secret | **missing** | `configService.js:101` sets no fallback when `NODE_ENV=production`, so config resolution fails and the app enters **degraded mode** with an *ephemeral* `JWT_SECRET` from `randomBytes(48)`. Every session invalidated, nobody can log in, and SMTP settings encrypted under the real key become unreadable. |
| `ADMIN_EMAIL` | secret | **missing** | No admin seeded on first boot. |
| `ADMIN_PASSWORD` | secret | **missing** | Same; `configService` deliberately refuses a fallback here, on the grounds that seeding a known password is worse than seeding nothing. |
| `FRONTEND_URL` | env | **missing** | `index.js:185` falls back to `http://localhost:4321` as the CORS origin, so the browser blocks every API call from the real domain. |

`CLIENT_URL` and `PORT` are also set on App Runner; `PORT` is covered by the
Dockerfile's `ENV PORT=8080`.

Only `football-pickem/jwt-secret` exists in Secrets Manager today, so the
three missing secrets need creating there **and** a grant on the execution
role — `deploy-stack.yml` pins that role to the single jwt-secret ARN, so
widening it to the `football-pickem/*` prefix (or listing each ARN) is part
of this step.

Because of this gap the `push:` trigger in `.github/workflows/deploy.yml`
is **commented out**. Left enabled, the next merge to `main` would stand up
an Express service that boots into degraded mode. Re-enable it only once
the table above is closed out.

This also dovetails with the rotation outstanding from
[`2026-09-05-code-review.md`](2026-09-05-code-review.md) §1.2: rotate
once, into Secrets Manager, and wire the new ARNs straight into the
Express Mode service rather than doing it twice. `JWT_SECRET` itself was
rotated on 2026-09-07. Note that a secret's ARN carries a random suffix
which changes if it is deleted and recreated rather than updated in place —
recreating one silently breaks the execution role's grant and tasks then
fail to start.

### 6. Outbound internet

`server/services/espnApi.js` calls the ESPN API on a schedule. Public
subnets need `assignPublicIp`; private subnets need a NAT gateway. A task
with no egress fails quietly — scores simply stop updating.

### 7. Build and deploy pipeline **[done, except the trigger]**

`infrastructure/deploy-stack.yml` creates the ECR repository, the ECS
cluster, the GitHub OIDC provider and all four roles; applied 2026-09-08.
`.github/workflows/deploy.yml` builds, pushes and deploys via
`aws-actions/amazon-ecs-deploy-express-service`.

Two things the action's own `action.yml` settled, neither of which was
obvious from the docs:

- **`infrastructure-role-arn` is required**, so it is four roles, not the
  three §2 anticipated. It takes the AWS-managed
  `AmazonECSInfrastructureRoleforExpressGatewayServices` — *not*
  `...RolePolicyForLoadBalancers`, which omits the
  `application-autoscaling` and CloudWatch-alarm permissions the scaling
  target needs.
- **The action never creates a cluster.** It has no `CreateCluster` call and
  fails with `ClusterNotFoundException`; the account had no clusters at all,
  not even `default`. The cluster is therefore in `deploy-stack.yml`, which
  also keeps `ecs:CreateCluster` off the deploy role.

Express Mode defaults `health-check-path` to `/ping`, which this app does
not serve — see §3.

The `push:` trigger is commented out pending §5. `workflow_dispatch`
remains, which is how to validate Express Mode on its own URL per step 4 of
the order below.

Authorisation needs no stored credential: the job requests an OIDC token,
`configure-aws-credentials` exchanges it via
`sts:AssumeRoleWithWebIdentity`, and the trust policy pins
`sub` to `repo:tbrandt27/football-pick-em:environment:production` with
`StringEquals`. The `AWS_ACCOUNT_ID` environment secret exists only to
build the role ARN — it is not a credential.

> **Region: `us-east-1`** (confirmed 2026-09-07). Create the ECR repository
> and the ECS Express service there, alongside the DynamoDB tables. An old
> `support_docs/TODO.md` note had an ECR login against us-east-2; disregard
> it. `apprunner.yaml` already sets `AWS_REGION: us-east-1`.

## Sizing

`cpu: 0.5` / `memory: 1` maps exactly onto Fargate `512` / `1024`, which
is a valid combination. No re-tuning needed.

## Cutover

**Correction (2026-09-08): the custom domain already exists.** An earlier
draft of this section assumed only the default `*.awsapprunner.com`
hostname and concluded that validate-then-switch was the only option.
`describe-custom-domains` shows `pickem.bisforbrandt.com` **active** on the
App Runner service, and both `CLIENT_URL` and `FRONTEND_URL` are set to it,
so users never touch the AWS-generated hostname. That is the shared
hostname a cutover needs.

AWS recommends weighted DNS: run both services and shift weights
10 → 25 → 50 → 75 → 100, then delete the App Runner service.

**But there is no Route 53 hosted zone in this account** — DNS for
`bisforbrandt.com` is managed externally. So weighted routing is only
available if that provider supports weighted records, which most
registrars' basic DNS does not. Two realistic options:

| Approach | Cutover | Rollback |
|---|---|---|
| Repoint the CNAME at the ALB | single DNS edit | edit it back; bounded by TTL |
| Delegate the subdomain to Route 53 first | enables true weighted shifting | weight back to 0 |

Lower the record's TTL to 60s *a day before* either one — a 3600s TTL
turns a rollback into an hour of split traffic. Check the current TTL at
the provider, since it is not visible from AWS.

Note the ECS Express service must serve the same hostname for CORS to keep
working: `FRONTEND_URL` has to be `https://pickem.bisforbrandt.com`.

### How Express Mode handles custom domains

Confirmed against the AWS docs and the CLI on 2026-09-08.

Express Mode terminates **HTTPS automatically on its own generated URL**,
with an AWS-provided ACM certificate it manages. A custom domain is a
different matter: **the Express Mode API has no domain or certificate
parameter at all.** `aws ecs create-express-gateway-service` accepts only
execution/infrastructure/task roles, primary container, network config,
cpu/memory, scaling target, health-check path, tags and monitoring — and
`aws-actions/amazon-ecs-deploy-express-service` exposes the same set. So the
domain cannot be configured through the deploy workflow.

It is done **outside** Express Mode, on the ALB it created:

1. Cluster → service → **Resources** tab → the listener rule → Edit.
2. Copy the existing Host header value (the Express application URL), then
   **remove the rule** — there can only be one condition of each type.
3. Re-add a Host header condition with the Express URL, then
   **Add OR condition value** and enter `pickem.bisforbrandt.com`. Missing
   this step is how you end up serving one hostname and 404-ing the other.
4. On the ALB listener's **Certificates** tab, add an ACM certificate for
   the custom domain. It must live in **us-east-1**, the ALB's region.
5. Point DNS at the ALB.

**DNS: we have no Route 53 hosted zone.** The AWS procedure assumes one and
uses an Alias record. The docs cover our case explicitly: *"If your domain
is hosted elsewhere, you will need a CNAME to point to the Application Load
Balancer DNS record."* So cutover is a CNAME at the external provider, and
an Alias-record apex is not available to us. Certificate validation will
also need a CNAME added there.

### The risk this introduces

Express Mode's responsibility model is explicit that it *"does not validate
whether resource modifications using direct APIs will conflict"* and *"will
not overwrite changes unless requested as part of an Express Mode update"*.
The docs give a concrete conflict example: passing a new log group reverts a
manually changed `logDriver`.

Our `deploy.yml` calls the Express Mode update on **every deploy**, and the
custom domain lives in a hand-edited listener rule. Whether a routine
update re-asserts that rule and drops the OR condition is not documented
either way. **Test it during validation**: add the domain, run a second
`workflow_dispatch`, and check the rule still carries both hostnames. If it
does not, the domain has to move into whatever declares the service —
`AWS::ECS::ExpressGatewayService` exists as a CloudFormation resource, which
would let `deploy-stack.yml` own the service and leave CI to build and push
the image only.

## Order

1. ~~Add ECR repo + GitHub Actions build/push.~~ **done** (2026-09-08)
2. ~~Create the IAM roles.~~ **done** — four, not three, plus the cluster
3. **Wire the four missing secrets and env vars** (§5). Blocks everything
   below; until it is done the `push:` trigger stays commented out.
4. Switch `CMD` to run Node directly; drop `start.sh`.
5. Stand up Express Mode alongside App Runner via `workflow_dispatch`;
   validate on its own URL.
6. Re-enable the `push:` trigger.
7. Cut over; delete the App Runner service.

> **Not a blocker for the security fix.** App Runner deploys from `main`
> with `AutoDeploymentsEnabled: false`, so merging `develop` to `main`
> deploys nothing by itself — production is updated with
> `aws apprunner start-deployment`. Ship the §1.1 privilege-escalation fix
> that way rather than coupling it to this migration.
