# Çoklu Fotoğraflı Ürün Sistemi — Tasarım Dokümanı

**Tarih:** 3 Eylül 2026
**Kapsam:** N fotoğraflı yapışan çerçeve, kupa, akrilik stant ve benzeri kolaj ürünleri
**Durum:** Tasarım önerisi — uygulama kararı verilmedi
**İlgili dokümanlar:** `sablonlu-tasarim-analizi.md`, `sablonlu-tasarim-analizi2.md`

---

## 1. Amaç

Sosyopix tarzı kolaj ürünlerinin PrintLab içinde satılabilir hale gelmesi:

- 8, 12, 15 fotoğraflı yapışan çerçeveler
- 9 fotoğraflı kupa
- Tek fotoğraflı akrilik stant
- Farklı ebatlar (20x20, 20x30, 30x30, 30x40, 50x70)

Hedef, her yeni ürün için kod yazılmaması. Yeni bir kolaj ürünü eklemek, bir
tasarım dosyası yüklemekten ibaret olmalıdır.

## 2. Kısa sonuç

Bu ürünlerin tamamı **tek bir kalıptır**: sabit bir tasarım görseli + içine
fotoğraf giren N adet delik + düzenlenebilir metin alanları. Aralarındaki fark
kod farkı değil, **veri** farkıdır.

Mevcut Personalizer motoru bu işin büyük kısmını zaten yapıyor. Şeffaf delik
tarama, delik şekline maskeleme, fotoğrafı şablonun altına yerleştirme, metin
katmanı ve baskı çıktısı hazır. Eksik olan tek şey, veri modelinin **"bir
şablonda bir fotoğraf vardır"** varsayımından kurtarılmasıdır.

## 3. Referans ürünlerin çözümlemesi

Sosyopix üzerinde incelenen ürünler:

| Ürün | Fotoğraf | Metin | Ebat | Yerleşim |
|---|---:|---|---|---|
| 12'li yılbaşı yapışan çerçeve | 12 | isim + mesaj (düzenlenebilir) | 30x40 | ızgara |
| 8'li anne yapışan çerçeve | 8 | "ANNE" (sabit) | 30x40 | dekoratif dizilim |
| 15'li "Birlikte 1 Yıl" çerçeve | 15 | mesaj (düzenlenebilir) | 30x40 | karışık boyutlu kolaj |
| 9'lu "En İyi Anne" kupa | 9 | "En İyi Anne" (sabit) | 325 ml | silindirik şerit |
| 13x18 akrilik stant | 1 | değişken | 13x18 | tek alan |

Ortak noktalar:

- Tasarım sabittir, müşteri yerleşimi değiştirmez.
- Müşteri yalnızca fotoğrafları seçer, sıralar ve kırpar.
- Her üründe aynı uyarı metni geçiyor: baskıda 3 mm beyaz pay, küçük karakter
  ve emoji kullanmama önerisi. Bu, tek bir motorun kullanıldığının işaretidir.
- Akış her üründe aynı: seç → sırala ve kırp → önizle → onayla → sepete ekle.

## 4. Temel karar: sabit yerleşim, değişken içerik

Müşteriye fotoğrafı istediği yere sürükleme yetkisi **verilmemelidir**.

| | Serbest konumlandırma | Slot takası |
|---|---|---|
| Tasarım bütünlüğü | 15 fotoğraf üst üste biner, kompozisyon dağılır | korunur |
| Baskı güvenliği | kesim ve taşma payına taşabilir | garanti altında |
| Müşteri yükü | 15 fotoğrafı elle yerleştirmek terk sebebidir | sürükle, biter |
| Destek maliyeti | yüksek | yok |

Sürükle-bırak yine de kullanılır, ancak **yalnızca yer değiştirme** için:
müşteri bir fotoğrafı başka bir deliğin üstüne bıraktığında ikisi takas olur.
Delik içinde ise kaydırma ve yakınlaştırma serbesttir; bu kırpma işlemidir.

Müşterinin sahip olduğu üç yetki:

```text
1. Takas   — hangi fotoğraf hangi delikte
2. Kaydır  — delik içinde konum
3. Yakınlaştır — delik içinde ölçek
```

