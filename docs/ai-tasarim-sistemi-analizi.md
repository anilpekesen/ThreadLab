# AI Tişört Tasarım Sistemi — Gereksinim Dokümanı Değerlendirmesi

**Tarih:** 21 Ağustos 2026
**Kaynak doküman:** `uploads/kendimurettim_ai_tisort_tasarim_sistemi.md`
**Kapsam:** Kullanıcının fotoğrafını yükleyip birkaç ayar seçerek AI ile
kişiselleştirilmiş tasarım üretmesi
**Durum:** Değerlendirme — müşteri ayarları katmanı uygulamaya alındı, queue kararı bekliyor

> Bu doküman, dışarıdan hazırlanmış gereksinim dokümanını **mevcut kod tabanına
> karşı** doğrular. `sablonlu-tasarim-analizi.md` ve `sablonlu-tasarim-analizi2.md`
> ile aynı ürün ailesine bakar; farkı, AI üretim tarafına odaklanmasıdır.

---

## 1. Sonuç

İstenen sistem yapılabilir. Ancak kaynak dokümanın öngördüğü maliyetin çok
altında bir işle yapılabilir, çünkü **anlattığı sistemin büyük kısmı zaten
çalışıyor**.

Kaynak doküman sıfırdan bir **Laravel + React + Redis + Konva.js** projesi tarif
ediyor. PrintLab ise çalışan bir **Remix + Node + PostgreSQL + Fabric.js**
uygulaması. Doküman harfiyen uygulanırsa var olan sistem ikinci kez yazılır.

`.env` içinde `WAVESPEED_API_KEY` zaten tanımlı ve üretimde kullanılıyor.

---

## 2. Kaynak dokümanın istedikleri — mevcut durum eşlemesi

| Doküman bölümü | Durum | Karşılığı |
|---|---|---|
| §3 AI servisi (WaveSpeed) | Var | `app/lib/personalizer-ai.server.ts` |
| §6 Preset sistemi | Var | `personalizer_templates` tablosu + admin UI |
| §10 Prompt builder | Var | `personalizer-ai.server.ts` → `STYLE_PROMPTS` |
| §12–13 Metin katmanı + Canvas editörü | Var | `designer-ui/` (Fabric.js) |
| §14 Print area / 300 DPI | Var | `CanvasArea.exportPrintFile` |
| §21 Database (presets) | Var | `app/models/personalizer.server.ts` |
| §22 API endpointleri | Büyük kısmı var | `api.personalizer.preview` / `.render` |
| §27 Prompt güvenliği | Var | Müşteri metni AI'a hiç gitmiyor, `sharp` ile basılıyor |
| §33–34 Shopify entegrasyonu | Var | Tasarım token'ı + sipariş webhook |
| §35–36 Maliyet / kredi kontrolü | Var | `customer-ai-quota` (3 hak), `ip-quota`, `ai-generation-usage` |
| §2 Arka plan silme | Var | Photoroom + `auto-bg-removal.server.ts` |
| §29 Yüz / kimlik koruma | Var, dahası | Google Vision kafa tespiti (`face-detect.server.ts`) |
| §19 Queue | **Yok** | AI polling HTTP isteğinin içinde |
| §15 Preview / final model ayrımı | **Yok** | Tek model |
| §3 Model ID'nin koda gömülmemesi | **İhlal** | `ai-image-generation.server.ts` içinde sabit |
| §25 Kullanıcıya açılan ayarlar | **Yok** | Tüm ayarlar admin tarafında, şablona sabit |

---

## 3. Dokümanın kendi hedefine zaten ulaşılmış

Kaynak doküman §31–32'de iki üretim modu tanımlıyor ve şunu söylüyor:

- **Mode A** — AI kullanıcı fotoğrafını doğrudan düzenler. "Kolay, hızlı MVP",
  ama yüz bozulur, metin bozulur, layout kontrolü yoktur.
- **Mode B** — AI sadece dekorasyonu üretir; fotoğrafı ve metni uygulama
  yerleştirir. "Uzun vadede tercih edilmesi gereken yöntem budur."

`app/lib/scatter-compose.server.ts` **tam olarak Mode B'yi uyguluyor**: kafa
kesiti alınır, arka plan silinir, süsleme şablondan gelir, metin gerçek fontla
basılır. Doküman bunu Faz 5 hedefi sanıyor; sistemde Faz 0 olarak mevcut.

