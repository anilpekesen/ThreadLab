# Proje Özeti

Bu proje, Shopify ürün sayfasına bir **tasarım aracı** ekler.

Kısacası sistem şunu yapar:

1. Mağaza sahibi admin panelden bir ürün için ayar yapar.
2. Müşteri ürün sayfasında tasarım yapar.
3. Sistem tasarımın kapladığı alana göre ek fiyat hesaplar.
4. Müşteri ürünü sepete ekler.
5. Sipariş oluşunca sistem siparişi üretim listesine düşürür.

Amaç şu:

- Tişört, çanta, bardak, sweatshirt, boxer gibi ürünlerde müşteri kendi görselini ve yazısını ekleyebilsin.
- Mağaza sahibi hangi alana baskı yapılacağını kendisi belirleyebilsin.
- Baskı büyüdükçe fiyat otomatik artsın.

## 1. Ön Yüzde Ne Var?

Ön yüz = müşterinin mağazada gördüğü ekran.

Müşteri ürün sayfasına girince bir tasarım alanı açılır.

Burada şunları yapabilir:

- Resim yüklemek
- Yazı eklemek
- Yazının rengini değiştirmek
- Yazının boyutunu büyütmek/küçültmek
- Yazıyı hizalamak
- Yazıyı veya resmi farklı noktalara taşımak
- Ön yüz ve arka yüz arasında geçmek

Yani müşteri şunu hisseder:

“Ben bu ürünü kendim tasarlıyorum.”

Bu kısım büyük olarak şu dosyalarda çalışır:

- `extensions/tshirt-designer/snippets/tshirt-designer-markup.liquid`
- `extensions/tshirt-designer/assets/designer.css`
- `extensions/tshirt-designer/assets/tshirt-app.js`

## 2. Admin Panelde Ne Var?

Admin panel = mağaza sahibinin ayar yaptığı yer.

Mağaza sahibi ürünler listesinden bir ürünü seçer ve ayar ekranına girer.

Burada şunları belirler:

- Bu ürün aktif mi?
- Ürün tipi ne?
  - tişört
  - çanta
  - bardak
  - boxer
  - sweatshirt
  - diğer
- Ön baskı olacak mı?
- Arka baskı olacak mı?
- Baskı alanı kutusu nerede olacak?
- Gerçek baskı ölçüsü kaç cm?
- Hangi ölçü aralığında kaç ek fiyat alınacak?
- Her fiyat bandı hangi Shopify varyantına bağlanacak?

Örnek:

- `10 x 15 cm` = `60`
- `21 x 29 cm` = `120`
- `29 x 42 cm` = `180`

Yani admin panel şunu söyler:

“Bu üründe müşteri şu kadar alan içinde tasarım yapabilir. Küçük baskı şu fiyat, orta baskı şu fiyat, büyük baskı şu fiyat.”

Bu kısım büyük olarak şu dosyalarda çalışır:

- `app/routes/app.products._index.tsx`
- `app/routes/app.products.$productId.tsx`
- `app/models/product-config.server.ts`

## 3. Fiyat Nasıl Hesaplanıyor?

Sistemin en önemli noktalarından biri bu.

Mantık şu:

- Müşteri bir resim veya yazı ekler.
- Sistem bunun baskı alanında kapladığı gerçek ölçüyü hesaplar.
- Sonra admin panelde tanımlı fiyat bantlarına bakar.
- Uygun bandı bulur.
- O banda ait ek ücreti ürüne ekler.

Çok basit örnek:

- Tasarım `8 x 12 cm` ise küçük band
- Tasarım `18 x 24 cm` ise orta band
- Tasarım `26 x 38 cm` ise büyük band

Bu sadece resim için değil, **yazı için de geçerli**.

Yani yazı küçücükse ucuz olur.
Yazı çok büyürse daha pahalı olur.

Sistem ön ve arka yüzü ayrı ayrı hesaplar.

Örnek:

- Ön yüzde orta baskı var
- Arka yüzde küçük baskı var

Toplam fiyat:

- Ürünün normal fiyatı
- + ön yüz baskı ek ücreti
- + arka yüz baskı ek ücreti

Bu hesap çoğunlukla burada yapılır:

- `extensions/tshirt-designer/assets/tshirt-app.js`

## 4. Müşteri Sepete Ekleyince Ne Oluyor?

Bu kısmı çok basit anlatayım.

Müşteri “Sepete Ekle” dediği anda sistem sadece resmi eklemiyor.
Bir sürü bilgi topluyor.

Toplanan bilgiler:

- Ürün hangisi?
- Renk ne?
- Bedenler ne?
- Ön yüzde tasarım var mı?
- Arka yüzde tasarım var mı?
- Baskı ölçüsü ne?
- Hangi fiyat bandı kullanıldı?
- Toplam fiyat ne?

Sonra sistem şunları yapıyor:

1. Ön ve arka yüz önizlemelerini oluşturuyor.
2. Tasarımın JSON halini kaydediyor.
3. Tasarıma özel bir `design_token` üretiyor.
4. Ürünü Shopify sepetine ekliyor.
5. Sepete eklerken bu tasarım bilgilerini line item properties olarak iliştiriyor.

Yani sipariş satırının üstüne görünmeyen ama çok değerli notlar yazılıyor.

