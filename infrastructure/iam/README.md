# IAM for the ECS Express deployment

> **`../deploy-stack.yml` is authoritative.** These JSON documents are now
> reference material — they explain *why* each condition is shaped the way
> it is, which a template diff does not. Deploy the stack; do not apply
> these by hand. If you change one, change the template too.

The account is `137830278828` / `us-east-1`, hard-coded in the ARNs below.
The template derives them from `AWS::AccountId` and `AWS::Region` instead.

## Why four roles, not one

App Runner had a single instance role. ECS splits the job, and conflating
the parts is a privilege-escalation bug rather than a tidiness problem:

The stack also creates the ECS **cluster**. The deploy action contains no
`CreateCluster` call — it fails with `ClusterNotFoundException` — and this
account had no clusters at all, not even `default`. Creating it in
CloudFormation keeps `ecs:CreateCluster` off the deploy role.

| Role | Assumed by | Purpose |
|---|---|---|
| `football-pickem-github-deploy` | GitHub Actions, via OIDC | push to ECR, update the service |
| `football-pickem-ecs-execution` | the ECS agent | pull the image, write logs, **inject** secrets |
| `football-pickem-ecs-task` | application code | DynamoDB, Secrets Manager reads |
| `football-pickem-ecs-infrastructure` | ECS Express Mode | create/manage the ALB, target groups, autoscaling |

The distinction that matters most: the **execution** role reads
`JWT_SECRET` so the agent can place it in the container environment, and
the **task** role is what `secretsManager.js` and the DynamoDB providers
use at runtime. CI holds neither. A deploy pipeline has no business
reading application secrets or writing to the users table.

## Files

| File | Attach to |
|---|---|
| `github-deploy-trust-policy.json` | trust relationship of `football-pickem-github-deploy` |
| `github-deploy-permissions-policy.json` | inline policy on the same role |
| `ecs-execution-permissions-policy.json` | inline policy on `football-pickem-ecs-execution`, **alongside** the AWS-managed `AmazonECSTaskExecutionRolePolicy` |
| `ecs-task-permissions-policy.json` | inline policy on `football-pickem-ecs-task` |

The execution and task roles both trust `ecs-tasks.amazonaws.com`; the
infrastructure role trusts `ecs.amazonaws.com`. All three add an
`aws:SourceAccount` condition against the confused-deputy problem.

The infrastructure role has no policy here — it takes the AWS-managed
`AmazonECSInfrastructureRoleforExpressGatewayServices`. Note that this is
**not** `AmazonECSInfrastructureRolePolicyForLoadBalancers`, which an
earlier draft of this file named: the load-balancer policy covers ELB and
security groups but omits the `application-autoscaling` and CloudWatch
alarm permissions that Express Mode needs for the scaling target the
workflow configures.

## The two conditions that carry the security

Both live in `github-deploy-*.json` and are easy to loosen by accident.

**1. The OIDC `sub` is pinned with `StringEquals`.**

```
repo:tbrandt27/football-pick-em:environment:production
```

The repository is public, so this string is the boundary between "our
`main` branch deploys" and "anyone who can get a workflow to run in this
repository deploys". Two ways it commonly goes wrong:

- `StringLike` with `repo:tbrandt27/football-pick-em:*` matches every
  branch, tag, and pull-request context. It is not a scope; it is the
  whole repository.
- Pinning `ref:refs/heads/main` instead of `environment:production` works,
  but it moves the gate to the branch alone. Binding to the environment
  means GitHub's environment rules — required reviewer, deployment branch
  limited to `main` — decide whether a token is issued at all.

Omitting the `aud` condition allows a token minted for another audience to
be replayed, so keep both keys.

**2. `iam:PassRole` is pinned to three exact ARNs.**

Unrestricted `PassRole` would let the deploy role register a task
definition that runs *any* role in the account and then read that role's
credentials out of the container. That single wildcard converts "can
deploy this app" into "is an account administrator". The
`iam:PassedToService` condition narrows it further, so the roles can only
be handed to ECS.

## One-time setup

