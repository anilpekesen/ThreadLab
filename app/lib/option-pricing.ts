/**
 * Seçeneğe göre ek ücret (kişiselleştirici şablonları).
 *
 * Mağaza sahibi şablon başına şunları fiyatlandırabilir:
 *   - sabit kişiselleştirme ücreti,
 *   - her yazı alanı için: doldurulursa sabit ücret, karakter başı ücret
 *     (ilk N karakter ücretsiz), font / renk / boyut değiştirme ücreti,
 *   - ek seçenekler: onay kutusu ("Hediye paketi +20") ya da liste
 *     ("Cam / Akrilik / Pleksi").
 *
 * Hesap sepete eklerken SUNUCUDA yapılır ve tasarım kaydına yazılır; sepet
 * fonksiyonu yalnız zorunlu kısmı (alt sınır) zorlayabildiği için siparişten
 * sonra kayıtlı tutarla ödenen karşılaştırılır. Müşteri sayfasındaki canlı
 * gösterim bu dosyanın aynısını tarayıcı dilinde tekrarlar
 * (slot-embed.server.ts → secenekUcreti).
 */

export interface TextPriceRule {
  /** Alan doldurulursa (varsayılan metinden farklıysa) sabit ücret */
  fee: number;
  /** Karakter başı ücret; boşluklar sayılmaz */
  per_char: number;
  /** Karakter ücretinden muaf ilk karakter sayısı */
  free_chars: number;
  /** Müşteri varsayılan fonttan başka bir font seçerse */
  font: number;
  /** Müşteri varsayılan renkten başka bir renk seçerse */
  color: number;
  /** Müşteri Normal dışında bir boyut seçerse */
  size: number;
}

export interface ExtraChoice {
  id: string;
  label: string;
  price: number;
}

export interface ExtraOption {
  id: string;
  label: string;
  /** checkbox: tek seçenek, işaretlenirse ücreti eklenir; select: listeden biri */
  type: "checkbox" | "select";
  /** Yalnız select için: müşteri bir seçim yapmadan sepete ekleyemez */
  required: boolean;
  choices: ExtraChoice[];
}

export interface OptionPricing {
  /** Her kişiselleştirilmiş ürüne eklenen sabit ücret */
  base: number;
  texts: Record<string, TextPriceRule>;
  extras: ExtraOption[];
}

export const EMPTY_OPTION_PRICING: OptionPricing = { base: 0, texts: {}, extras: [] };

const MAX_EXTRAS = 10;
const MAX_CHOICES = 12;

function money(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.round(Math.min(n, 100000) * 100) / 100 : 0;
}

function count(x: unknown): number {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 0;
}

