#!/bin/bash
set -e

# Prevent parallel deploys
exec 9>/tmp/deploy.lock
flock -x 9

cd /var/www/printlabapp/shopify-app
git fetch origin main
git reset --hard origin/main
npm install --production=false
npm run build --workspace designer-ui
npx remix vite:build

# Retry pm2 reload if another reload is in progress
for i in 1 2 3; do
  if pm2 reload ecosystem.config.cjs --update-env 2>&1; then
    break
  fi
  echo "pm2 reload attempt $i failed, retrying in 35s..."
  sleep 35
done

echo 'Deploy tamamlandı'
