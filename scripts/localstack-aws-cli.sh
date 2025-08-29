#!/bin/bash

# LocalStack AWS CLI helper script
# This script sets the correct environment variables and parameters for AWS CLI commands against LocalStack

LOCALSTACK_ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4566}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Set LocalStack credentials
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

# Check if command was provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <aws-cli-command>"
    echo ""
    echo "Examples:"
    echo "  $0 secretsmanager list-secrets"
    echo "  $0 dynamodb list-tables"
    echo "  $0 s3 ls"
    echo ""
    echo "This script automatically sets the correct LocalStack credentials and endpoint."
    exit 1
fi

# Execute the AWS CLI command with LocalStack configuration
aws --endpoint-url="$LOCALSTACK_ENDPOINT" --region="$AWS_REGION" "$@"