Deploy the stack; it creates the ECR repository, the OIDC provider, and all
four roles.

```bash
aws cloudformation deploy --template-file infrastructure/deploy-stack.yml --stack-name football-pickem-deploy --capabilities CAPABILITY_NAMED_IAM --parameter-overrides JwtSecretArn=arn:aws:secretsmanager:us-east-1:137830278828:secret:football-pickem/jwt-secret-vkSzBv
```

`CAPABILITY_NAMED_IAM` is required because the roles use fixed names that
`.github/workflows/deploy.yml` references. Pass
`CreateOidcProvider=false` if the account already has the GitHub provider —
it is account-wide, so only one can exist.

**Deployed 2026-09-07** as stack `football-pickem-deploy`
(`UPDATE_COMPLETE`). Verified after execution: the OIDC subject resolved to
`repo:tbrandt27/football-pick-em:environment:production` with `StringEquals`
as the only operator, `iam:PassRole` pinned to the three role ARNs with no
wildcard, ECR `IMMUTABLE` with both lifecycle rules applied, and the cluster
`ACTIVE` with `containerInsights: enabled`.

The deploy role cannot yet be assumed by anything: the `production`
environment does not exist in the repository, so no GitHub token can carry
that subject.

### Equivalent manual commands

Kept for reference only, and only if you are deliberately bypassing
CloudFormation. The OIDC provider is account-wide; create it only if absent.

```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

AWS no longer validates that thumbprint for this provider — it verifies
GitHub's certificate against a trusted root CA — but the API still
requires the argument.

Then the deploy role:

```bash
aws iam create-role --role-name football-pickem-github-deploy --assume-role-policy-document file://infrastructure/iam/github-deploy-trust-policy.json
```

```bash
aws iam put-role-policy --role-name football-pickem-github-deploy --policy-name deploy --policy-document file://infrastructure/iam/github-deploy-permissions-policy.json
```

The ECR repository must exist before the first deploy; Express Mode
creates the service, but nothing creates the registry.

```bash
aws ecr create-repository --repository-name football-pickem --image-tag-mutability IMMUTABLE
```

`IMMUTABLE` is deliberate. The workflow tags by commit SHA, so a tag
should never be reassigned; immutability makes "which commit is running"
answerable.

## Why a separate stack

`deploy-stack.yml` is not folded into `football-pickem-dynamodb`, which has
been live since 2025-08-22. That stack owns ten tables of production data
and sets **no `DeletionPolicy` on any of them**, so a failed
`UPDATE_ROLLBACK` there is a data risk rather than an inconvenience.
Pipeline IAM changes with every deploy iteration; tables should not change
at all. Separating them means a bad IAM edit can only roll back IAM.

Adding `DeletionPolicy: Retain` to the ten tables is worth doing on its own,
independently of this migration.

## GitHub side

Repository settings, none of which live in this file:

- Environment `production`, with a required reviewer and deployment
  branches limited to `main`. **The trust policy is inert without it** —
  no environment means no `environment:production` subject, so the role
  cannot be assumed at all.
- Repository variable or secret `AWS_ACCOUNT_ID` = `137830278828`. It is
  not a credential; it is a secret here only to keep it out of public
  logs, and the account ID is already published in
  `plans/2026-09-05-code-review.md:308`.
- Branch protection on `main`: require a pull request and the `verify`
  check, and disallow force-pushes.
- Actions → "Fork pull request workflows from outside collaborators" set
  to **require approval for all external contributors**. The default only
  gates first-time contributors.
- Actions → workflow permissions: read-only by default.
- Secret scanning and push protection enabled.

## Rotating `JWT_SECRET`

Rotated 2026-09-07 after the previous value was found in public git
history at `1e3d1a0`. Rotation invalidates every live session, which is
the point. `infrastructure/iam/ecs-execution-permissions-policy.json`
grants the secret by full ARN including the `-vkSzBv` suffix; a
*replacement* secret gets a new suffix, so prefer updating the value in
place over deleting and recreating, or the execution role silently loses
access and tasks fail to start.
