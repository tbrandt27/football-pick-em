#!/usr/bin/env bash
#
# Pre-flight the GitHub Actions deploy role WITHOUT running a deployment.
#
# Every permission gap in the ECS Express migration was found the expensive
# way: push a commit, dispatch the workflow, wait for the build, read the
# AccessDenied. Three round trips. iam simulate-principal-policy answers the
# same question in seconds and needs no deploy, no image, and no commit.
#
# Run this after ANY change to the deploy role's policy, before dispatching.
#
#   ./scripts/aws/verify-deploy-permissions.sh
#
# Exits non-zero if anything the deploy needs would be denied.

set -uo pipefail

PROFILE="${AWS_PROFILE:-default}"
REGION="${AWS_REGION:-us-east-1}"
SERVICE="${SERVICE_NAME:-football-pickem}"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text --profile "$PROFILE" 2>/dev/null) || {
  echo "Cannot reach AWS with profile '$PROFILE'. Reauthenticate, then re-run." >&2
  exit 2
}

ROLE="arn:aws:iam::${ACCOUNT}:role/${SERVICE}-github-deploy"
SVC_ARN="arn:aws:ecs:${REGION}:${ACCOUNT}:service/${SERVICE}/${SERVICE}"
ECR_ARN="arn:aws:ecr:${REGION}:${ACCOUNT}:repository/${SERVICE}"

echo "role   : $ROLE"
echo "region : $REGION"
echo

fails=0

check() { # action, resource-arn (optional), label
  local action="$1" resource="${2:-}" label="${3:-$1}"
  local out
  if [ -n "$resource" ]; then
    out=$(aws iam simulate-principal-policy --policy-source-arn "$ROLE" \
      --action-names "$action" --resource-arns "$resource" \
      --query 'EvaluationResults[0].EvalDecision' --output text \
      --profile "$PROFILE" 2>&1)
  else
    out=$(aws iam simulate-principal-policy --policy-source-arn "$ROLE" \
      --action-names "$action" \
      --query 'EvaluationResults[0].EvalDecision' --output text \
      --profile "$PROFILE" 2>&1)
  fi
  if [ "$out" = "allowed" ]; then
    printf '  \033[32mallow\033[0m  %s\n' "$label"
  else
    printf '  \033[31mDENY \033[0m  %-46s (%s)\n' "$label" "$out"
    fails=$((fails+1))
  fi
}

# AWS's documented required set for an Express Mode caller. Do not prune this
# list by reading the action's source -- Express Mode does server-side work
# under the caller's identity, so the caller needs permissions for calls the
# action never makes itself. ecs:RegisterTaskDefinition is the example: it was
# removed on exactly that bad reasoning and broke the deploy.
echo "ECS Express (AWS-documented caller permissions)"
for a in CreateCluster DescribeClusters RegisterTaskDefinition \
         CreateExpressGatewayService UpdateExpressGatewayService \
         DescribeExpressGatewayService DescribeServices UpdateService \
         ListServiceDeployments DescribeServiceDeployments \
         TagResource UntagResource; do
  check "ecs:$a" "" "ecs:$a"
done

echo
echo "ECR (build and push)"
check ecr:GetAuthorizationToken "" "ecr:GetAuthorizationToken"
for a in BatchCheckLayerAvailability InitiateLayerUpload UploadLayerPart \
         CompleteLayerUpload PutImage BatchGetImage GetDownloadUrlForLayer; do
  check "ecr:$a" "$ECR_ARN" "ecr:$a"
done

# PassRole is simulated with NO context key, because that is what
# CreateExpressGatewayService actually sends. A StringEquals condition on
# iam:PassedToService evaluates false against an absent key and fails closed --
# which is why the condition is StringEqualsIfExists. Simulating WITH the key
# hides that bug.
echo
echo "PassRole (no context key — as the real API call arrives)"
for r in ecs-execution ecs-task ecs-infrastructure; do
  check iam:PassRole "arn:aws:iam::${ACCOUNT}:role/${SERVICE}-${r}" "iam:PassRole -> ${SERVICE}-${r}"
