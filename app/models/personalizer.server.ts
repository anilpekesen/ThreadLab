import { query } from "~/lib/db.server";
import { randomBytes } from "node:crypto";
import { AI_STYLES, normalizeAiConfig, type AiTemplateConfig } from "~/lib/ai-styles";
import { normalizeSlots, type GridConfig, type Slot } from "~/lib/slots";

export interface TextFieldDef {
  id: string;
  label: string;
  placeholder: string;
  /** Müşteri değiştirmezse baskıda kullanılacak başlangıç değeri */
  default_value?: string;
  x: number;
  y: number;
  font_size: number;
  color: string;
  bold: boolean;
  max_length: number;
  align: "left" | "center" | "right";
}

/** Şablonun müşteri fotoğrafını tasarıma çevirme yöntemi */
export type TemplateLayoutMode = "mask" | "scatter" | "ai";

export function normalizeLayoutMode(raw: unknown): TemplateLayoutMode {
  const v = String(raw ?? "");
  return v === "scatter" || v === "ai" ? v : "mask";
}

/** Dağıtımlı şablonun ayarları */
export interface ScatterTemplateConfig {
  faceCount: number;
  decorationCount: number;
  faceScale: number;
  decorationScale: number;
  sizeJitter: number;
  angleJitter: number;
  reserveCenter: { width: number; height: number } | null;
  seed: number;
  /** Üretilecek tasarımın piksel tuvali; yoksa 2400x1650 kullanılır. */
  canvasWidth?: number;
  canvasHeight?: number;
}

/**
 * Müşteriye açılan ayarlar.
 *
 * Şablonun `scatter_config` değerleri mağaza sahibinin kararıdır; buradaki
 * bayraklar yalnızca müşterinin o değerin ÜSTÜNE sınırlı bir oynama yapıp
 * yapamayacağını söyler. Müşteri ham sayı göndermez — üç kademeli bir seçim
 * yapar, sunucu onu çarpana çevirir. Böylece istemciden gelen hiçbir değer
 * doğrudan yerleşim motoruna geçmez.
 */
export interface CustomerOptionsConfig {
  /** Yoğunluk: parça sayısını azaltır/artırır */
  density: boolean;
  /** Boyut: kafa ve süsleme ölçeğini büyütür/küçültür */
  photoSize: boolean;
  /** Dizilim: aynı ayarlarla farklı bir yerleşim tohumu dener */
  shuffle: boolean;
  /**
   * AI şablonunda müşteriye açılan stil listesi. Boş dizi = müşteri stil
   * seçemez, şablonun kendi `ai_style` değeri kullanılır. Model seçimi asla
   * müşteriye açılmaz — maliyeti öngörülemez hale getirir.
   */
  aiStyles: string[];
}

export const DEFAULT_CUSTOMER_OPTIONS: CustomerOptionsConfig = {
  density: false,
  photoSize: false,
  shuffle: false,
  aiStyles: [],
};

export type DensityChoice = "low" | "medium" | "high";
export type PhotoSizeChoice = "small" | "medium" | "large";

/** Müşterinin pencerede yaptığı seçimler; hepsi opsiyonel */
export interface CustomerChoices {
  density?: DensityChoice;
  photoSize?: PhotoSizeChoice;
  /** Kaçıncı dizilim varyantı; 0 = şablonun kendi tohumu */
  variant?: number;
}

const DENSITY_FACTOR: Record<DensityChoice, number> = { low: 0.6, medium: 1, high: 1.5 };
const PHOTO_SIZE_FACTOR: Record<PhotoSizeChoice, number> = { small: 0.8, medium: 1, large: 1.25 };
/** Müşteri sınırsız yerleşim deneyemesin — her deneme bir kompozisyon demek */
const MAX_VARIANT = 5;

export function normalizeCustomerOptions(raw: unknown): CustomerOptionsConfig {
  const o = (raw ?? {}) as Partial<CustomerOptionsConfig>;
  return {
    density: o.density === true,
    photoSize: o.photoSize === true,
    shuffle: o.shuffle === true,
    // Yalnızca tanınan stil kimlikleri kalır; şablona elle yazılmış bir değer
    // müşteri penceresine düşmesin
    aiStyles: Array.isArray(o.aiStyles)
      ? o.aiStyles.map(String).filter((s) => s in AI_STYLES)
      : [],
  };
}

