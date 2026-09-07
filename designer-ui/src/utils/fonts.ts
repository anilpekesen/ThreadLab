import { fabric } from 'fabric';
import { GOOGLE_FONTS } from '@/types';
import type { CurvedText } from '@/utils/curvedText';

/**
 * Web fontlarını canvas'a çizmeden ÖNCE hazır hale getirir.
 *
 * Google fontları `display=swap` ile asenkron geliyor. Font gelmeden fabric
 * metni ölçerse (initDimensions) yedek fontun ölçüsünü önbelleğe alıyor ve o
 * ölçüyle çiziyor — sonuçta yazının kuyruğu export'a hiç girmiyor. 12528 no'lu
 * siparişte "Beyond the Surface" hem önizlemeye hem baskı dosyasına "Beyond the
 * Surfa" olarak düştü: kayıtlı ölçü 252.36 idi, Space Grotesk'in gerçek ölçüsü
 * 310.57.
 *
 * Bu yüzden font ailesi değiştirilmeden ve export alınmadan önce burası
 * bekletiliyor, ardından metin nesneleri yeniden ölçtürülüyor.
 */

/** Tarayıcıda hazır gelen aileler — Google'dan istenmemeli. */
const SYSTEM_FONTS = new Set(['Arial', 'Georgia', 'Impact']);

/** Aile başına tek seferlik yükleme sözü (aynı font iki kez indirilmesin). */
const inFlight = new Map<string, Promise<boolean>>();

function stylesheetHref(family: string, bold: boolean): string {
  const name = family.trim().replace(/\s+/g, '+');
  // Bazı ailelerin 700 kesimi yok; ":wght@700" isteği Google'dan 400 döner.
  // Bu yüzden normal ve kalın ayrı <link>'ler — kalın başarısız olursa
  // tarayıcı sentetik bold kullanır, normal kesim yine de gelir.
  return bold
    ? `https://fonts.googleapis.com/css2?family=${name}:wght@700&display=swap`
    : `https://fonts.googleapis.com/css2?family=${name}&display=swap`;
}

/** <link> ekler ve parse edilene kadar bekler (hata da olsa çözülür). */
function loadStylesheet(href: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
      if (existing.dataset.settled === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
      return;
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    const settle = () => {
      link.dataset.settled = '1';
      resolve();
    };
    link.addEventListener('load', settle, { once: true });
    link.addEventListener('error', settle, { once: true });
    document.head.appendChild(link);
  });
}

async function loadFaces(family: string): Promise<number> {
  const specs = [`400 32px "${family}"`, `700 32px "${family}"`];
  const results = await Promise.all(
    specs.map((spec) => document.fonts.load(spec).catch(() => [] as FontFace[])),
  );
  return results.reduce((total, faces) => total + faces.length, 0);
}

/**
 * Fabric, karakter genişliklerini aile bazında `fabric.charWidthsCache`'te
 * tutuyor. Font inmeden bir ölçüm yapıldıysa yedek fontun genişlikleri orada
 * kalıyor ve tek başına initDimensions() çağırmak yetmiyor — aynı aile için
 * açılan yeni metinler bile eski ölçüyü kullanıyor. Font indikten sonra bu
 * önbellek düşürülmeli.
 */
function dropStaleMetrics(family: string): true {
  fabric.util.clearFabricFontCache(family);
  return true;
}

/**
 * Verilen aileyi indirir ve kullanıma hazır olana kadar bekler.
 * @returns font gerçekten yüklendiyse true; yedek fontla devam edilecekse false
 */
export async function ensureFontLoaded(family: string): Promise<boolean> {
  const name = String(family || '').trim();
  if (!name || typeof document === 'undefined' || !document.fonts) return true;
  if (SYSTEM_FONTS.has(name)) return true;

  const cached = inFlight.get(name);
  if (cached) return cached;

  const task = (async () => {
    // Önce mevcut @font-face tanımlarıyla dene — index.css'teki @import ile
    // gelen aileler için ek bir istek atmaya gerek yok.
    if (await loadFaces(name) > 0) return dropStaleMetrics(name);
    if (!GOOGLE_FONTS.includes(name)) return false;

    // Tanım yoksa aileyi talep üzerine ekle. GOOGLE_FONTS listesindeki bazı
    // aileler (Teko, Lobster, Nunito...) hiçbir stylesheet'te yoktu; onlar
    // sessizce yedek fontla çiziliyordu.
    const slug = name.replace(/\s+/g, '-').toLowerCase();
    await Promise.all([
      loadStylesheet(stylesheetHref(name, false), `printlab-font-${slug}`),
      loadStylesheet(stylesheetHref(name, true), `printlab-font-${slug}-bold`),
    ]);
    return await loadFaces(name) > 0 ? dropStaleMetrics(name) : false;
  })();

  inFlight.set(name, task);
  return task;
}

function isFabricText(obj: fabric.Object): obj is fabric.Text {
  return obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox';
}

/** Canvas'taki metin nesnelerinin kullandığı font aileleri. */
export function collectFontFamilies(cv: fabric.Canvas | null): string[] {
  if (!cv) return [];
  const families = new Set<string>();
  for (const obj of cv.getObjects()) {
    if (isFabricText(obj) || obj.type === 'curvedText') {
      const family = (obj as fabric.Text).fontFamily;
      if (family) families.add(family);
    }
  }
  return [...families];
}

/**
 * Metin nesnelerini yeniden ölçtürür. Font sonradan geldiyse fabric'in
 * önbellekteki (yanlış) ölçüsü burada tazelenir.
 */
export function remeasureTextObjects(cv: fabric.Canvas | null): void {
  if (!cv) return;
  let touched = false;
  for (const obj of cv.getObjects()) {
    if (isFabricText(obj)) {
      (obj as fabric.Text & { initDimensions?: () => void }).initDimensions?.();
      obj.setCoords();
      obj.dirty = true;
      touched = true;
    } else if (obj.type === 'curvedText') {
      // applyProps her çağrıda _refreshBounds ile yeniden ölçer
      (obj as unknown as CurvedText).applyProps({});
      touched = true;
    }
  }
  if (touched) cv.renderAll();
}

/**
 * Canvas'taki tüm fontları hazırlar ve metinleri yeniden ölçtürür.
 * Export'tan (önizleme/baskı dosyası) hemen önce çağrılmalı.
 */
export async function ensureCanvasFontsReady(cv: fabric.Canvas | null): Promise<void> {
  if (!cv) return;
  const families = collectFontFamilies(cv);
  if (!families.length) return;
  await Promise.all(families.map((family) => ensureFontLoaded(family)));
  try {
    await document.fonts.ready;
  } catch {
    /* FontFaceSet yoksa yedek fontla devam */
  }
  remeasureTextObjects(cv);
}