Bunlar `{ slotId, assetId, offsetX, offsetY, scale }` olarak saklanır. Tasarım
JSON'u değil, birkaç sayıdır. Sipariş kaydı küçük, yeniden üretim kolaydır.

## 5. Üç katmanlı ürün modeli

En kritik yapısal karar budur. Kombinasyonlar ayrı kayıt olarak tutulursa
yönetim yükü çarpımsal büyür.

```text
1. BASKI ÜRÜNÜ  (fiziksel spesifikasyon, tekrar kullanılır)
   30x40 yapışan çerçeve → 3543x4724 px @300dpi, 3 mm taşma, düz
   50x70 yapışan çerçeve → 5906x8268 px @300dpi, 3 mm taşma, düz
   11oz kupa             → 2475x1155 px, silindirik sarma, kulp boşluğu
   13x18 akrilik stant   → 1535x2126 px, düz

2. TASARIM ŞABLONU  (yerleşim, ölçüden bağımsız, normalize koordinat 0–1)
   12'li ızgara + yılbaşı süslemesi
   8'li kalp dizilimi + "ANNE"
   15'li karışık boyutlu kolaj
   9'lu kupa şeridi

3. BAĞLANTI  (Shopify ürün veya varyantı → şablon + baskı ürünü)
```

Şablon koordinatları piksel yerine **oran** tutarsa aynı şablon, **aynı en boy
oranındaki** her ebatta çalışır.

### En boy oranı şablonun bir parçasıdır

Normalize koordinat ölçüden bağımsızdır, ancak orandan bağımsız değildir.
Farklı oranlarda esnetilen bir yerleşimde daireler ovalleşir, kare fotoğraf
alanları dikdörtgenleşir, kompozisyon bozulur.

| Oran | Ebatlar | Paylaşım |
|---|---|---|
| 1:1 (1.000) | 20x20, 30x30 | aynı şablon |
| 3:4 (0.750) | 15x20, 30x40 | aynı şablon |
| 2:3 (0.667) | 20x30 | kendi grubu |
| 4:5 (0.800) | 20x25 | kendi grubu |
| 5:7 (0.714) | 50x70 | kendi grubu |

30x40 ile 50x70 arasında yüzde beş oran farkı vardır; aynı şablonu
paylaşamazlar. Kural: **şablon = yerleşim + en boy oranı.**

Tasarım siparişi verilirken bu gruplama esas alınmalıdır. Bir yerleşim iki
oranda satılacaksa tasarımcıdan iki dosya istenir; ikisi de aynı yerleşimin
o orana uyarlanmış halidir.

Bugünkü `personalizer_templates` tablosu piksel koordinat tutuyor
(`photo_x`, `photo_y`, `photo_width`, `photo_height`). Bu yüzden her ebat için
şablonun kopyalanması gerekir. Değiştirilmesi gereken ilk şey budur.

## 6. Şablon veri modeli

`personalizer_templates` tablosuna tek bir `slots` JSONB kolonu eklenir. Mevcut
piksel kolonları "tek slotlu şablon" olarak okunmaya devam eder; geriye
uyumluluk bozulmaz.

```jsonc
{
  "doc": {
    "aspect": 0.75,        // genişlik / yükseklik
    "bleedMm": 3,
    "safeMm": 5
  },
  "slots": [
    {
      "id": "photo_1",
      "kind": "image",
      "source": "photo_1",              // aynı kaynağı birden fazla slot kullanabilir
      "rect": [0.08, 0.06, 0.26, 0.20], // normalize x, y, genişlik, yükseklik
      "maskUrl": "…/hole_1.png",        // delik taramasından üretilir
      "fit": "cover",
      "allow": { "pan": true, "zoom": true, "rotate": false },
      "minPx": 950,                     // 300 dpi için gereken kısa kenar
      "label": "1. Fotoğraf",
      "order": 1
    },
    {
      "id": "message",
      "kind": "text",
      "rect": [0.20, 0.88, 0.60, 0.06],
      "maxChars": 40,
      "font": "…",
      "color": "#ffffff",
      "align": "center",
      "overflow": "shrink",             // taşarsa otomatik küçült
      "editable": true                  // "ANNE" gibi sabit metinlerde false
    }
  ],
  "layers": [
    { "role": "background", "url": "…" },
    { "role": "slots" },                // slotlar bu sırada çizilir
    { "role": "overlay", "url": "…" }   // fotoğrafın üstünde duran çerçeve
  ]
}
```

