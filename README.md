# Shopify Tisort Tasarim Araci

Bu klasor Shopify urun sayfasina gomulebilen basit bir tisort tasarim araci icerir.

## Dosyalar

- `index.html`: Lokal demo.
- `styles.css`: Arayuz stilleri.
- `app.js`: On/arka tasarim, fiyat modu ve Shopify sepete ekleme mantigi.
- `shopify-snippet.liquid`: Shopify tema snippet baslangici.
- `upload.php`: Lokal/PHP gorsel yukleme endpoint'i.
- `shopify.app.toml`: Shopify app konfigurasyonu.
- `shopify.web.toml`: Shopify CLI web process konfigurasyonu.
- `server.js`: App proxy upload backend'i.
- `extensions/tshirt-designer`: Shopify Theme App Extension.

## Fiyat farki nasil calisir?

Shopify line item property ile urun fiyatini degistirmez. Bu yuzden fiyat farki icin urunde iki variant olusturulmalidir:

- `Tek taraf baski`
- `On + arka baski`

Bu proje bedenli urunlerde `variant_map` kullanir. Musteri beden ve baski yonu sectiginde dogru Shopify variant ID sepete gider. Sadece on tasarim varsa `front`, sadece arka tasarim varsa `back`, iki yuz doluysa `double` variant kullanilir.

## Sipariste tasarimi gorme

App sepete su line item property alanlarini ekler:

- `Baski tipi`
- `Beden`
- `On yazi`
- `On resim`
- `On resim konum`
- `On baski onizleme`
- `Arka yazi`
- `Arka resim`
- `Arka resim konum`
- `Arka baski onizleme`

Shopify Admin > Orders ekraninda siparisi actiginda urun satirinin altinda bu property'ler gorunur. `On baski onizleme` ve `Arka baski onizleme` alanlari baski ekibinin acabilecegi PNG onizleme URL'leridir.

## Shopify'a ekleme

1. Shopify admin panelinde ilgili urunde iki variant olusturun.
2. Variant ID'leri bulun.
3. `shopify-snippet.liquid` icindeki `TEK_TARAF_VARIANT_ID` ve `CIFT_TARAF_VARIANT_ID` alanlarini degistirin.
4. `styles.css` ve `app.js` dosyalarini tema asset'lerine yukleyin.
5. Product template icinde snippet'i render edin ve asset'leri cagirin:

```liquid
{{ 'styles.css' | asset_url | stylesheet_tag }}
{% render 'shopify-snippet' %}
{{ 'app.js' | asset_url | script_tag }}
```

## Shopify app yayina alma

Bu proje artik Shopify CLI tarafindan app olarak goruluyor.

App bilgisi:

- App name: `Bikafa Tisort Tasarim`
- Client ID: `ffb70fd5e03a3532fb1e47b3a8e9a052`
- Extension: `extensions/tshirt-designer`
- App proxy path: `/apps/tshirt-designer`

Kontrol:

```sh
shopify app info
shopify app build
```

Test:

```sh
shopify app dev
```

Production deploy icin Railway kullanilabilir. Bu repo su anda production URL olarak `https://threadlab-production.up.railway.app` kullanacak sekilde ayarli. `shopify app dev` sirasinda URL'lerin tekrar `trycloudflare.com` alanina donmemesi icin `automatically_update_urls_on_dev = false` yapildi.

Railway ortam degiskenleri:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL=https://threadlab-production.up.railway.app`
- `SCOPES=write_products,read_orders,write_app_proxy`
- `APP_STORAGE_DIR=/data`

Railway notlari:

- Bir volume olusturup `/data` yoluna mount edin. Siparis JSON verisi ve yuklenen gorseller bu klasorde tutulur.
- Deploy bittikten sonra Shopify konfigurasyonunu Railway URL'leriyle tekrar senkronlamak icin yerelden `shopify app deploy` calistirin.
- Shopify Partner Dashboard veya App config icinde `Application URL`, callback URL'leri ve App Proxy URL'sinin Railway domainini gosterdigini dogrulayin.

Sonra:

```sh
shopify app deploy
```

## Gorsel yukleme

Lokal demoda `data-upload-endpoint="upload.php"` ile gorsel `uploads/` klasorune kaydedilir ve siparis property alanina URL yazilir.

Shopify temasinda ayni mantik icin `data-upload-endpoint="/apps/tshirt-designer/upload"` ayarlandi. Bunun calismasi icin Shopify App Proxy'nin bu PHP endpoint'ine veya ayni isi yapan public backend'e yonlendirilmesi gerekir.