/**
 * İstemciden gelen seçimleri şablonun izin verdiği ölçüde `scatter_config`
 * üstüne uygular.
 *
 * Şablon bir ayarı açmadıysa o seçim sessizce yok sayılır: kötü niyetli ya da
 * eski bir istemci pencerede olmayan bir ayarı göndererek üretimi değiştiremez.
 */
export function applyCustomerChoices(
  base: Partial<ScatterTemplateConfig>,
  options: CustomerOptionsConfig,
  choices: CustomerChoices,
): Partial<ScatterTemplateConfig> {
  const out: Partial<ScatterTemplateConfig> = { ...base };

  if (options.density && choices.density && choices.density in DENSITY_FACTOR) {
    const factor = DENSITY_FACTOR[choices.density];
    if (typeof out.faceCount === "number") {
      out.faceCount = Math.max(1, Math.round(out.faceCount * factor));
    }
    if (typeof out.decorationCount === "number") {
      // Süsleme 0 ise şablonda kapalı demektir; yoğunluk onu geri açmamalı
      out.decorationCount = out.decorationCount > 0
        ? Math.max(1, Math.round(out.decorationCount * factor))
        : 0;
    }
  }

  if (options.photoSize && choices.photoSize && choices.photoSize in PHOTO_SIZE_FACTOR) {
    const factor = PHOTO_SIZE_FACTOR[choices.photoSize];
    if (typeof out.faceScale === "number") out.faceScale = out.faceScale * factor;
    // Süsleme kafayla birlikte ölçeklenir; yalnızca kafayı büyütmek ikisinin
    // boy farkını bozup referans görünümü değiştiriyor
    if (typeof out.decorationScale === "number") out.decorationScale = out.decorationScale * factor;
  }

  if (options.shuffle && typeof choices.variant === "number" && Number.isFinite(choices.variant)) {
    const variant = Math.min(MAX_VARIANT, Math.max(0, Math.floor(choices.variant)));
    if (variant > 0) out.seed = (out.seed ?? 1) + variant * 977;
  }

  return out;
}

