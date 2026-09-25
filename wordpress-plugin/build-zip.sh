#!/bin/bash
# WordPress.org'a / müşteriye verilecek eklenti arşivi:
#   wordpress-plugin/dist/printlab-for-woocommerce-<sürüm>.zip
# Arşivin kökünde eklenti klasörü olmalı (WordPress "Eklenti yükle" böyle açar).
set -e
cd "$(dirname "$0")"
SLUG=printlab-for-woocommerce
VERSION=$(sed -n 's/^ \* Version: *//p' "$SLUG/$SLUG.php" | tr -d '[:space:]')
mkdir -p dist
rm -f "dist/$SLUG-$VERSION.zip"
zip -rq "dist/$SLUG-$VERSION.zip" "$SLUG" -x "*.DS_Store" "*/.git*"
echo "dist/$SLUG-$VERSION.zip"