done

echo
echo "Negative checks (these MUST be denied)"
neg() {
  local action="$1" resource="$2" label="$3" out
  out=$(aws iam simulate-principal-policy --policy-source-arn "$ROLE" \
    --action-names "$action" --resource-arns "$resource" \
    --query 'EvaluationResults[0].EvalDecision' --output text --profile "$PROFILE" 2>&1)
  if [ "$out" = "allowed" ]; then
    printf '  \033[31mALLOWED\033[0m  %-44s (expected deny)\n' "$label"
    fails=$((fails+1))
  else
    printf '  \033[32mdenied\033[0m   %s\n' "$label"
  fi
}
neg secretsmanager:GetSecretValue \
    "arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:football-pickem/jwt-secret-vkSzBv" \
    "CI cannot read application secrets"
neg iam:PassRole "arn:aws:iam::${ACCOUNT}:role/apprunner_footballpickem" \
    "PassRole limited to the three ECS roles"
neg dynamodb:DeleteTable "arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/football_pickem_picks" \
    "CI cannot touch application data"

# The RUNTIME role. Verifying only the deploy role is what let a missing
# dynamodb permission through: CI deployed cleanly and the container then died
# on startup with AccessDeniedException. The deploy role and the task role fail
# at completely different times, so both need checking.
#
# NOTE: this does not cover the execution role's secret-injection grants. A
# local tooling guard blocks scripting that action name, so check those by hand:
#   aws iam simulate-principal-policy \
#     --policy-source-arn arn:aws:iam::ACCT:role/football-pickem-ecs-execution \
#     --action-names 'secretsmanager:GetSecretValue' --resource-arns <secret-arn>
echo
echo "Task role (application runtime)"
TASK="arn:aws:iam::${ACCOUNT}:role/${SERVICE}-ecs-task"
TBL="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/football_pickem_users"
for a in GetItem BatchGetItem Query Scan PutItem UpdateItem DeleteItem BatchWriteItem DescribeTable; do
  out=$(aws iam simulate-principal-policy --policy-source-arn "$TASK" \
    --action-names "dynamodb:$a" --resource-arns "$TBL" \
    --query 'EvaluationResults[0].EvalDecision' --output text --profile "$PROFILE" 2>&1)
  if [ "$out" = "allowed" ]; then printf '  \033[32mallow\033[0m  dynamodb:%s\n' "$a"
  else printf '  \033[31mDENY \033[0m  dynamodb:%-38s (%s)\n' "$a" "$out"; fails=$((fails+1)); fi
done

# GSI reads are a separate resource ARN from the table itself. Every hot path
# queries an index, so a policy covering only table/* would fail at runtime.
out=$(aws iam simulate-principal-policy --policy-source-arn "$TASK" \
  --action-names dynamodb:Query \
  --resource-arns "${TBL}/index/is_admin-index" \
  --query 'EvaluationResults[0].EvalDecision' --output text --profile "$PROFILE" 2>&1)
if [ "$out" = "allowed" ]; then printf '  \033[32mallow\033[0m  dynamodb:Query on a GSI\n'
else printf '  \033[31mDENY \033[0m  dynamodb:Query on a GSI (%s)\n' "$out"; fails=$((fails+1)); fi

# ListTables is intentionally NOT granted: it cannot be resource-scoped, so it
# would let this role enumerate every table in the account.
# DynamoDBProvider._testConnection uses DescribeTable instead.
neg dynamodb:ListTables "arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/*" \
    "task role cannot list all tables"
neg dynamodb:DeleteTable "arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/football_pickem_picks" \
    "task role cannot drop tables"

echo
if [ "$fails" -eq 0 ]; then
  echo "PASS — deploy and task roles both have what they need."
  exit 0
fi
echo "FAIL — $fails problem(s). Fix infrastructure/deploy-stack.yml and redeploy the"
echo "stack before dispatching the workflow; a dispatch will fail the same way."
exit 1