### Slot ile müşteri girdisi farklıdır

`sablonlu-tasarim-analizi.md` içindeki ayrım burada da geçerlidir. Çorap
ürününde bir fotoğraf kırk yerleşime gidiyordu; kolaj çerçevede on beş fotoğraf
on beş yerleşime gider. `source` alanı ikisini de karşılar: iki slot aynı
kaynağı gösterebilir. Tek model her iki ürün ailesini kapsar.

## 7. Şablon üretimi: şeffaf delik taraması

Yönetim maliyetini asıl düşüren nokta budur ve altyapısı **kodda zaten vardır**.

`app/lib/template-hole.server.ts`, tasarım görselindeki kapalı şeffaf delikleri
flood fill ile bulur. Görselin kenarından erişilebilen şeffaflık "dışarısı"
sayılır; geriye kalan şeffaf bölgeler tasarımla çevrelenmiş deliklerdir. Harf
gözleri alan eşiğiyle elenir (`MIN_HOLE_AREA_RATIO = 0.004`).

Yani tasarımcı **on beş deliği şeffaf bırakılmış tek bir PNG** teslim eder,
sistem on beş slotu konum, boyut ve gerçek şekil maskesiyle birlikte otomatik
çıkarır. Elle alan işaretleme gerekmez.

### Mevcut kısıt

`scanTemplateHoles()` bütün delikleri döndürür, ancak
`app/routes/api.personalizer.detect-hole.tsx:57` ve
`app/lib/personalizer-compose.server.ts:109` yalnızca `scan.holes[0]` alır.
Motor N delik biliyor, veri modeli bir delik saklıyor. Darboğaz burasıdır.

### Okuma sırası

Flood fill delikleri tarama sırasına göre döndürür. Müşteriye gösterilecek
numaralandırma (1. Fotoğraf, 2. Fotoğraf …) için okuma sırasına dönüştürülmeli:

```text
1. Deliklerin merkez y değerlerine göre satır kümeleri oluştur.
   Kümeleme toleransı = ortalama delik yüksekliğinin yarısı.
   (Düz y sıralaması kaydırmalı yerleşimlerde yanlış sonuç verir.)
2. Her satır kümesini x değerine göre soldan sağa sırala.
3. Satırları yukarıdan aşağıya birleştir.
```

Yönetici bu sırayı kaydetmeden önce ekranda görür ve gerekirse sürükleyerek
düzeltir. Sıra bir kez belirlenir, müşteri tarafında sabittir.

### Yönetici akışı

```text
Tasarımcı → 15 deliği şeffaf bırakılmış tek PNG
Yönetici  → dosyayı yükle
          → 15 slot otomatik listelenir, okuma sırası önerilir
          → beklenen slot sayısını gir; tutmazsa uyarı çıkar
          → metin alanlarını fareyle çiz (bu ekran hazır: app.personalizer.$id.tsx)
          → baskı ürünü ve Shopify ürünü ile eşleştir
          → kaydet
```

Yeni ürün ekleme süresi dakikalarla ölçülür, yazılan kod sıfırdır.

## 8. Canlı önizleme mimarisi

On beş fotoğraflı bir üründe her etkileşimde sunucuda `sharp` çalıştırmak
kabul edilebilir değildir. Önizleme ile baskı çıktısı ayrılmalıdır.

| | Tarayıcı önizlemesi | Sunucu çıktısı |
|---|---|---|
| Amaç | anlık geri bildirim | baskı ve sipariş kaydı |
| Motor | canvas veya CSS, aynı normalize `rect` değerleri | `sharp` |
| Görsel | istemcide küçültülmüş kopya | orijinal dosya |
| Çalışma anı | her takas, kaydırma, yakınlaştırmada | önizleme onayında ve sipariş sonrası |

İki taraf da aynı `slots` verisini okuduğu için sonuç birebir örtüşür.
Müşterinin gördüğü ile basılan dosyanın aynı olması bu paylaşılan tanıma
dayanır.

### Yükleme hacmi

