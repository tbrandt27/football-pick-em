#!/usr/bin/env bash
#
# Reset an admin password directly in DynamoDB.
#
# Use this only when the in-app routes are unavailable — the forgot-password
# flow and the admin UI are both better, because they go through the
# application and leave an audit trail.
#
# Why the AWS console cannot do this on its own: the `password` attribute
# holds a bcrypt hash, not text, and the console has no way to produce one.
# Changing ADMIN_PASSWORD in Secrets Manager does not help either --
# databaseInitializer.js only seeds an admin when none exists with that
# email, so on an initialised database it is skipped entirely.
#
#   ./scripts/aws/reset-admin-password.sh <user-id>
#
# The password is read from a silent prompt, never an argument: an argument
# would land in shell history and in the process list, where other users on
# the machine can read it.

set -euo pipefail

USER_ID="${1:-}"
TABLE="${TABLE:-football_pickem_users}"
PROFILE="${AWS_PROFILE:-default}"
REGION="${AWS_REGION:-us-east-1}"
COST=12   # must match saltRounds in server/routes/auth.js

if [ -z "$USER_ID" ]; then
  echo "usage: $0 <user-id>" >&2
  echo >&2
  echo "Find it with:" >&2
  echo "  aws dynamodb query --table-name $TABLE --index-name is_admin-index \\" >&2
  echo "    --key-condition-expression 'is_admin = :v' \\" >&2
  echo "    --expression-attribute-values '{\":v\":{\"S\":\"true\"}}' \\" >&2
  echo "    --projection-expression 'id,email' --profile $PROFILE --region $REGION" >&2
  exit 64
fi

# Confirm the target exists, and show whose account is about to change.
EMAIL=$(aws dynamodb get-item --table-name "$TABLE" \
  --key "{\"id\":{\"S\":\"$USER_ID\"}}" \
  --projection-expression email \
  --query 'Item.email.S' --output text --profile "$PROFILE" --region "$REGION" 2>/dev/null)

if [ -z "$EMAIL" ] || [ "$EMAIL" = "None" ]; then
  echo "No user with id $USER_ID in $TABLE." >&2
  exit 1
fi

echo "About to reset the password for: $EMAIL"
printf 'Type the email to confirm: '
read -r confirm
[ "$confirm" = "$EMAIL" ] || { echo "Mismatch — aborted." >&2; exit 1; }

printf 'New password: '
read -rs pw1; echo
printf 'Confirm:      '
read -rs pw2; echo
[ "$pw1" = "$pw2" ] || { echo "Passwords do not match — aborted." >&2; exit 1; }
[ "${#pw1}" -ge 12 ] || { echo "Use at least 12 characters — aborted." >&2; exit 1; }

# Hash with the repo's own bcrypt at the same cost the app uses, so the
# resulting hash is indistinguishable from one the app would have written.
# The password reaches node on stdin, not argv.
HASH=$(printf '%s' "$pw1" | node -e '
  const bcrypt = require("bcryptjs");
  let s = "";
  process.stdin.on("data", d => s += d);
  process.stdin.on("end", async () => {
    process.stdout.write(await bcrypt.hash(s, Number(process.argv[1])));
  });
' "$COST")
unset pw1 pw2

case "$HASH" in
  '$2'*) : ;;
  *) echo "Unexpected hash format — aborted without writing." >&2; exit 1 ;;
esac

aws dynamodb update-item --table-name "$TABLE" \
  --key "{\"id\":{\"S\":\"$USER_ID\"}}" \
  --update-expression 'SET #p = :h, updated_at = :t' \
  --expression-attribute-names '{"#p":"password"}' \
  --expression-attribute-values "{\":h\":{\"S\":\"$HASH\"},\":t\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}}" \
  --condition-expression 'attribute_exists(id)' \
  --profile "$PROFILE" --region "$REGION" >/dev/null

echo "Password updated for $EMAIL."
echo
echo "Note: existing sessions keep working — JWTs are signed, not password-derived."
echo "Rotate JWT_SECRET if you need to invalidate them."
