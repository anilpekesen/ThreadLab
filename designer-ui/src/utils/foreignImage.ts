import type { DesignerConfig } from '@/types';

/**
 * Mağazanın kendi sunucusundaki görseller (ör. WooCommerce wp-content/uploads)
 * CORS başlığı vermez; tuvale çizilince baskı dosyası üretilemez ve sepete
 * ekleme sessizce düşer. Bu adresler sunucumuzdaki görsel aktarıcıdan geçer.
 * Shopify CDN ve kendi alan adımız zaten izinli; assets.printlabapp.com'u
 * mevcut kod ayrıca aktarıyor.
 */
const CORS_OK = new Set(['cdn.shopify.com', 'assets.printlabapp.com']);

export function proxyForeignImage(url: string): string;
export function proxyForeignImage(url: string | null | undefined): string | null | undefined;
export function proxyForeignImage(url: string | null | undefined) {
  if (!url) return url;
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return url;
    if (u.origin === window.location.origin || CORS_OK.has(u.hostname)) return url;
    return `/api/img-proxy?url=${encodeURIComponent(u.href)}`;
  } catch {
    return url;
  }
}

/** Mağazadan gelen yapılandırmadaki ürün görsellerini aktarıcıya çevirir */
export function proxyConfigImages<T extends Partial<DesignerConfig>>(cfg: T): T {
  const variant = <V extends { featured_image?: { src: string } | null }>(v: V): V =>
    v.featured_image?.src ? { ...v, featured_image: { ...v.featured_image, src: proxyForeignImage(v.featured_image.src) } } : v;
  return {
    ...cfg,
    ...(cfg.frontImage !== undefined ? { frontImage: proxyForeignImage(cfg.frontImage) } : {}),
    ...(cfg.backImage !== undefined ? { backImage: proxyForeignImage(cfg.backImage) } : {}),
    ...(Array.isArray(cfg.variants) ? { variants: cfg.variants.map(variant) } : {}),
    ...(cfg.selectedVariant ? { selectedVariant: variant(cfg.selectedVariant) } : {}),
  };
}