function cleanId(x: unknown, fallback: string): string {
  const s = String(x ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return s || fallback;
}

function cleanLabel(x: unknown): string {
  return String(x ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function normalizeOptionPricing(raw: unknown): OptionPricing {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<OptionPricing>;
  const texts: Record<string, TextPriceRule> = {};
  if (o.texts && typeof o.texts === "object") {
    for (const [id, r] of Object.entries(o.texts as Record<string, Partial<TextPriceRule>>)) {
      const rule: TextPriceRule = {
        fee: money(r?.fee),
        per_char: money(r?.per_char),
        free_chars: count(r?.free_chars),
        font: money(r?.font),
        color: money(r?.color),
        size: money(r?.size),
      };
      // Hiç ücreti olmayan kural saklanmaz
      if (rule.fee || rule.per_char || rule.font || rule.color || rule.size) texts[cleanId(id, "t")] = rule;
    }
  }
  const extras: ExtraOption[] = [];
  const seen = new Set<string>();
  for (const [i, e] of (Array.isArray(o.extras) ? o.extras : []).slice(0, MAX_EXTRAS).entries()) {
    const label = cleanLabel(e?.label);
    if (!label) continue;
    let id = cleanId(e?.id, `x${i + 1}`);
    while (seen.has(id)) id += "_";
    seen.add(id);
    const type = e?.type === "select" ? "select" : "checkbox";
    const choiceIds = new Set<string>();
    const choices: ExtraChoice[] = [];
    for (const [j, c] of (Array.isArray(e?.choices) ? e.choices : []).slice(0, MAX_CHOICES).entries()) {
      const cl = cleanLabel(c?.label) || (type === "checkbox" ? label : "");
      if (!cl) continue;
      let cid = cleanId(c?.id, `c${j + 1}`);
      while (choiceIds.has(cid)) cid += "_";
      choiceIds.add(cid);
      choices.push({ id: cid, label: cl, price: money(c?.price) });
      if (type === "checkbox") break;
    }
    if (!choices.length) continue;
    extras.push({ id, label, type, required: type === "select" && e?.required === true, choices });
  }
  return { base: money(o.base), texts, extras };
}

export function hasOptionPricing(p: OptionPricing): boolean {
  return p.base > 0 || Object.keys(p.texts).length > 0 || p.extras.some((e) => e.choices.some((c) => c.price > 0));
}

/** Sepet fonksiyonunun zorlayabileceği alt sınır: müşterinin kaçınamayacağı kısım */
export function minimumOptionFee(p: OptionPricing): number {
  let min = p.base;
  for (const e of p.extras) {
    if (e.type === "select" && e.required) min += Math.min(...e.choices.map((c) => c.price));
  }
  return Math.round(min * 100) / 100;
}

/** Yazı alanının şablondaki varsayılanları: ücret yalnız bunlardan sapınca alınır */
export interface TextDefaults {
  defaultValue: string;
  fontUrl: string;
  color: string;
}

export interface OptionSelection {
  texts: Record<string, string>;
  fonts: Record<string, string>;
  colors: Record<string, string>;
  sizes: Record<string, number>;
  /** ek seçenek kimliği -> seçim kimliği */
  extras: Record<string, string>;
}

export type FeeLine =
  | { kind: "base"; amount: number }
  | { kind: "text" | "chars" | "font" | "color" | "size"; field: string; amount: number; chars?: number }
  | { kind: "extra"; option: string; choice: string; amount: number };

export interface OptionFee {
  total: number;
  lines: FeeLine[];
  /** Geçerli seçimler: ek seçenek kimliği -> seçim kimliği */
  extras: Record<string, string>;
  /** Seçilmemiş zorunlu seçenekler */
  missing: string[];
}

function chargeableChars(value: string): number {
  return Array.from(value.replace(/\s+/g, "")).length;
}

export function computeOptionFee(
  p: OptionPricing,
  sel: OptionSelection,
  defaults: Record<string, TextDefaults>,
): OptionFee {
  const lines: FeeLine[] = [];
  if (p.base > 0) lines.push({ kind: "base", amount: p.base });

  for (const [field, rule] of Object.entries(p.texts)) {
    const d = defaults[field];
    if (!d) continue;
    const value = String(sel.texts[field] ?? "").trim();
    const customized = value !== "" && value !== d.defaultValue.trim();
    if (customized && rule.fee) lines.push({ kind: "text", field, amount: rule.fee });
    if (customized && rule.per_char) {
      const chars = Math.max(0, chargeableChars(value) - rule.free_chars);
      if (chars > 0) lines.push({ kind: "chars", field, chars, amount: Math.round(chars * rule.per_char * 100) / 100 });
    }
    const font = sel.fonts[field];
    if (rule.font && font && font !== d.fontUrl) lines.push({ kind: "font", field, amount: rule.font });
    const color = sel.colors[field];
    if (rule.color && color && color.toLowerCase() !== d.color.toLowerCase()) lines.push({ kind: "color", field, amount: rule.color });
    const size = Number(sel.sizes[field]);
    if (rule.size && Number.isFinite(size) && size > 0 && size !== 1) lines.push({ kind: "size", field, amount: rule.size });
  }

  const chosen: Record<string, string> = {};
  const missing: string[] = [];
  for (const e of p.extras) {
    const want = sel.extras[e.id];
    const c = e.choices.find((x) => x.id === want);
    if (!c) {
      if (e.required) missing.push(e.id);
      continue;
    }
    chosen[e.id] = c.id;
    if (c.price > 0) lines.push({ kind: "extra", option: e.id, choice: c.id, amount: c.price });
  }

  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  return { total, lines, extras: chosen, missing };
}