On beş fotoğraf, telefon kamerasıyla kolayca 60–90 MB eder. Tek seferde
yüklenmesi mobil bağlantıda başarısız olur.

```text
İstemci → her fotoğraf için 400 px küçük kopya üret (ızgara ve önizleme için)
        → orijinali arka planda R2'ye yükle, sıraya alarak
        → yükleme sürerken müşteri sıralamaya devam edebilsin
Sunucu  → baskıda yalnızca orijinali kullan
```

Küçük kopya olmadan on beş fotoğraflı ızgara mobilde kullanılamaz.

## 9. Müşteri akışı

```text
1. Toplu seçim      — 15 dosya tek seferde seçilir
2. Otomatik dağıtım — okuma sırasına göre slotlara yerleşir
3. Takas            — sürükle bırak ile yer değiştirme
4. Kırpma           — delik seçilir, kaydır ve yakınlaştır
5. Metin            — düzenlenebilir alanlar doldurulur
6. Önizleme         — sunucu kompoziti onaya sunulur
7. Sepete ekle
```

Kurallar:

- Eksik fotoğraf varsa sepete ekleme kilitli kalır, boş delik kırmızı gösterilir.
- Fotoğrafları tek tek yükletmek yerine toplu seçim zorunludur; en büyük terk
  sebebi budur.
- Müşteri sıralamayı bitirmeden önizleme üretilmez.

## 10. Kalite ve çözünürlük kontrolü

30x40 çerçevede on beş delik varsa her delik yaklaşık 7x9 cm'dir; 300 dpi için
kısa kenarda yaklaşık 830 piksel gerekir. Yüklenen fotoğraf küçükse **o slotta**
uyarı gösterilmelidir.

```text
gerekenPx = slot.rect.genişlik × baskıÜrünü.genişlikPx
uyarı eşiği = gerekenPx × 0.75
```

Sosyopix bunu tüm ürünlerde tek bir genel metinle geçiştiriyor. Slot bazında
uyarı vermek iade ve destek yükünü doğrudan düşürür.

Ayrıca baskıdaki 3 mm beyaz pay önizlemede de gösterilmelidir; müşteri
fotoğrafın kenarının kırpılacağını önceden görmelidir.

## 11. Mevcut kodun durumu

| Yetenek | Durum | Yer |
|---|---|---|
| N adet şeffaf delik tespiti | var | `template-hole.server.ts` — `scanTemplateHoles` |
| Delik şekline maskeleme | var | `buildMaskedPhotoLayer` |
| Fotoğrafı şablonun altına yerleştirme | var | `personalizer-compose.server.ts:104-118` |
| Fareyle metin alanı çizme | var | `app.personalizer.$id.tsx` |
| Çoklu metin alanı | var | `text_fields` JSONB |
| Sunucu kompozit ve baskı çıktısı | var | `personalizer-compose.server.ts` |
| Çoklu mockup ve çerçeve | var | `personalizer_frames` |
| Ürün ve varyant bağlama | var | `personalizer_product_links` |
| **Çoklu bağımsız fotoğraf slotu** | yok | tek `photo_x/y/width/height` |
| **Normalize koordinat** | yok | piksel sabit |
| **Slot bazlı kaydırma ve yakınlaştırma** | yok | her zaman `cover`, merkez |
| **Toplu yükleme ve sürükle bırak arayüzü** | yok | — |
| **Slot bazlı çözünürlük uyarısı** | yok | — |
| **Baskı ürünü (ebat) kaydı** | yok | ebat şablona gömülü |

Motorun büyük kısmı hazırdır. Katman sırası sorunu, delik yolunda zaten
çözülmüştür; ayrıca `overlay` katmanı geliştirilmesine yalnızca deliksiz
şablonlar için gerek vardır.

## 12. Sipariş verisi

Sipariş satırında saklanacak veri:

```jsonc
{
  "templateId": "…",
  "printProductId": "…",
  "assets": { "a1": "r2://…", "a2": "r2://…" },
  "slots": [
    { "slotId": "photo_1", "assetId": "a1", "offsetX": 0.02, "offsetY": -0.05, "scale": 1.15 },
    { "slotId": "photo_2", "assetId": "a2", "offsetX": 0, "offsetY": 0, "scale": 1 }
  ],
  "texts": { "message": "Birlikte 1 yıl" }
}
```

