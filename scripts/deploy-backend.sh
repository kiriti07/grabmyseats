#!/bin/bash
set -euxo pipefail
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
IMAGE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/grabmyseats-backend:latest"

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
docker build --platform linux/arm64 -t "$IMAGE" -f backend/Dockerfile .
docker push "$IMAGE"
echo "Pushed. SSM in and run: cd /opt/grabmyseats && docker-compose pull && docker-compose up -d"
