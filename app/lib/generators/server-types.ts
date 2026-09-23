import type {
  GeneratorComposeResult,
  GeneratorConfigBase,
  GeneratorConfigModule,
  GeneratorInput,
} from "./types";

/**
 * Üreticinin sunucu parçası. `<kind>/index.server.ts` dosyasında tanımlanır ve
 * `registry.server.ts` üzerinden bulunur.
 */
export interface GeneratorServerModule<C extends GeneratorConfigBase> {
  config: GeneratorConfigModule<C>;
  /**
   * Müşteri penceresine gidecek, yalnızca şablonun açtığı seçenekler (renk
   * listesi, fontlar, stiller, alan etiketleri, karakter sınırları...).
   * Gizli ya da maliyetli ayar (API anahtarı vb.) buraya konmaz.
   */
  publicAssets(config: C): Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * Baskıya hazır PNG çizer. Girdi doğrulanmamış istemci verisidir: sınırlar
   * burada uygulanır, geçersiz seçim şablonun ilk izinli değerine döner.
   * Müşteriye gösterilecek bir sorun varsa `GeneratorInputError` fırlatılır.
   */
  compose(config: C, input: GeneratorInput, ctx: { shop: string }): Promise<GeneratorComposeResult>;
}