Bu kayıt küçüktür ve yeterlidir: baskı dosyası her zaman yeniden üretilebilir.
Bozuk baskı dosyalarının tasarımdan yeniden üretilmesi işlevi (bkz. commit
`07c653f`) bu modelle sorunsuz çalışır.

## 13. Uygulama sırası

Karar: sistem **baştan çok ebatlı** kurulacak. Bu yüzden baskı ürünü tablosu
sona bırakılmaz, faz 1'e alınır — sonradan göç etmek, şablonları yeniden
tanımlamak demektir.

| Faz | İş | Sonuç |
|---|---|---|
| 1 | Baskı ürünü tablosu (ebat, dpi, taşma, en boy oranı) + `slots` JSONB kolonu + normalize koordinat + eski alanlardan otomatik göç | veri modeli hazır, ebat baştan doğru |
| 2 | Izgara üreticisi ve yönetici ekranında fareyle düzeltme | şablonların çoğu üretilebilir |
| 3 | `personalizer-compose` slot döngüsü ve slot transformları | çıktı üretilebilir |
| 4 | Müşteri arayüzü: toplu yükleme, sürükle bırak takas, slot içi kırpma, eksik slot kontrolü | ürün satılabilir |
| 5 | Çoklu delik taraması (`detect-hole` tüm delikleri döndürsün) | şekilli tasarımlar (LOVE) |
| 6 | Doğrulama, deneme çıktısı, klonlama, sürümleme | ölçeklenme ve hata önleme |
| 7 | Silindirik sarma ve kupa mockup'ı | kupa satılabilir |

Faz 1–4 ızgara tipi çerçeveleri (kataloğun çoğunluğu) satılır hale getirir.
Faz 5 şekilli tasarımları, faz 7 kupayı açar.

## 14. Açık sorular

- Tasarımcı teslimatı tek PNG mi olacak, yoksa arka plan ve overlay ayrı
  dosyalar olarak mı? Delik yöntemi tek dosyayla çalışır; ayrı dosya yalnızca
  fotoğrafın kısmen üstte kısmen altta olduğu tasarımlarda gerekir.
- Kupada silindirik sarma önizlemesi gerçek eğrilikle mi, düz şeritle mi
  gösterilecek? Düz şerit daha ucuz ve çoğu rakip bunu kullanıyor.
- Müşteri aynı fotoğrafı birden fazla deliğe koyabilmeli mi? Veri modeli
  destekliyor; arayüzde açılıp açılmayacağı ürün kararıdır.
