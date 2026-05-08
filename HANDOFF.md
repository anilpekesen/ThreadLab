# ResimApp Handoff

Bu dosya, bugune kadar yapilan degisiklikleri ve bir sonraki oturumda nereden devam edilecegini ozetler.

## 1. Hedef

Proje Shopify theme app extension + Remix admin app olarak calisiyor.

Amac:

- Shopify urun sayfalarinda tek bir tasarim araci kullanmak
- Ayni araci birden fazla urunde kullanabilmek
- Sabit 4 urun yerine sinirsiz urun desteklemek
- Her urun icin ayri:
  - urun tipi
  - yuz modu
  - baski alani
  - fiyat bantlari
  - ek ucret varyantlari
  ayari yapabilmek

## 2. Buyuk Problemler ve Cozumler

### 2.1 `trycloudflare.com baglanmayi reddetti`

Sebep:

- Shopify CLI dev tunnel URL'si kullaniyordu
- Railway production URL ile karisiyordu

Cozum:

- `shopify.app.toml` icinde dev URL override kapatildi
- production akisi Railway uzerinden sabitlendi

Dosya:

- `shopify.app.toml`

### 2.2 Railway kalicilik problemi

Sebep:

- upload ve veri dosyalari process klasorunde tutuluyordu
- deploy/restart sonrasi kayip riski vardi

Cozum:

- storage abstraction eklendi
- `APP_STORAGE_DIR` / `RAILWAY_VOLUME_MOUNT_PATH` destegi verildi

Dosyalar:

- `app/lib/storage.server.ts`
- `app/models/orders.server.ts`
- `app/models/uploads.server.ts`

### 2.3 Admin `Unexpected Server Error`

Sebep:

- Polaris componentleri `AppProvider i18n` olmadan render ediliyordu

Cozum:

- Polaris `AppProvider`
- `tr` locale eklendi

Dosya:

- `app/routes/app.tsx`

### 2.4 `/auth/login` uyarisi

Hata:

- `Detected call to shopify.authenticate.admin() from configured login path ('/auth/login')`

Sebep:

- `/auth/login` route'u `authenticate.admin()` ile cevap veriyordu

Cozum:

- `app/routes/auth.$.tsx` icinde `/auth/login` icin `shopify.login()` kullanildi

Dosya:

- `app/routes/auth.$.tsx`

### 2.5 Theme editor `Add block / Apps` icinde gorunmeme

Sebep:

- theme app extension deploy edilmemisti ya da release edilmemisti

Cozum:

- `shopify app deploy --force` calistirildi
- theme app extension release edildi

Not:

- block `product` template icin hedefli
- product template uzerinde kullanilmali

Dosyalar:

- `extensions/tshirt-designer/shopify.extension.toml`
- `extensions/tshirt-designer/blocks/tshirt-designer.liquid`

### 2.6 `Ayarlar` butonu tiklanmiyordu

Sebep:

- DataTable icinde `Link` + `Button` kombinasyonu embedded app icinde sorun cikardi

Cozum:

- dogrudan `Button url=...` kullanildi

Dosya:

- `app/routes/app.products.tsx`

## 3. Mimari Degisim: 4 Urun Yerine Sinirsiz Urun

Eski durum:

- sistem mock 4 urune gore kurguluydu
- eski `server.js` mantigi vardi

Yeni durum:

- Shopify urunleri admin API ile cekiliyor
- herhangi bir Shopify urunu "tasarim urunu" olarak ayarlanabiliyor
- storefront urun `handle`'ina gore ayari cekiyor

Yeni ana model:

- `app/models/product-config.server.ts`

Bu dosya ne yapiyor:

- Shopify urun listesini ceker
- tek urunu ceker
- urun config okur/kaydeder
- print area okur/kaydeder
- storefront icin handle bazli config bulur

## 4. Canli Calisan Yeni Ekranlar

### 4.1 Urun listesi

Dosya:

- `app/routes/app.products.tsx`

Ozellikler:

- Shopify urunlerini listeler
- arama yapar
- her urun icin:
  - durum
  - tip
  - yuz modu
  - ayarlar ekrani
  - tema editoru kisayolu

### 4.2 Urun ayar ekrani

Dosya:

- `app/routes/app.products.$productId.tsx`

Ozellikler:

- urunu aktif/pasif yapma
- urun tipi secme:
  - apparel
  - bag
  - mug
- yuz modu secme:
  - front_back
  - front_only
- baski alani editoru
- fiyat bantlari editoru
- ek ucret varyanti secimi
- urun varyantlarini referans olarak gorme

## 5. Baski Alani Editoru

Eklenen ozellik:

- urun bazli on/arka baski alani tanimlama
- canli kutu onizlemesi
- su alanlar kaydediliyor:
  - `x`
  - `y`
  - `width`
  - `height`
  - `realWidthMm`
  - `realHeightMm`
  - `safeMargin`
  - `bleedMargin`
  - `dpi`

Veri akisi:

- admin ekraninda ayarlaniyor
- `print_areas.json` icine yaziliyor
- storefront `proxy` route'u uzerinden geri okunuyor
- designer JS bu alanlari urune gore uyguluyor

Ilgili dosyalar:

- `app/routes/app.products.$productId.tsx`
- `app/models/product-config.server.ts`
- `app/routes/proxy.$.tsx`
- `extensions/tshirt-designer/assets/tshirt-app.js`

## 6. Fiyat Mantigi

Onemli:

- ana urun fiyati Shopify variant fiyatindan geliyor
- ek ucretler tasarimin kapladigi alana gore hesaplaniyor

Designer JS mantigi:

- varyant fiyatlarini okuyor
- `pricingBands` ile alan bazli surcharge hesapliyor
- `surchargeVariantMap` ile ek ucret varyantini esliyor

Ilgili dosya:

- `extensions/tshirt-designer/assets/tshirt-app.js`

## 7. Storefront Veri Akisi

Storefront tarafi su endpoint'ten veri cekiyor:

- `/apps/tshirt-designer/personalization?handle=...`

Bu route su dosyada:

- `app/routes/proxy.$.tsx`

Yaptigi sey:

- urun handle'ina gore kayitli config bulur
- `settings + printAreas + product meta` dondurur

Designer JS bunu kullanarak:

- urun tipi
- yuz modu
- baski alani
- fiyat bantlari
uygular

## 8. Shopify Admin Uygulamasi Simdi Ne Is Yapiyor

Admin app URL:

- `https://admin.shopify.com/store/whanotify-dev/apps/bikafa-tisort-tasarim/app`

Buradan su an yonetilen seyler:

- siparis ozeti
- son siparisler
- tema editoru kisayollari
- sinirsiz urun listesi
- urun bazli tasarim ayarlari

Henüz eksik olanlar:

- urun bazli ayarlar daha da sadeleştirilebilir
- varyant otomatik esleme iyilestirilebilir
- drag-and-drop baski alani editoru yok

## 9. Railway Notlari

Gerekli env:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL=https://threadlab-production.up.railway.app`
- `SCOPES=write_products,read_orders,write_app_proxy`
- `APP_STORAGE_DIR=/data`

Railway volume:

- `/data` mount edilmeli

Not:

- deploy bazen queue'da bekliyor
- `railway login` oturumu zaman zaman dusuyor

## 10. Son Yapilan Deploylar

Bu oturumda birden fazla deploy tetiklendi.

Ozellikle onemli son deploylar:

- sinirsiz urun ayarlari: `7d1224ae-c3b0-48dd-8756-7e5707438290`
- form tabanli urun ayarlari: `38a222fe-2be9-4cc3-a945-dd7335006f9c`
- baski alani editoru: `b402c93e-8a76-4f7d-a474-1b359de17e3f`
- `Ayarlar` butonu tiklama duzeltmesi: `533ca79c-a339-41c9-8aed-727f5686bce5`

Not:

- bunlarin hepsi Railway queue'ya girmis olabilir
- yeni oturumda gerekirse `railway status`, `railway deployment list`, `railway logs` ile son durum kontrol edilmeli

## 11. Bilinen Eksikler

### 11.1 Drag and drop baski alani editoru yok

Su an:

- `x/y/width/height` sayisal alanlarla duzenleniyor
- canli gorunuyor ama mouse ile suruklenmiyor

Yapilacak:

- editor kutusunu draggable + resizable yapmak

### 11.2 Urun tipi degisince varsayilan baski alani otomatik resetlenmiyor

Su an:

- manuel degistiriliyor

Yapilacak:

- `productType` degisince default overlay preset uygulanabilir

### 11.3 Pricing band satir ekle/sil yok

Su an:

- mevcut bandlar duzenlenebiliyor

Yapilacak:

- "satir ekle / sil" butonlari eklenmeli

### 11.4 Variant esleme daha iyi olabilir

Su an:

- ek ucret varyanti dropdown ile seciliyor

Yapilacak:

- print mode + size + renk mantigina gore otomatik oneriler eklenebilir

## 12. Bir Sonraki Oturumda Nereden Devam Edelim

En mantikli siralama:

1. `Ayarlar` butonunun canlida calistigini teyit et
2. urun ayar ekraninin Railway'de acildigini kontrol et
3. bir urunu aktif edip storefront'ta urun handle bazli ayarin geldiginin testi
4. drag-and-drop baski alani editoru ekle
5. fiyat bantlarina satir ekle/sil
6. urun tipi degisince otomatik preset uygula

## 13. Hangi Dosyalara Bakilmali

Ilk bakilacak ana dosyalar:

- `app/models/product-config.server.ts`
- `app/routes/app.products.tsx`
- `app/routes/app.products.$productId.tsx`
- `app/routes/proxy.$.tsx`
- `app/routes/app.tsx`
- `app/routes/auth.$.tsx`
- `extensions/tshirt-designer/blocks/tshirt-designer.liquid`
- `extensions/tshirt-designer/assets/tshirt-app.js`
- `shopify.app.toml`