export interface PersonalizerTemplate {
  id: string;
  shop: string;
  name: string;
  description: string;
  template_url: string;   // design template (karikatürün yerleşeceği tasarım)
  mockup_url: string;     // frame/lifestyle (tasarımın gireceği çerçeve)
  photo_x: number;        // karikatür → tasarım üzerindeki alan
  photo_y: number;
  photo_width: number;
  photo_height: number;
  mockup_x: number;       // tasarım → çerçeve üzerindeki alan
  mockup_y: number;
  mockup_width: number;
  mockup_height: number;
  text_fields: TextFieldDef[];
  ai_style: string;
  /** Fotoğrafın gireceği boşluğa tıklanan nokta; -1 ise şeffaf delik aranır */
  hole_seed_x: number;
  hole_seed_y: number;
  /**
   * 'mask'    = fotoğrafı tasarımın boşluğuna maskele
   * 'scatter' = kafa kesitini baskı alanına dağıt
   * 'ai'      = fotoğrafı AI ile stilize et, üstüne yazıları bas
   */
  layout_mode: TemplateLayoutMode;
  scatter_config: ScatterTemplateConfig | Record<string, never>;
  /** Dağıtımda kullanılacak süsleme görseli (kalp vb.) */
  decoration_url: string;
  /** Müşteriye hangi ayarların açılacağı */
  customer_options: CustomerOptionsConfig | Record<string, never>;
  /** AI şablonunun sağlayıcı/model ayarları; diğer tiplerde kullanılmaz */
  ai_config: AiTemplateConfig | Record<string, never>;
  /**
   * Müşterinin dolduracağı alanlar, normalize (0–1) koordinatta.
   *
   * Boş dizi, şablonun henüz göç etmemiş tek fotoğraflı bir kayıt olduğunu
   * gösterir; o durumda okuma anında photo_x/photo_y/photo_width/photo_height
   * değerlerinden türetilir (bkz. slotsFromLegacyTemplate).
   */
  slots: Slot[];
  /** Slotlar ızgara üreticisiyle kurulduysa üretim parametreleri; elle
   *  düzenlenen şablonlarda boş kalır */
  grid_config: GridConfig | Record<string, never>;
  /** Hangi baskı ürününe (ebat, dpi, taşma) ait olduğu */
  print_product_id: string;
  /** Fotoğrafların ÜSTÜNE binen dekoratif katman */
  overlay_url: string;
  /** Yöneticinin beklediği fotoğraf alanı sayısı; kaydetme denetiminde
   *  kullanılır, 0 = kontrol etme */
  expected_slots: number;
  /** Her kaydetmede artar; sipariş hangi sürümle basıldığını bunun üzerinden
   *  saklar ve eski baskı aynen yeniden üretilebilir */
  version: number;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type Row = PersonalizerTemplate;

/** JSONB kolonlarından gelen ham değerleri güvenli tiplere çevirir */
function mapTemplateRow(row: Row): PersonalizerTemplate {
  return {
    ...row,
    slots: normalizeSlots(row.slots),
    print_product_id: String(row.print_product_id ?? ""),
    overlay_url: String(row.overlay_url ?? ""),
    expected_slots: Number(row.expected_slots ?? 0),
    version: Number(row.version ?? 1),
  };
}

export async function listPersonalizerTemplates(shop: string, activeOnly = false): Promise<PersonalizerTemplate[]> {
  const res = await query<Row>(
    `SELECT * FROM personalizer_templates
     WHERE shop = $1 ${activeOnly ? "AND active = TRUE" : ""}
     ORDER BY sort_order ASC, created_at DESC`,
    [shop],
  );
  return res.rows.map(mapTemplateRow);
}

export async function getPersonalizerTemplate(id: string, shop: string): Promise<PersonalizerTemplate | null> {
  const res = await query<Row>(
    `SELECT * FROM personalizer_templates WHERE id = $1 AND shop = $2`,
    [id, shop],
  );
  return res.rows[0] ? mapTemplateRow(res.rows[0]) : null;
}

export async function getPersonalizerTemplatePublic(id: string): Promise<PersonalizerTemplate | null> {
  const res = await query<Row>(
    `SELECT * FROM personalizer_templates WHERE id = $1 AND active = TRUE`,
    [id],
  );
  return res.rows[0] ? mapTemplateRow(res.rows[0]) : null;
}

export interface CreatePersonalizerTemplateInput {
  shop: string;
  name: string;
  description?: string;
  template_url: string;
  mockup_url?: string;
  photo_x: number;
  photo_y: number;
  photo_width: number;
  photo_height: number;
  mockup_x?: number;
  mockup_y?: number;
  mockup_width?: number;
  mockup_height?: number;
  text_fields?: TextFieldDef[];
  ai_style?: string;
  hole_seed_x?: number;
  hole_seed_y?: number;
  layout_mode?: TemplateLayoutMode;
  scatter_config?: ScatterTemplateConfig;
  decoration_url?: string;
  customer_options?: CustomerOptionsConfig;
  ai_config?: AiTemplateConfig;
  slots?: Slot[];
  grid_config?: GridConfig;
  print_product_id?: string;
  overlay_url?: string;
  expected_slots?: number;
  sort_order?: number;
}

export async function createPersonalizerTemplate(input: CreatePersonalizerTemplateInput): Promise<PersonalizerTemplate> {
  const id = randomBytes(12).toString("hex");
  const res = await query<Row>(
    `INSERT INTO personalizer_templates
       (id, shop, name, description, template_url, mockup_url,
        photo_x, photo_y, photo_width, photo_height,
        mockup_x, mockup_y, mockup_width, mockup_height,
        text_fields, ai_style, hole_seed_x, hole_seed_y,
        layout_mode, scatter_config, decoration_url, customer_options, ai_config, sort_order,
        slots, grid_config, print_product_id, overlay_url, expected_slots)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
             $25,$26,$27,$28,$29)
     RETURNING *`,
    [
      id, input.shop, input.name, input.description ?? "",
      input.template_url, input.mockup_url ?? "",
      input.photo_x, input.photo_y, input.photo_width, input.photo_height,
      input.mockup_x ?? 0, input.mockup_y ?? 0, input.mockup_width ?? 0, input.mockup_height ?? 0,
      JSON.stringify(input.text_fields ?? []),
      input.ai_style ?? "caricature",
      input.hole_seed_x ?? -1,
      input.hole_seed_y ?? -1,
      // Bu üçü eskiden INSERT'e hiç girmiyordu: yeni bir dağıtımlı şablon
      // kaydedildiğinde 'mask' olarak dönüyor, ayarları ikinci kayda kadar
      // kayboluyordu.
      input.layout_mode ?? "mask",
      JSON.stringify(input.scatter_config ?? {}),
      input.decoration_url ?? "",
      JSON.stringify(input.customer_options ?? DEFAULT_CUSTOMER_OPTIONS),
      JSON.stringify(normalizeAiConfig(input.ai_config)),
      input.sort_order ?? 0,
      JSON.stringify(input.slots ?? []),
      JSON.stringify(input.grid_config ?? {}),
      input.print_product_id ?? "",
      input.overlay_url ?? "",
      input.expected_slots ?? 0,
    ],
  );
  const created = mapTemplateRow(res.rows[0]);
  await snapshotTemplate(created);
  return created;
}

export interface UpdatePersonalizerTemplateInput {
  hole_seed_x?: number;
  hole_seed_y?: number;
  layout_mode?: TemplateLayoutMode;
  scatter_config?: ScatterTemplateConfig;
  decoration_url?: string;
  customer_options?: CustomerOptionsConfig;
  ai_config?: AiTemplateConfig;
  name?: string;
  description?: string;
  template_url?: string;
  mockup_url?: string;
  photo_x?: number;
  photo_y?: number;
  photo_width?: number;
  photo_height?: number;
  mockup_x?: number;
  mockup_y?: number;
  mockup_width?: number;
  mockup_height?: number;
  text_fields?: TextFieldDef[];
  ai_style?: string;
  slots?: Slot[];
  grid_config?: GridConfig;
  print_product_id?: string;
  overlay_url?: string;
  expected_slots?: number;
  active?: boolean;
  sort_order?: number;
}

export async function updatePersonalizerTemplate(
  id: string,
  shop: string,
  input: UpdatePersonalizerTemplateInput,
): Promise<PersonalizerTemplate | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`);
    const isJsonColumn = k === "text_fields" || k === "scatter_config"
      || k === "customer_options" || k === "ai_config"
      || k === "slots" || k === "grid_config";
    vals.push(isJsonColumn ? JSON.stringify(v) : v);
  }
  if (sets.length === 0) return getPersonalizerTemplate(id, shop);

  sets.push(`updated_at = now()`);
  vals.push(id, shop);

  // Sürüm, BASKIYI ETKİLEYEN bir değişiklikte artar. Yerleşim ya da tasarım
  // değişirse o şablonla basılmış eski siparişlerin yeniden üretimi bozulur;
  // sürüm olmadan hangi hâlin basıldığı bilinemez.
  //
  // Yayına alma/çıkarma ve sıralama baskıyı değiştirmez. Bunları da saysaydık
  // listede bir düğmeye basmak yeni sürüm üretir, sürüm geçmişi anlamsız
  // gürültüyle dolardı.
  const contentChanged = Object.keys(input).some(
    (k) => input[k as keyof UpdatePersonalizerTemplateInput] !== undefined
      && !VERSION_NEUTRAL_FIELDS.has(k),
  );
  if (contentChanged) sets.push("version = version + 1");

  const res = await query<Row>(
    `UPDATE personalizer_templates SET ${sets.join(", ")} WHERE id = $${i} AND shop = $${i + 1} RETURNING *`,
    vals,
  );
  const updated = res.rows[0] ? mapTemplateRow(res.rows[0]) : null;
  if (updated && contentChanged) await snapshotTemplate(updated);
  return updated;
}

/** Baskı çıktısını değiştirmeyen alanlar; bunlar sürüm artırmaz */
const VERSION_NEUTRAL_FIELDS = new Set(["active", "sort_order"]);

/**
 * Şablonun o anki hâlini sürüm tablosuna yazar.
 *
 * Hata durumunda kaydetme işlemi düşürülmüyor: anlık görüntü alınamadı diye
 * mağaza sahibinin çalışması kaybolmamalı. Eksik sürüm, o sürümle basılmış
 * siparişin yeniden üretilememesi demek — kayda geçiyor.
 */
export async function snapshotTemplate(template: PersonalizerTemplate): Promise<void> {
  try {
    await query(
      `INSERT INTO personalizer_template_versions (template_id, version, snapshot)
       VALUES ($1, $2, $3)
       ON CONFLICT (template_id, version) DO NOTHING`,
      [template.id, template.version, JSON.stringify(template)],
    );
  } catch (err) {
    console.error(`[personalizer] ${template.id} v${template.version} anlık görüntüsü alınamadı:`, err);
  }
}

/** Belirli bir sürümün kayıtlı hâli; eski siparişi yeniden basmak için */
export async function getTemplateVersion(
  templateId: string,
  version: number,
): Promise<PersonalizerTemplate | null> {
  const res = await query<{ snapshot: PersonalizerTemplate }>(
    `SELECT snapshot FROM personalizer_template_versions
      WHERE template_id = $1 AND version = $2`,
    [templateId, version],
  );
  const snap = res.rows[0]?.snapshot;
  return snap ? { ...snap, slots: normalizeSlots(snap.slots) } : null;
}

/**
 * Şablonu kopyalar.
 *
 * "Sevgiliye 8 fotoğraflı" ile "Babaya 8 fotoğraflı" aynı yerleşimi, farklı
 * dekor ve yazıları kullanıyor. Klonlama bu tür ürünleri dakikalara indiriyor;
 * paylaşılan yerleşim soyutlaması yerine kopya tercih edildi çünkü kopya
 * üstünde oynamak kaynağı bozmuyor.
 *
 * Kopya taslak olarak açılıyor: yanlışlıkla eksik bir şablon canlıya çıkmasın.
 */
export async function duplicatePersonalizerTemplate(
  id: string,
  shop: string,
  newName?: string,
): Promise<PersonalizerTemplate | null> {
  const source = await getPersonalizerTemplate(id, shop);
  if (!source) return null;

  const created = await createPersonalizerTemplate({
    shop,
    name: newName?.trim() || `${source.name} (kopya)`,
    description: source.description,
    template_url: source.template_url,
    mockup_url: source.mockup_url,
    photo_x: source.photo_x,
    photo_y: source.photo_y,
    photo_width: source.photo_width,
    photo_height: source.photo_height,
    mockup_x: source.mockup_x,
    mockup_y: source.mockup_y,
    mockup_width: source.mockup_width,
    mockup_height: source.mockup_height,
    text_fields: source.text_fields,
    ai_style: source.ai_style,
    hole_seed_x: source.hole_seed_x,
    hole_seed_y: source.hole_seed_y,
    layout_mode: source.layout_mode,
    scatter_config: source.scatter_config as ScatterTemplateConfig,
    decoration_url: source.decoration_url,
    customer_options: source.customer_options as CustomerOptionsConfig,
    ai_config: source.ai_config as AiTemplateConfig,
    slots: source.slots,
    grid_config: source.grid_config as GridConfig,
    print_product_id: source.print_product_id,
    overlay_url: source.overlay_url,
    expected_slots: source.expected_slots,
    sort_order: source.sort_order + 1,
  });

  // Kopya doğrudan yayına girmesin
  return updatePersonalizerTemplate(created.id, shop, { active: false });
}

export async function deletePersonalizerTemplate(id: string, shop: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM personalizer_templates WHERE id = $1 AND shop = $2`,
    [id, shop],
  );
  return (res.rowCount ?? 0) > 0;
}