- Fotoğraf sayısı ürün varyantına göre değişebilir mi (aynı tasarım 8'li ve
  12'li)? Bu, ayrı şablon gerektirir; yerleşimler farklıdır.

---

## 15. Şablon üretimi ve yönetimi

Bölüm 7 delik taramasını anlatıyor. Bu bölüm, deliklerin pratikte **nasıl
üretileceğini** ve çoğaldıklarında **nasıl yönetileceğini** ele alır.

### 15.1 Tek hedef format, üç giriş yolu

Kritik ilke: nasıl üretilirse üretilsin sonuç her zaman aynı `slots[]` dizisidir.
Render motoru, müşteri arayüzü ve sipariş kaydı tek formatı bilir.

```text
A. Izgara üreticisi   ─┐
B. Şeffaf delik PNG   ─┼─→  slots[]  ─→  render + müşteri arayüzü
C. SVG içe aktarma    ─┘
        ↑
D. Fareyle düzeltme (üçünün de üstünde çalışır)
```

### 15.2 A — Izgara üreticisi

Kataloğun büyük kısmı düz ızgaradır. Bunlar için tasarım dosyasından slot
çıkarmaya gerek yoktur; slotlar parametreden hesaplanır.

Yönetici girdisi:

```jsonc
{
  "cols": 3, "rows": 4,          // 12 fotoğraf
  "marginMm": { "top": 20, "right": 15, "bottom": 60, "left": 15 },
  "gapMm": 4,
  "cornerRadiusMm": 2,
  "reserve": [                    // slot açılmayacak alanlar (yazı, süsleme)
    { "rect": [0.0, 0.82, 1.0, 0.18], "label": "mesaj alanı" }
  ]
}
```

Sistem `slots[]` üretir, yönetici önizlemede görür, gerekirse fareyle düzeltir.
Dekoratif tasarım ayrı bir `overlay.png` olarak üstüne binebilir; slotlarla
ilgisi yoktur.

Bu yol, ızgara ürünlerde tasarımcı bağımlılığını tamamen kaldırır. Yeni bir
"6'lı 20x20" eklemek üç sayı girmektir.

Kapsadığı düzenler: düz ızgara, kaydırmalı ızgara (`stagger`), karışık boyutlu
ızgara (bir hücre 2x2 birleştirilerek).

### 15.3 B — Şeffaf delik PNG taraması

Izgaraya sığmayan tasarımlar için. "LOVE" yazısının harfleri içine yerleşen dört
fotoğraf veya kalp şeklindeki alanlar dikdörtgen değildir; şekil bilgisi ancak
tasarım dosyasından gelebilir.

Tasarımcı tek PNG teslim eder: fotoğrafın gireceği yerler şeffaf bırakılmıştır.
`scanTemplateHoles()` bunları bulur, `slots[]` üretir, maskeleri kaydeder.

Bu yol kodda hazırdır; tek eksik çoklu delik desteğidir.

#### Tasarımcı sözleşmesi

Bu kurallar tasarımcıya yazılı verilmelidir. Uyulmazsa tarama sessizce yanlış
sonuç üretir:

| Kural | Sebep |
|---|---|
| Dosya PNG olacak, JPEG olmayacak | JPEG şeffaflık taşımaz |
| Arka plan **opak** olacak, taşma payı dahil tüm tuvali kaplayacak | Kenardan yayılan flood fill deliği "dışarısı" sayar ve slot kaybolur |
| Delikler tamamen tasarımla çevrili olacak | Kenara değen delik tespit edilemez |
| Delik kenarları keskin olacak, yumuşak geçiş olmayacak | Yarı saydam kenar maskede hayalet çizgi bırakır |
| Sabit metinler tasarıma gömülü, değişken metinler boş bırakılacak | Değişken metin ayrı katmanda üretilir |
| Tuval ölçüsü baskı ürününün piksel ölçüsüyle aynı olacak | Ölçek belirsizliği kalmasın |

#### Bilinen tuzaklar

- **Harf gözleri.** "o", "e", "a" harflerinin içi de kapalı şeffaf alandır.
  `MIN_HOLE_AREA_RATIO = 0.004` bunları eler, ancak on beş küçük delikli
  tasarımlarda eşik gerçek slotlara yaklaşır. Çözüm: yöneticiden **beklenen
  slot sayısı** istenir; tarama farklı sayı bulursa kaydetmeden uyarır ve
  yönetici fazlalıkları listeden siler.
- **Kenar yumuşatma.** Delik kenarındaki pikseller yarı saydamdır. Maskede
  bir piksel aşındırma (erode) uygulanarak beyaz hayalet çizgi önlenir.
- **Çok küçük delikler.** Alan eşiğinin altında kalan gerçek slotlar için eşik
  şablon bazında ayarlanabilir olmalıdır.

### 15.4 C — SVG içe aktarma

Tarama kırılgan kalırsa kaçış yolu budur. Tasarımcı Illustrator veya Figma'dan
yerleşimi SVG olarak dışa aktarır; slot şekilleri isimlendirilmiş nesnelerdir:

```xml
<rect id="photo_1" x="120" y="180" width="620" height="620" rx="24"/>
<path id="photo_2" d="M…"/>   <!-- kalp, harf, özgün şekil -->
```

Avantajı: geometri taranmaz, doğrudan okunur. Çözünürlükten bağımsızdır ve
normalize koordinat modeline birebir oturur. Dezavantajı: tasarımcının
isimlendirme disiplinine uyması gerekir.

**Öneri:** ilk sürümde yapılmasın. A ve B yolları kataloğun tamamını kapsıyor;
SVG ancak tarama pratikte sorun çıkarırsa gerekir.

### 15.5 D — Fareyle düzeltme

Üç yolun da çıktısı yönetici ekranında düzenlenebilir olmalıdır: slot taşıma,
boyutlandırma, silme, ekleme, sıralama. Metin alanları için bu ekran zaten var
(`app.personalizer.$id.tsx`); aynı etkileşim slotlara genişletilir.

Gereken yardımcılar: ızgaraya kenetlenme, hizalama, eşit aralıklama, çoğaltma.

### 15.6 Ürünlerin hangi yola düştüğü

| Ürün | Fotoğraf | Yerleşim | Yol |
|---|---:|---|---|
| 12'li yılbaşı 30x40 | 12 | 3x4 ızgara | A |
| 6'lı mutlu yıllar 20x20 | 6 | ızgara | A |
| 15'li "Birlikte 1 Yıl" 30x40 | 15 | karışık boyutlu ızgara | A (birleşik hücre) |
| 8'li sevgiliye | 8 | dekoratif dizilim | A veya B |
| 8'li babaya 30x40 | 8 | dekoratif dizilim | A veya B |
| LOVE yazılı 20x30 | 4 | harf şekilleri içinde | **B** |
| 20x25 kanvas tablo | değişken | ürüne göre | A |

Kataloğun çoğunluğu ızgara üreticisiyle, tasarım dosyasından slot çıkarmadan
üretilebilir. Şekilli tasarımlar azınlıktadır ve delik taraması onları karşılar.

### 15.7 Çoğalınca yönetim

Asıl yük şablon üretmek değil, elli şablonu yönetmektir.

#### Klonlama

"Sevgiliye 8 fotoğraflı" ile "Babaya hediye 8 fotoğraflı" büyük olasılıkla aynı
yerleşimi, farklı dekor ve metinleri kullanır. Klonlama bunu iki dakikaya
indirir:

```text
Şablonu klonla → overlay görselini değiştir → sabit metinleri düzenle → kaydet
```

Yerleşimler gerçekten aynıysa ileride **yerleşim kütüphanesi** eklenebilir:
adlandırılmış bir yerleşim birden fazla tema tarafından paylaşılır. İlk sürümde
klonlama yeterlidir; paylaşılan yerleşim erken soyutlamadır.

#### Listeleme ve filtreleme

Şablon listesi şu alanlarla filtrelenebilir olmalıdır: slot sayısı, ebat,
kategori (yılbaşı, sevgililer, anne, baba), durum (taslak veya yayında), bağlı
Shopify ürünü. Elli şablonda arama olmadan çalışılamaz.

#### Kaydetme anında doğrulama

Yönetici kaydederken sistem şunları kontrol etmelidir:

- Bulunan slot sayısı beklenen sayıya eşit mi
- Slotlar güvenli alanın dışına taşıyor mu
- Slotlar birbiriyle çakışıyor mu
- Metin alanları slotlarla çakışıyor mu
- Her slot için asgari çözünürlük hesaplanabildi mi
- Şablon tuvali baskı ürününün en boy oranıyla uyuşuyor mu

Bu denetim, hatalı şablonun canlıya çıkmasını engeller. Hatalı şablon, hatalı
baskı ve iade demektir.

#### Otomatik deneme çıktısı

Kaydetme sırasında sistem, örnek fotoğraflarla bir deneme kompoziti üretip
yöneticiye göstermelidir. Slot sırası, maske kalitesi ve metin taşması bu
ekranda anında görülür. Şablonu ilk kez müşteri denememelidir.

#### Sürümleme

Yayındaki bir şablon değiştirilirse eski siparişlerin yeniden üretimi bozulur.
Şablon kaydı sürümlenmeli, sipariş hangi sürümle üretildiğini saklamalıdır.
Bozuk baskı dosyalarının yeniden üretilmesi işlevi (commit `07c653f`) buna
bağımlıdır.

### 15.8 Önerilen sıra

| Öncelik | İş | Kapsadığı |
|---|---|---|
| 1 | Izgara üreticisi ve fareyle düzeltme | kataloğun çoğunluğu |
| 2 | Çoklu delik taraması | şekilli tasarımlar (LOVE, kalp) |
| 3 | Doğrulama ve deneme çıktısı | hata önleme |
| 4 | Klonlama ve filtreleme | ölçeklenme |
| 5 | Sürümleme | yeniden üretim güvenliği |
| 6 | SVG içe aktarma | yalnızca gerekirse |
