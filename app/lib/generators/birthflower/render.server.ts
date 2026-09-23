import type { BirthflowerStyle } from "./config";
import type { Part } from "./flowers.server";

export interface Box { x: number; y: number; w: number; h: number }

/** Parçaların kontrol noktalarından kaba sınır kutusu (çizgi payı hariç) */
export function partsBox(parts: Part[]): Box | null {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of parts) {
    for (const [x, y] of p.path.points()) {
      if (x < x1) x1 = x;
      if (y < y1) y1 = y;
      if (x > x2) x2 = x;
      if (y > y2) y2 = y;
    }
  }
  return Number.isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

const f = (n: number) => Number(n.toFixed(2)).toString();

/**
 * Parçaları seçilen stilde SVG'ye çevirir.
 *
 * Çizgiler bir maske içinde boyanır: her kapalı parça önce siyahla dolup
 * arkasında kalan çizgileri siler, sonra kendi konturunu beyazla çizer.
 * Maske tek bir mürekkep dikdörtgenine uygulanınca şeffaf zeminde, üst üste
 * binen yapraklarda bile temiz bir "kalemle çizilmiş" görünüm çıkar.
 *
 * Siluette tersine: parçalar beyazla dolar, konturları ince siyah bir boşluk
 * olarak kesilir; önde kalan yaprak arkadakinden kâğıt kesiği gibi ayrılır.
 */
export function partsSvg(parts: Part[], style: BirthflowerStyle, ink: string, stroke: number, box: Box, id = "bf"): string {
  const w = f(stroke);
  const thin = f(stroke * 0.72);
  const stemW = f(stroke * 1.12);
  const gap = f(Math.max(stroke * 0.7, 3));
  const common = `stroke-linecap="round" stroke-linejoin="round"`;
  let mask = "";
  if (style === "silhouette") {
    for (const p of parts) {
      const d = p.path.d();
      if (p.role === "fill") mask += `<path d="${d}" fill="#fff" stroke="#000" stroke-width="${gap}"/>`;
      else if (p.role === "stem") mask += `<path d="${d}" fill="none" stroke="#fff" stroke-width="${f(stroke * 1.35)}"/>`;
      else if (p.role === "vein") mask += `<path d="${d}" fill="none" stroke="#000" stroke-width="${gap}"/>`;
      else mask += `<path d="${d}" fill="#000"/>`;
    }
  } else {
    for (const p of parts) {
      const d = p.path.d();
      if (p.role === "fill") mask += `<path d="${d}" fill="#000" stroke="#fff" stroke-width="${w}"/>`;
      else if (p.role === "stem") mask += `<path d="${d}" fill="none" stroke="#fff" stroke-width="${stemW}"/>`;
      else if (p.role === "vein") mask += `<path d="${d}" fill="none" stroke="#fff" stroke-width="${thin}"/>`;
      else mask += `<path d="${d}" fill="#fff"/>`;
    }
  }
  const pad = stroke * 4;
  const rect = `x="${f(box.x - pad)}" y="${f(box.y - pad)}" width="${f(box.w + pad * 2)}" height="${f(box.h + pad * 2)}"`;
  let colorLayer = "";
  if (style === "color") {
    // Dolgular kendi aralarında opak, grup olarak hafif şeffaf: arkadaki
    // yaprak öndekinin içinden görünmez, ama renk kumaşa yumuşak oturur.
    colorLayer = `<g opacity="0.9">${parts
      .filter((p) => p.role === "fill" && p.color)
      .map((p) => `<path d="${p.path.d()}" fill="${p.color}"/>`)
      .join("")}</g>`;
  }
  return `${colorLayer}<mask id="${id}" maskUnits="userSpaceOnUse" ${rect}><rect ${rect} fill="#000"/><g ${common}>${mask}</g></mask>`
    + `<rect ${rect} fill="${ink}" mask="url(#${id})"/>`;
}