Örnek notlar:

- `Ön ölçü`
- `Arka ölçü`
- `Ön fiyat bandı`
- `Arka fiyat bandı`
- `design_token`
- `Tasarımı düzenle`
- `Tasarımı indir`

Bu sayede sipariş sonradan üretim için tekrar bulunabiliyor.

## 5. Backend Tarafında Sipariş Nasıl Çalışıyor?

Şimdi “arka plan” kısmını düz anlatayım.

### Çok basit mantık

Sipariş geldiğinde sistem siparişi komple baştan üretmiyor.
Shopify siparişi oluşturuyor.
Biz sadece o siparişin içinde **tasarımlı ürün var mı** ona bakıyoruz.

Varsa kendi üretim listemize not düşüyoruz.

### Adım adım

1. Shopify’da müşteri siparişi tamamlar.
2. Shopify bize webhook yollar.
3. Sistem siparişteki ürün satırlarını kontrol eder.
4. Eğer satırda `design_token` varsa:
   - bu tasarımlı üründür
   - üretim takibine alınmalıdır
5. Sistem bunu `orders.json` içine kaydeder.

Kaydedilen bilgiler:

- Shopify sipariş id’si
- Sipariş numarası
- Müşteri adı
- Müşteri e-postası
- Ürün adı
- Varyant id
- `design_token`
- Önizleme linki
- Üretim durumu

Yani backend şunu yapıyor:

“Bu siparişte baskı yapılacak bir ürün var. Bunu üretim ekibine göstereyim.”

Bu kısım büyük olarak şu dosyalarda:

- `app/routes/webhooks.tsx`
- `app/models/orders.server.ts`

## 6. Siparişler Sayfası Ne İşe Yarıyor?

Admin içindeki `Siparişler` ekranı üretim takip ekranı.

Burada ekip şunu görür:

- Sipariş numarası
- Müşteri adı
- E-posta
- Ürün adı
- Sipariş durumu
- Tarih

Durumlar şöyle ilerler:

- `pending` = bekliyor
- `preparing` = hazırlanıyor
- `printed` = basıldı
- `ready` = hazır
- `shipped` = gönderildi

Yani bu ekranın amacı finans değil.
Asıl amacı üretim takibi.

Bu ekran burada:

- `app/routes/app.orders.tsx`

## 7. Tasarım Kaydı Ne İşe Yarıyor?

Tasarım sadece sepete girip kaybolmuyor.

Sistem tasarımı ayrıca kaydediyor.

Bunun amacı:

- Siparişten sonra tasarımı tekrar açabilmek
- Önizlemeyi tekrar görebilmek
- Gerekirse üretim dosyasına ulaşabilmek

Bu kayıtların merkezi:

- `app/routes/api.storefront.designs.tsx`
- `data/designs.json`

Burada her tasarım için bir `token` oluşuyor.

Bu token aslında tasarımın kimliği.

## 8. Veriler Nerede Duruyor?

Bu projede verilerin önemli bir kısmı JSON dosyalarında tutuluyor.

Örnekler:

- `data/settings.json`
  - ürün bazlı ayarlar
- `data/print_areas.json`
  - baskı alanları
- `data/designs.json`
  - tasarım kayıtları
- `data/orders.json`
  - üretime düşen siparişler

Yani kısa hali:

- ürün ayarı burada
- baskı alanı burada
- tasarım burada
- sipariş burada

## 9. Bu Sistemin Beyni Nerede?

Tek cümleyle:

- **Admin ayarları** = ürün nasıl kişiselleştirilecek?
- **Storefront aracı** = müşteri nasıl tasarım yapacak?
- **Fiyat motoru** = bu tasarım kaç para ekleyecek?
- **Sipariş takibi** = bu tasarım hangi siparişte kullanıldı?

## 10. En Basit Özet

Bu proje aslında şunu yapıyor:

“Mağaza sahibi ürüne baskı kuralları koyuyor. Müşteri o kurallar içinde tasarım yapıyor. Sistem tasarımı kaydediyor, fiyatı otomatik hesaplıyor, siparişe işliyor ve üretim ekibine taşıyor.”

Yani:

- admin ayarı yapar
- müşteri tasarlar
- sistem fiyat hesaplar
- sipariş oluşur
- üretim listesine düşer

## 11. Önemli Dosyalar

En kritik dosyalar:

- `app/models/product-config.server.ts`
- `app/routes/app.products.$productId.tsx`
- `app/routes/proxy.$.tsx`
- `app/routes/api.storefront.designs.tsx`
- `app/models/orders.server.ts`
- `app/routes/app.orders.tsx`
- `app/routes/webhooks.tsx`
- `extensions/tshirt-designer/blocks/tshirt-designer.liquid`
- `extensions/tshirt-designer/snippets/tshirt-designer-markup.liquid`
- `extensions/tshirt-designer/assets/tshirt-app.js`
- `extensions/tshirt-designer/assets/designer.css`

## 12. Son Cümle

Bu sistem sıradan bir “resim yükleme aracı” değil.

Bu sistem:

- ürün bazlı kişiselleştirme altyapısı,
- baskı alanı yönetimi,
- ölçüye göre fiyatlandırma,
- siparişten üretime geçiş,
- ve tasarım takibi

işlerini tek yerde topluyor.