// ── Frame (çerçeve seçeneği) ────────────────────────────────────────────────

export interface PersonalizerFrame {
  id: string;
  template_id: string;
  name: string;
  mockup_url: string;
  mockup_x: number;
  mockup_y: number;
  mockup_width: number;
  mockup_height: number;
  text_fields: TextFieldDef[];
  sort_order: number;
  created_at: string;
}

export async function listPersonalizerFrames(templateId: string): Promise<PersonalizerFrame[]> {
  const res = await query<PersonalizerFrame>(
    `SELECT * FROM personalizer_frames WHERE template_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [templateId],
  );
  return res.rows;
}

export async function getPersonalizerFramePublic(id: string): Promise<PersonalizerFrame | null> {
  const res = await query<PersonalizerFrame>(
    `SELECT * FROM personalizer_frames WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function createPersonalizerFrame(input: {
  template_id: string;
  name: string;
  mockup_url: string;
  mockup_x: number;
  mockup_y: number;
  mockup_width: number;
  mockup_height: number;
  text_fields?: TextFieldDef[];
  sort_order?: number;
}): Promise<PersonalizerFrame> {
  const id = randomBytes(12).toString("hex");
  const res = await query<PersonalizerFrame>(
    `INSERT INTO personalizer_frames
       (id, template_id, name, mockup_url, mockup_x, mockup_y, mockup_width, mockup_height, text_fields, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      id,
      input.template_id,
      input.name,
      input.mockup_url,
      input.mockup_x,
      input.mockup_y,
      input.mockup_width,
      input.mockup_height,
      JSON.stringify(input.text_fields ?? []),
      input.sort_order ?? 0,
    ],
  );
  return res.rows[0];
}

export async function updatePersonalizerFrame(
  id: string,
  input: { name?: string; mockup_url?: string; mockup_x?: number; mockup_y?: number; mockup_width?: number; mockup_height?: number; text_fields?: TextFieldDef[]; sort_order?: number },
): Promise<PersonalizerFrame | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(k === "text_fields" ? JSON.stringify(v) : v);
  }
  if (sets.length === 0) return getPersonalizerFramePublic(id);
  vals.push(id);
  const res = await query<PersonalizerFrame>(
    `UPDATE personalizer_frames SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return res.rows[0] ?? null;
}

export async function deletePersonalizerFrame(id: string, templateId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM personalizer_frames WHERE id = $1 AND template_id = $2`,
    [id, templateId],
  );
  return (res.rowCount ?? 0) > 0;
}

// ── Product links ───────────────────────────────────────────────────────────

/** Ürünün hangi yüzü — tasarımcıdaki front/back sekmeleriyle aynı */
export type TemplateSide = "front" | "back";

export function normalizeSide(raw: unknown): TemplateSide {
  return String(raw ?? "").toLowerCase() === "back" ? "back" : "front";
}

export interface PersonalizerProductLink {
  shop: string;
  product_id: string;
  /** Bir ürünün ön ve arka yüzü ayrı şablonlara bağlanabilir */
  side: TemplateSide;
  template_id: string;
  product_title: string;
  product_handle: string;
  variant_id: string;
  created_at: string;
  updated_at: string;
}

export async function linkPersonalizerProduct(input: {
  shop: string;
  product_id: string;
  side?: TemplateSide;
  template_id: string;
  product_title?: string;
  product_handle?: string;
  variant_id?: string;
}): Promise<PersonalizerProductLink> {
  const res = await query<PersonalizerProductLink>(
    `INSERT INTO personalizer_product_links
       (shop, product_id, side, template_id, product_title, product_handle, variant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (shop, product_id, side)
     DO UPDATE SET
       template_id = EXCLUDED.template_id,
       product_title = EXCLUDED.product_title,
       product_handle = EXCLUDED.product_handle,
       variant_id = EXCLUDED.variant_id,
       updated_at = now()
     RETURNING *`,
    [
      input.shop,
      input.product_id,
      normalizeSide(input.side),
      input.template_id,
      input.product_title ?? "",
      input.product_handle ?? "",
      input.variant_id ?? "",
    ],
  );
  return res.rows[0];
}

export async function listPersonalizerProductLinks(templateId: string): Promise<PersonalizerProductLink[]> {
  const res = await query<PersonalizerProductLink>(
    `SELECT * FROM personalizer_product_links WHERE template_id = $1 ORDER BY updated_at DESC`,
    [templateId],
  );
  return res.rows;
}

export async function getPersonalizerTemplateByProduct(
  shop: string,
  productId: string,
  side: TemplateSide = "front",
): Promise<PersonalizerTemplate | null> {
  const res = await query<PersonalizerTemplate>(
    `SELECT pt.*
       FROM personalizer_product_links ppl
       JOIN personalizer_templates pt ON pt.id = ppl.template_id
      WHERE ppl.shop = $1 AND ppl.product_id = $2 AND ppl.side = $3 AND pt.active = TRUE
      LIMIT 1`,
    [shop, productId, normalizeSide(side)],
  );
  return res.rows[0] ?? null;
}

/** Ürünün hangi yüzlerinde şablon var — tasarımcı sekmeleri buna göre çizilir */
export async function listTemplateSidesForProduct(
  shop: string,
  productId: string,
): Promise<TemplateSide[]> {
  const res = await query<{ side: TemplateSide }>(
    `SELECT ppl.side
       FROM personalizer_product_links ppl
       JOIN personalizer_templates pt ON pt.id = ppl.template_id
      WHERE ppl.shop = $1 AND ppl.product_id = $2 AND pt.active = TRUE`,
    [shop, productId],
  );
  return res.rows.map((r) => normalizeSide(r.side));
}
