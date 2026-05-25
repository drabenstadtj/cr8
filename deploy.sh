#!/usr/bin/env bash
set -e

GHCR_USER="drabenstadtj"
IMAGE_BACKEND="ghcr.io/$GHCR_USER/cr8-backend"
IMAGE_FRONTEND="ghcr.io/$GHCR_USER/cr8-frontend"

# Required env vars
: "${SSH_USER:?Set SSH_USER}"
: "${SSH_HOST:?Set SSH_HOST}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH}"

echo "→ Building images..."
docker build -t "$IMAGE_BACKEND:dev" ./cr8/backend
docker build -t "$IMAGE_FRONTEND:dev" ./cr8/frontend

echo "→ Pushing to GHCR..."
docker push "$IMAGE_BACKEND:dev"
docker push "$IMAGE_FRONTEND:dev"

echo "→ Deploying on $SSH_HOST..."
ssh "$SSH_USER@$SSH_HOST" "
  cd $DEPLOY_PATH
  CR8_TAG=dev docker compose pull cr8-backend cr8-frontend
  CR8_TAG=dev docker compose up -d cr8-backend cr8-frontend
"

echo "✓ Done"
