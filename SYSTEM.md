# PrintLab — Sistem ve Altyapı Dokümantasyonu

## Genel Bakış

PrintLab, Shopify mağazalarına entegre edilebilen, müşterilere t-shirt ve diğer ürünleri özelleştirme imkânı tanıyan bir Shopify embedded uygulamasıdır. Remix.js tabanlıdır ve kendi VPS sunucusunda çalışır.

---

## Sunucu Bilgileri

| Alan | Değer |
|------|-------|
| **VPS IP** | 144.91.77.39 |
| **İşletim Sistemi** | Ubuntu/Debian Linux |
| **Uygulama Dizini** | `/var/www/printlabapp/shopify-app` |
| **SSH Kullanıcısı** | `root` |
| **Node.js Versiyonu** | 20.x (LTS) |

---

## Çalışan Servisler

### 1. Node.js Uygulaması (PM2)
```
Uygulama Adı : shopify-app
Process ID   : pm2 list ile görüntüle
Port         : 3000 (dahili)
Restart Pol. : on-failure, max 10 deneme
```

PM2 komutları:
```bash
pm2 list                          # Çalışan süreçler
pm2 logs shopify-app              # Canlı log
pm2 restart shopify-app           # Yeniden başlat
pm2 restart shopify-app --update-env  # Env değişkenleriyle yeniden başlat
pm2 monit                         # İzleme paneli
```

### 2. Nginx (Ters Proxy)
```
Config Dizini : /etc/nginx/sites-available/
Public Port   : 443 (HTTPS) → localhost:3000
SSL           : Let's Encrypt / Certbot
```

Nginx reload:
```bash
nginx -t && systemctl reload nginx
```

### 3. PostgreSQL
```
Veritabanı Adı : printlabapp
Kullanıcı      : printlabapp
Şifre          : printlab2026
Host           : localhost
Port           : 5432
Bağlantı URL   : postgresql://printlabapp:printlab2026@localhost:5432/printlabapp
```

PostgreSQL komutları:
```bash
psql -U printlabapp -d printlabapp          # Bağlan
\dt                                          # Tabloları listele
SELECT COUNT(*) FROM orders;                 # Sipariş sayısı
SELECT COUNT(*) FROM designs;                # Tasarım sayısı
```

---

## Veritabanı Tabloları

| Tablo | Açıklama |
|-------|----------|
| `orders` | Shopify siparişleri, üretim durumu, tasarım token'ı |
| `designs` | Tasarım JSON'ı, önizleme ve baskı URL'leri |
| `product_settings` | Ürün başına editör konfigürasyonu |
| `product_print_areas` | Baskı alanı koordinatları (mockup ve gerçek) |
| `global_settings` | Uygulama geneli ayarlar (surcharge variant ID vb.) |

---

## Dosya Depolama — Cloudflare R2

| Alan | Değer |
|------|-------|
| **Bucket Adı** | `printlabapp-designs` |
| **Public URL** | `https://assets.printlabapp.com` |
| **Account ID** | `0b800363997475d30f1d6ceb9c5063ef` |
| **Endpoint** | `https://0b800363997475d30f1d6ceb9c5063ef.r2.cloudflarestorage.com` |

Dosya yolları:
```
Ön önizleme  : /uploads/front-preview/{hash}.png
Arka önizleme: /uploads/back-preview/{hash}.png
Ön baskı     : /uploads/front-print/{hash}.png
Arka baskı   : /uploads/back-print/{hash}.png
```

---

## Domain Yapısı

| Domain | Hedef |
|--------|-------|
| `app.printlabapp.com` | Ana Shopify uygulaması (VPS → Nginx → Node.js :3000) |
| `assets.printlabapp.com` | Cloudflare R2 CDN (tasarım görselleri, baskı dosyaları) |

---

## Uygulama Mimarisi

```
Shopify Admin
    │
    ▼
app.printlabapp.com (Nginx + SSL)
    │
    ▼
Remix.js (Node.js, PM2 yönetiminde)
    │
    ├── /app/*           → Shopify Admin Embedded (auth gerekli)
    ├── /apps/tshirt-designer/*  → Shopify App Proxy (storefront public)
    ├── /api/*           → Internal API endpoints
    ├── /privacy-policy  → Gizlilik Politikası (public)
    └── /terms-of-service → Kullanım Koşulları (public)
    │
    ├── PostgreSQL (localhost:5432)
    │       orders, designs, product_settings, print_areas
    │
    └── Cloudflare R2
            tasarım önizlemeleri, baskı dosyaları
```

---

## Deploy Süreci

### Otomatik Deploy (GitHub Actions)
Her `main` branch push'unda tetiklenir:

```yaml
# .github/workflows/deploy.yml
# 1. sshpass ile VPS'e SSH bağlantısı
# 2. /var/www/printlabapp/shopify-app/deploy.sh çalıştırılır
```