**Karar:** MVP'yi hızlandırmak için Mode A'ya geçme önerisi (doküman §52)
reddedilmiştir — geriye gitmek olur.

---

## 4. Dokümanın haklı olduğu, gerçekten eksik olan noktalar

### 4.1 Queue yok — en yüksek öncelikli risk

`personalizer-ai.server.ts` HTTP isteğinin içinde 120 saniyeye kadar polling
yapıyor (`POLL_MAX_MS = 120_000`). `ai-image-generation.server.ts` aynı şeyi 90
saniyeyle yapıyor.

Üretimde pm2 altında **2 cluster worker** var. Aynı anda 2 kullanıcı AI
tetiklediğinde her iki worker da bloke olur ve uygulama tüm istekler için
cevapsız kalır. "Yeniden üret" özelliği eklenirse bu risk katlanır.

Doküman §19 bu konuda haklı. Ancak önerdiği Redis + Laravel Horizon gerekli
değil: tek sunucu ve mevcut PostgreSQL ile job tablosu + status polling yeterli.

> **Bu, müşteri ayarları katmanından önce çözülmesi gereken kalemdir.**
> Regenerate özelliği queue olmadan açılmamalıdır.

### 4.2 Preview / final model ayrımı yok

Doküman §15 haklı: ucuz model önizleme, pahalı model onay sonrası. Şu an her
üretim aynı modelle yapılıyor. Doğrudan maliyet kalemi.

### 4.3 Model ID'leri koda gömülü

`ai-image-generation.server.ts` içinde `IMAGE_MODEL` sabit. Koddaki yorum, model
adının daha önce değişip 400 "Model not found" döndürdüğünü kaydediyor — yani bu
hata bir kez yaşanmış. Doküman §3 haklı; ayar tarafına taşınmalı.

### 4.4 Müşteriye ayar sunulmuyor

Asıl talep edilen özellik. `ai_style`, `faceCount`, `decorationCount`,
`faceScale` ve benzeri ayarların tamamı `app.personalizer.$id.tsx` içinde
**admin tarafında, şablona sabit** olarak tanımlanıyor. Müşteri
(`TemplateScatterModal.tsx`) yalnızca fotoğraf ve metin giriyor.

---

## 5. Dokümana uyulmaması gereken yerler

| Öneri | Neden uygulanmıyor |
|---|---|
| Laravel backend | Uygulama Remix; ikinci bir stack maliyeti |
| Konva.js | Fabric.js editörü mevcut ve baskı akışına bağlı |
| Redis / Horizon | Tek sunucu; PostgreSQL job tablosu yeterli |
| `ai_designs` tablosu | `personalizer_templates` + tasarım JSON'u bu işi görüyor |
| `ai_design_text_layers` tablosu | Fabric.js tasarım JSON'unu ikiye böler |
| Mode A ile MVP (§52) | Mode B zaten çalışıyor |

---

## 6. Uygulama sırası

### Faz 1 — Müşteri ayarları katmanı (bu iş)

1. `personalizer_templates` tablosuna `customer_options JSON` kolonu: admin
   hangi ayarların müşteriye açılacağını seçer.
2. Admin UI'da bu ayarların yönetimi.
3. `TemplateScatterModal` / `TemplatePhotoModal` açık ayarları render eder.
4. `api.personalizer.preview` gelen değerleri **allowlist ile** doğrular;
   `ai_style` ve `scatter_config` bu değerlerle override edilir.

### Faz 2 — Queue (ayrı iş, regenerate'ten önce)

PostgreSQL job tablosu, status polling, `GenerateAiDesign` karşılığı worker.

### Faz 3 — Maliyet

Preview/final model ayrımı, model ID'lerinin ayarlara taşınması,
"yeniden üret" butonunun mevcut `customer-ai-quota` sistemine bağlanması.

---

## 7. Başarı ölçütleri

Kaynak doküman §53'teki ölçütler geçerlidir, ancak şunlar eklenmelidir:

- AI üretimi sırasında uygulama başka istekleri cevaplamaya devam etmeli
  (queue olmadan sağlanamaz).
- Müşteriye açılan her ayar sunucu tarafında allowlist'ten geçmeli; şablonun
  izin vermediği bir değer istemciden gelirse sessizce şablon varsayılanına
  düşülmeli.

---

İlgili: `sablonlu-tasarim-analizi.md`, `sablonlu-tasarim-analizi2.md`
