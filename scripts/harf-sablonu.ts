#!/usr/bin/env npx vite-node
/**
 * Harf şablonu üst katmanı üretir — "LOVE", "MOM", "ANNE", bir isim, bir yıl.
 *
 *   npx vite-node scripts/harf-sablonu.ts LOVE 300 200 <font.ttf> <cikti-dizini>
 *
 * İki dosya üretir: üst katman PNG'i ve fotoğraf alanlarının JSON'u. PNG'i
 * şablonun "Üst katman" alanına, JSON'daki dikdörtgenleri de fotoğraf
 * alanlarına koyuyorsunuz; ikisi birbirine göre hesaplandığı için harfler
 * fotoğrafların tam üstüne oturuyor.
 *
 * Tasarım mantığı: yan yana N fotoğraf bir şerit oluşturuyor, üstlerine BEYAZ
 * harfler basılıyor. Harfler fotoğrafı kesmiyor, üstünü örtüyor — okunabilirliği
 * veren de bu. Bunun sistemde zaten karşılığı var (fotoğraf alanları + üst
 * katman) ve üst katman hem tarayıcıda hem baskıda fotoğrafların üstüne
 * çizildiği için müşterinin gördüğü ile basılan birebir aynı.
 *
 * Font olarak KALIN bir yazı tipi gerekiyor; ince bir fontta harfin içinden
 * geçen fotoğraf görünmüyor. Kütüphanedeki montserrat.ttf (SemiBold) iş görür
 * ama ExtraBold daha iyi durur.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { harfSablonu } from "../app/lib/letter-template.server";
import { printCanvas } from "../app/lib/print-spec";

const [kelime, enMm, boyMm, fontYolu, cikti] = process.argv.slice(2);
if (!kelime || !enMm || !boyMm || !fontYolu || !cikti) {
  console.error("kullanım: harf-sablonu.ts <KELIME> <en_mm> <boy_mm> <font.ttf> <cikti-dizini>");
  process.exit(1);
}

const canvas = printCanvas({
  width_mm: Number(enMm), height_mm: Number(boyMm), dpi: 300, bleed_mm: 3, safe_mm: 5,
} as never);

const { overlay, slots } = await harfSablonu({
  kelime,
  fontYolu,
  canvasW: canvas.canvasWidth,
  canvasH: canvas.canvasHeight,
  // Sosyopix'teki LOVE tasarımından ölçüldü. Başka bir yerleşim isterseniz
  // burayı değiştirin; slotlar da ona göre kayar.
  band: { x: 0.126, y: 0.186, w: 0.748, h: 0.292 },
  bosluk: 0.012,
  harfYuksekligi: 0.86,
});

await mkdir(cikti, { recursive: true });
const ad = kelime.toLowerCase();
await writeFile(join(cikti, `${ad}-ust-katman.png`), overlay);
await writeFile(join(cikti, `${ad}-alanlar.json`), JSON.stringify(slots, null, 2));

console.log(`tuval : ${canvas.canvasWidth} x ${canvas.canvasHeight} px`);
console.log(`üst katman : ${join(cikti, `${ad}-ust-katman.png`)}`);
console.log(`alanlar    : ${join(cikti, `${ad}-alanlar.json`)}`);
for (const s of slots) {
  const r = s.rect;
  console.log(`  ${s.id} (${s.harf})  x=${r.x.toFixed(4)} y=${r.y.toFixed(4)} w=${r.w.toFixed(4)} h=${r.h.toFixed(4)}`);
}
