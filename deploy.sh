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

# Load env vars so pm2 picks them up via --update-env
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*) continue ;;
      *=*)
        key="${line%%=*}"
        value="${line#*=}"
        case "$key" in
          *[!A-Za-z0-9_]*|"") continue ;;
        esac
        export "$key=$value"
        ;;
    esac
  done < .env
fi

# Full restart to ensure all workers run new code and env
pm2 restart shopify-app --update-env

# WhatsApp microservice — install deps and restart (or start if first time)
if [ -d whatsapp-service ]; then
  cd whatsapp-service && npm install --production 2>&1 | tail -3 && cd ..
  if pm2 list | grep -q "wa-service"; then
    pm2 restart wa-service --update-env
  else
    pm2 start whatsapp-service/index.js --name wa-service \
      --env production \
      -o /var/log/wa-service-out.log \
      -e /var/log/wa-service-err.log
    pm2 save
  fi
fi

echo "$(date): Deploy tamamlandı"