### deploy.sh Adımları
```bash
cd /var/www/printlabapp/shopify-app
git fetch origin main
git reset --hard origin/main
npm install --production=false
npm run build --workspace designer-ui   # React designer UI
npx remix vite:build                    # Remix app build
pm2 restart shopify-app --update-env
```

### GitHub Secret
```
Secret Adı : VPS_PASSWORD
Değer      : VPS root şifresi
Ayar Yeri  : GitHub Repo → Settings → Secrets → Actions
```

### Manuel Deploy
```bash
ssh root@144.91.77.39
cd /var/www/printlabapp/shopify-app
bash deploy.sh
```

---

## Shopify Uygulama Yapılandırması

| Alan | Değer |
|------|-------|
| **App URL** | `https://app.printlabapp.com` |
| **App Proxy Prefix** | `apps/tshirt-designer` |
| **App Proxy URL** | `https://app.printlabapp.com/proxy` |
| **Webhook API Versiyonu** | 2024-10 |

### Gerekli Shopify Kapsamları
```
read_products, write_products
read_orders
write_app_proxy
write_cart_transforms
write_script_tags
```

---

## Environment Variables (.env)

```env
# Shopify
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SCOPES=read_products,write_products,...

# Veritabanı
DATABASE_URL=postgresql://printlabapp:printlab2026@localhost:5432/printlabapp

# Cloudflare R2
R2_ACCOUNT_ID=0b800363997475d30f1d6ceb9c5063ef
R2_ENDPOINT=https://0b800363997475d30f1d6ceb9c5063ef.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=printlabapp-designs
R2_PUBLIC_URL=https://assets.printlabapp.com

# Opsiyonel
PHOTOROOM_API_KEY=...    # Arka plan kaldırma özelliği için
```

---

## Özellik Listesi

### Admin Panel (`/app/*`)
- **Siparişler:** Tüm tasarımlı siparişlerin listesi, durum takibi (Bekliyor → Hazırlanıyor → Basıldı → Hazır → Gönderildi)
- **Sipariş Detayı:** Ön/arka önizleme, baskı dosyası indirme, yazı/görsel detayları (font, renk, boyut), müşteri linki
- **Ürün Ayarları:** Baskı alanı koordinatları, fiyat bantları, surcharge variant seçimi
- **Global Ayarlar:** Varsayılan surcharge variant ID

### Storefront (Müşteri Tarafı)
- **Tasarım Editörü:** Fabric.js tabanlı interaktif canvas (ön/arka yüz)
- **Görseller:** Yükleme, kırpma, döndürme, yeniden boyutlandırma
- **Metin:** Font seçimi, renk, boyut, hizalama
- **Arka Plan Kaldırma:** Photoroom API entegrasyonu (isteğe bağlı)
- **Müşteri Tasarım Sayfası:** `/apps/tshirt-designer/my-order?token=...`

### Shopify Entegrasyonu
- **Cart Transform Function:** Tasarım bilgisi içeren sepet satırlarını genişletir
- **Web Pixel:** Checkout sonrası sipariş verisi alımı
- **App Proxy:** Public storefront API endpoint'leri

---

## Bakım ve İzleme

### Log Takibi
```bash
pm2 logs shopify-app --lines 100    # Son 100 log satırı
pm2 logs shopify-app --err          # Sadece hata logları
journalctl -u nginx -f              # Nginx logları
```

### Veritabanı Yedekleme
```bash
pg_dump -U printlabapp printlabapp > backup_$(date +%Y%m%d).sql
```

### Disk Kullanımı
```bash
df -h                               # Disk doluluk oranı
du -sh /var/www/printlabapp/        # Uygulama boyutu
```

### SSL Sertifikası Yenileme
```bash
certbot renew --dry-run             # Test
certbot renew                       # Gerçek yenileme
```

---

## Sorun Giderme

### Uygulama Yanıt Vermiyor
```bash
pm2 restart shopify-app
pm2 logs shopify-app --lines 50
```

### Veritabanı Bağlantı Hatası
```bash
systemctl status postgresql
systemctl restart postgresql
psql -U printlabapp -d printlabapp -c "SELECT 1;"
```

### Deploy Başarısız
1. GitHub Actions → son workflow run'ı kontrol et
2. `VPS_PASSWORD` secret'ının doğruluğunu kontrol et
3. VPS'e manuel SSH ile bağlan, `deploy.sh` loglarını incele

### R2 Yükleme Sorunu
- `.env` içinde `R2_*` değişkenlerini kontrol et
- Cloudflare dashboard → R2 → bucket erişim politikasını kontrol et

---

*Bu doküman en son 15 Mayıs 2025 tarihinde güncellenmiştir.*
