#!/bin/bash
set -e

# Prevent parallel deploys
exec 9>/tmp/deploy.lock
flock -x 9

echo "$(date): Deploy başladı"

cd /var/www/printlabapp/shopify-app
git fetch origin main
git reset --hard origin/main
npm install --production=false

# Build Remix app
npx remix vite:build

# Full restart to ensure all workers run new code with updated env
pm2 restart shopify-app --update-env

echo "$(date): Deploy tamamlandı"
