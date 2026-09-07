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

### 2. Split the IAM role in two

App Runner has one instance role. ECS has two, and conflating them is the
most common migration bug — permissions look correct and calls still fail
at runtime with `AccessDeniedException`.

| Role | Used by | Needs |
|---|---|---|
| Execution role (`ecsTaskExecutionRole`) | the ECS agent | ECR pull, CloudWatch Logs, *injecting* secrets |
| Task role | application code | **DynamoDB**, Secrets Manager reads from `secretsManager.js` |

DynamoDB permissions go on the **task role**. Express Mode also wants
`ecsInfrastructureRoleForExpressServices` for provisioning.

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

### 5. Secrets

Use the `secrets` field referencing Secrets Manager ARNs — never
`environment`, which is plaintext in the ECS task definition.

This dovetails with the rotation still outstanding from
[`2026-09-05-code-review.md`](2026-09-05-code-review.md) §1.2: rotate
once, into Secrets Manager, and wire the new ARNs straight into the
Express Mode service rather than doing it twice.

### 6. Outbound internet

`server/services/espnApi.js` calls the ESPN API on a schedule. Public
subnets need `assignPublicIp`; private subnets need a NAT gateway. A task
with no egress fails quietly — scores simply stop updating.

### 7. Build and deploy pipeline

Add an ECR repository plus a GitHub Actions job to build, push, and
deploy. AWS publishes `aws-actions/amazon-ecs-deploy-express-service`,
which restores App Runner's push-to-deploy behaviour.

> **Check the region.** The old `support_docs/TODO.md` had an ECR login
> against **us-east-2**, while `apprunner.yaml` sets `AWS_REGION: us-east-1`.
> Confirm which region the DynamoDB tables actually live in before
> creating the ECR repo — ECR and the ECS service should sit in the same
> region as the tables.

## Sizing

`cpu: 0.5` / `memory: 1` maps exactly onto Fargate `512` / `1024`, which
is a valid combination. No re-tuning needed.

## Cutover

AWS recommends weighted DNS: run both services, shift Route 53 weights
10 → 25 → 50 → 75 → 100, then delete the App Runner service.

**This requires a custom domain.** With only the default
`*.awsapprunner.com` URL there is no shared hostname to weight, so the
only option is validate-then-switch. Adding a custom domain *before*
migrating is what buys the gradual, reversible path.

## Order

1. Add ECR repo + GitHub Actions build/push.
2. Switch `CMD` to run Node directly; drop `start.sh`.
3. Create the two (three) IAM roles.
4. Stand up Express Mode alongside App Runner; validate on its own URL.
5. Cut over; delete the App Runner service.
