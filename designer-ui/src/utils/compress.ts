export function compressImage(file: File, maxSide = 4000): Promise<string> {
  const isPng = file.type === 'image/png';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width > height) { height = Math.round(height * maxSide / width); width = maxSide; }
          else { width = Math.round(width * maxSide / height); height = maxSide; }
        }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        const ctx = c.getContext('2d')!;
        // PNG ise şeffaflığı koru — JPEG için beyaz arka plan ekle
        if (!isPng) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(isPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Şablon üretimine gönderilecek fotoğrafı küçültür.
 *
 * Telefon fotoğrafları 20 MB'ı geçebiliyor ve sunucunun şablon ucu 15 MB'da
 * kesiyordu. Boru hattı zaten o çözünürlüğü kullanmıyor: AI sağlayıcıları
 * girdiyi 1024 (WaveSpeed) / 512 (Cloudflare) piksele indiriyor, dağıtımlı
 * şablon ise fotoğraftan yalnızca kafa kesitini alıyor. 3000 piksel sınırı
 * kafa kesitinin baskı çözünürlüğünü korurken dosyayı birkaç MB'a düşürüyor.
 *
 * Müşterinin yüklediği ORİJİNAL dosya ayrıca olduğu gibi saklanıyor
 * (uploadTemplateOriginal, 120 MB'a kadar) — baskı ekibi tam çözünürlüğü
 * kaybetmiyor.
 *
 * Herhangi bir adım başarısız olursa (ör. tarayıcı HEIC çözemezse) dosya
 * olduğu gibi döner; küçültme akışı durdurmaz.
 */
export async function shrinkImageFile(
  file: File,
  maxSide = 3000,
  skipBelowBytes = 6 * 1024 * 1024,
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(() => createImageBitmap(file));

    const { width, height } = bitmap;
    if (file.size <= skipBelowBytes && width <= maxSide && height <= maxSide) {
      bitmap.close?.();
      return file;
    }

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return file; }
    // Kamera fotoğrafında saydamlık yok; arka planı sunucu zaten kaldırıyor,
    // bu yüzden JPEG hem güvenli hem çok daha küçük.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92);
    });
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/**
 * Küçük önizleme kopyası.
 *
 * Yüklenenler galerisi `dataUrl`'i localStorage'a yazıyor ve orada tam boy bir
 * PNG tek başına kotayı doldurup tüm galerinin kaydını düşürüyor (yazma
 * try/catch içinde, sessizce başarısız oluyor). Galeride gösterilen kare zaten
 * küçük olduğu için tam boy veriyi orada tutmanın karşılığı yok.
 */
export function makeThumbnail(src: string, maxSide = 256, mime = 'image/png'): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(src); return; }
      ctx.drawImage(img, 0, 0, w, h);
      try { resolve(canvas.toDataURL(mime, 0.85)); } catch { resolve(src); }
    };
    // Küçültme başarısızsa orijinali döndür; akışı durdurmaya değmez.
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
