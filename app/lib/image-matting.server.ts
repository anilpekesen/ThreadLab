import sharp from "sharp";

/**
 * AI arka plan kaldırma (remove-background) çıktısındaki yarı-saydam kenar
 * halkasını (fringe) temizler. Segmentasyon modelleri kenarda 0-255 arası ara
 * alfa değerleri bırakıyor; bu pikseller orijinal arka planın rengini biraz
 * taşıyor ve beyaz/siyah tişört üzerinde soluk bir halo/bulanıklık gibi
 * görünüyor. Alfa kanalını hafif blur + threshold ile "choke" ederek
 * (kenarı birkaç piksel içeri çekerek) bu kirlenmiş halkayı kesip atıyoruz,
 * sonra çok hafif bir re-feather ile pikselli/testereli kenar oluşmasını
 * engelliyoruz.
 */
export async function cleanupCutoutEdges(
  input: Buffer,
  opts: { chokeBlur?: number; threshold?: number; refeather?: number } = {},
): Promise<Buffer> {
  // threshold=60 kalibre edildi: gerçek örneklerde hem beyaz hem siyah zeminde
  // halo'yu temizliyor, aynı zamanda tasarımdaki soluk/düşük-opaklıklı öğeleri
  // (ör. ince gri çizgiler) yok etmiyor. Daha yüksek değerler (ör. 160) çok
  // agresif — bazı tasarımlarda büyük içerik bloklarını da siliyor.
  const { chokeBlur = 1.4, threshold = 60, refeather = 0.4 } = opts;

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels < 4) return input; // alfa kanalı yoksa dokunma

  const pixelCount = width * height;
  const alpha = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    alpha[i] = data[i * channels + 3];
  }

  // .greyscale() şart — aksi halde sharp blur/threshold sonrası tek kanallı
  // raw buffer'ı sessizce 3 kanala (RGB) genişletiyor ve geri kopyalarken
  // alfa kanalına yanlış hizalanmış baytlar yazılıp görsel bozuluyor.
  const choked = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(chokeBlur)
    .threshold(threshold)
    .blur(refeather)
    .greyscale()
    .raw()
    .toBuffer();

  if (choked.length !== pixelCount) return input; // beklenmeyen boyut — dokunmadan geç

  for (let i = 0; i < pixelCount; i++) {
    data[i * channels + 3] = choked[i];
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
