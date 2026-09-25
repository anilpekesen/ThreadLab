/**
 * Üreticilerin istemci-güvenli ayar modülleri. Yönetim ekranı ve model
 * katmanı ayarı normalize etmek için bunu kullanır (sunucu çizim kodunu
 * tarayıcı paketine sokmadan).
 */
import type { GeneratorConfigBase, GeneratorConfigModule, GeneratorKind } from "./types";
import { isGeneratorKind } from "./types";
import { songConfig } from "./song/config";
import { monogramConfig } from "./monogram/config";
import { starmapConfig } from "./starmap/config";
import { citymapConfig } from "./citymap/config";
import { birthflowerConfig } from "./birthflower/config";
import { calendarConfig } from "./calendar/config";
import { wordsearchConfig } from "./wordsearch/config";
import { moonphaseConfig } from "./moonphase/config";
import { qrcodeConfig } from "./qrcode/config";

export const GENERATOR_CONFIGS: Record<GeneratorKind, GeneratorConfigModule<GeneratorConfigBase>> = {
  song: songConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  monogram: monogramConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  starmap: starmapConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  citymap: citymapConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  birthflower: birthflowerConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  calendar: calendarConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  wordsearch: wordsearchConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  moonphase: moonphaseConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
  qrcode: qrcodeConfig as unknown as GeneratorConfigModule<GeneratorConfigBase>,
};

/** Kayıttaki ham ayarı normalize eder; tür tanınmazsa null (üretici değil) */
export function normalizeGeneratorConfig(raw: unknown): GeneratorConfigBase | null {
  const kind = (raw as { kind?: unknown } | null)?.kind;
  if (!isGeneratorKind(kind)) return null;
  return GENERATOR_CONFIGS[kind].normalize(raw);
}
