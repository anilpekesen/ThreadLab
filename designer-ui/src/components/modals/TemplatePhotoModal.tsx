import { useCallback, useEffect, useRef, useState } from 'react';

export interface TemplateAssets {
  templateName: string;
  templateUrl: string;
  width: number;
  height: number;
  hole: { x: number; y: number; width: number; height: number };
  maskDataUrl: string;
}

interface Props {
  assets: TemplateAssets;
  /** Seçilmemişse pencere önce fotoğraf seçme adımını gösterir */
  file: File | null;
  isTurkish: boolean;
  termsUrl?: string;
  onCancel: () => void;
  onPickFile: (file: File) => void;
  /** Onaylanan kompozisyon, şablon çözünürlüğünde PNG data URL olarak döner */
  onConfirm: (dataUrl: string) => void;
}

const CONSENT_KEY = 'printlab_image_rights_accepted';
const DEFAULT_TERMS_URL = 'https://app.printlabapp.com/terms-of-service';

interface View { x: number; y: number; scale: number; angle: number }

/**
 * Uzak görselleri kendi alan adımızdaki proxy üzerinden yükler.
 *
 * Doğrudan yüklemek iki nedenle kırılgan: (1) tarayıcı aynı URL'yi daha önce
 * CORS'suz önbelleğe aldıysa (ör. panel önizlemesi) crossOrigin isteği
 * reddediliyor, (2) CDN önbelleği Origin'e göre ayrışmazsa CORS başlığı
 * gelmeyebiliyor. Proxy aynı kaynaktan servis ettiği için tuval kirlenmiyor
 * ve toDataURL her zaman çalışıyor.
 */
function proxied(url: string): string {
  if (!url.startsWith('http')) return url;          // data: / blob: dokunma
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Görsel yüklenemedi: ${src.slice(0, 120)}`));
    img.src = src;
  });
}

/**
 * Müşteri fotoğrafını şablonun boşluğu içinde konumlandırır.
 *
 * Kompozisyonun tamamı burada, şablonun kendi çözünürlüğünde yapılır ve
 * onaylanan tuval doğrudan dışa aktarılır. Böylece müşterinin gördüğü görsel
 * ile basılan görsel aynı olur; sunucuda ikinci bir hesap yapılmadığı için
 * uyuşmazlık riski yoktur.
 */
export default function TemplatePhotoModal({
  assets, file, isTurkish, termsUrl, onCancel, onPickFile, onConfirm,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<{ template: HTMLImageElement; mask: HTMLImageElement; photo: HTMLImageElement } | null>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1, angle: 0 });
  const dragRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  const pickRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(() => {
    try { const v = localStorage.getItem(CONSENT_KEY); return v == null ? true : v === '1'; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(CONSENT_KEY, consent ? '1' : '0'); } catch { /* yoksay */ }
  }, [consent]);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(100);
  const [angle, setAngle] = useState(0);

  const t = isTurkish
    ? { title: 'Fotoğrafını yerleştir', zoom: 'Yakınlaştır', rotate: 'Döndür', center: 'Ortala',
        change: 'Fotoğrafı değiştir', cancel: 'Vazgeç', ok: 'Tamam',
        hint: 'Fotoğrafı sürükleyerek kaydır, iki parmakla yakınlaştır.', loading: 'Hazırlanıyor…',
        pickTitle: 'Fotoğrafını seç', pick: 'Fotoğraf Seç',
        pickHint: 'Yüklediğin fotoğraf tasarımın boşluğuna otomatik yerleşir.',
        consent: 'Bu görselin kullanım ve baskı hakkına sahibim ya da gerekli izinleri aldım.',
        consentNote: 'Telif ihlali bildiriminde sipariş durdurulabilir.', terms: 'Koşullar',
        needConsent: 'Devam etmek için yukarıdaki onayı verin' }
    : { title: 'Position your photo', zoom: 'Zoom', rotate: 'Rotate', center: 'Center',
        change: 'Change photo', cancel: 'Cancel', ok: 'Done',
        hint: 'Drag to move, pinch to zoom.', loading: 'Preparing…',
        pickTitle: 'Choose your photo', pick: 'Choose Photo',
        pickHint: 'Your photo drops into the design automatically.',
        consent: 'I own or have permission to use and print this image.',
        consentNote: 'Orders may be stopped if a copyright claim is filed.', terms: 'Terms',
        needConsent: 'Accept the notice above to continue' };

  /** Fotoğrafı deliğe "cover" ile ortalayan başlangıç ölçeği */
  const baseScale = useCallback((photo: HTMLImageElement) => {
    const { hole } = assets;
    return Math.max(hole.width / photo.naturalWidth, hole.height / photo.naturalHeight);
  }, [assets]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const layers = layersRef.current;
    if (!cv || !layers) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const { width: W, height: H, hole } = assets;
    const v = viewRef.current;
    ctx.clearRect(0, 0, W, H);

    // 1) fotoğraf — deliğin merkezine göre konumlanır
    const bs = baseScale(layers.photo);
    const s = bs * v.scale;
    const cx = hole.x + hole.width / 2 + v.x;
    const cy = hole.y + hole.height / 2 + v.y;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((v.angle * Math.PI) / 180);
    ctx.drawImage(
      layers.photo,
      -layers.photo.naturalWidth * s / 2,
      -layers.photo.naturalHeight * s / 2,
      layers.photo.naturalWidth * s,
      layers.photo.naturalHeight * s,
    );
    ctx.restore();

    // 2) fotoğrafı deliğin şekline kırp
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(layers.mask, 0, 0, W, H);

    // 3) şablonu üste koy; deliğe denk gelen kısmı sil ki opak şablonlarda
    //    fotoğraf kapanmasın
    ctx.globalCompositeOperation = 'source-over';
    const tpl = document.createElement('canvas');
    tpl.width = W; tpl.height = H;
    const tctx = tpl.getContext('2d');
    if (tctx) {
      tctx.drawImage(layers.template, 0, 0, W, H);
      tctx.globalCompositeOperation = 'destination-out';
      tctx.drawImage(layers.mask, 0, 0, W, H);
      ctx.drawImage(tpl, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [assets, baseScale]);

  useEffect(() => {
    if (!file) { setReady(false); return; }
    let revoked = '';
    let cancelled = false;
    (async () => {
      try {
        const photoUrl = URL.createObjectURL(file);
        revoked = photoUrl;
        const [template, mask, photo] = await Promise.all([
          loadImage(proxied(assets.templateUrl)),
          loadImage(assets.maskDataUrl),
          loadImage(photoUrl),
        ]);
        if (cancelled) return;
        layersRef.current = { template, mask, photo };
        viewRef.current = { x: 0, y: 0, scale: 1, angle: 0 };
        setReady(true);
        requestAnimationFrame(draw);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [assets, file, draw]);

  const toCanvas = (e: React.PointerEvent) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (assets.width / r.width), y: (e.clientY - r.top) * (assets.height / r.height) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toCanvas(e);
    dragRef.current = { id: e.pointerId, lastX: p.x, lastY: p.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toCanvas(e);
    viewRef.current.x += p.x - d.lastX;
    viewRef.current.y += p.y - d.lastY;
    d.lastX = p.x; d.lastY = p.y;
    draw();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  // İki parmakla yakınlaştırma
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinchRef.current) {
      pinchRef.current = { dist, scale: viewRef.current.scale };
      return;
    }
    const next = Math.min(4, Math.max(0.4, pinchRef.current.scale * (dist / pinchRef.current.dist)));
    viewRef.current.scale = next;
    setZoom(Math.round(next * 100));
    draw();
  };
  const onTouchEnd = () => { pinchRef.current = null; };

  const applyZoom = (percent: number) => {
    viewRef.current.scale = percent / 100;
    setZoom(percent);
    draw();
  };
  const applyAngle = (deg: number) => {
    viewRef.current.angle = deg;
    setAngle(deg);
    draw();
  };
  const recenter = () => {
    viewRef.current = { x: 0, y: 0, scale: 1, angle: 0 };
    setZoom(100); setAngle(0);
    draw();
  };

  const confirm = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    onConfirm(cv.toDataURL('image/png'));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-bold text-gray-900">{file ? t.title : t.pickTitle}</p>
          <button type="button" onClick={onCancel} className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!file ? (
            <div className="flex flex-col gap-3">
              <img
                src={proxied(assets.templateUrl)}
                alt={assets.templateName}
                className="mx-auto max-h-[34vh] w-auto rounded-xl border border-gray-100 bg-[repeating-conic-gradient(#f4f4f4_0%_25%,transparent_0%_50%)] bg-[length:14px_14px] object-contain p-2"
              />
              <p className="text-center text-xs text-gray-500">{t.pickHint}</p>

              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${consent ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
                <div>
                  <p className="text-xs font-semibold leading-snug text-gray-700">{t.consent}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {t.consentNote}{' '}
                    <a href={termsUrl || DEFAULT_TERMS_URL} target="_blank" rel="noopener noreferrer"
                      className="text-blue-500 hover:underline">{t.terms}</a>
                  </p>
                </div>
              </label>

              <input ref={pickRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ''; }} />
              <button type="button" disabled={!consent} onClick={() => pickRef.current?.click()}
                className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-40">
                {consent ? t.pick : t.needConsent}
              </button>
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm font-medium text-red-600">{error}</p>
          ) : (
            <>
              <div className="relative flex items-center justify-center rounded-xl bg-[repeating-conic-gradient(#f1f1f1_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2">
                <canvas
                  ref={canvasRef}
                  width={assets.width}
                  height={assets.height}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  className="max-h-[42vh] w-auto max-w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
                />
                {!ready && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 text-sm text-gray-500">
                    {t.loading}
                  </div>
                )}
              </div>

              <p className="mt-2 text-center text-[11px] text-gray-400">{t.hint}</p>

              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-center gap-3 text-xs font-semibold text-gray-500">
                  <span className="w-20 shrink-0">{t.zoom}</span>
                  <input type="range" min={40} max={400} value={zoom} disabled={!ready}
                    onChange={(e) => applyZoom(Number(e.target.value))}
                    className="h-1 flex-1 accent-gray-900" />
                  <span className="w-11 shrink-0 text-right tabular-nums text-gray-700">%{zoom}</span>
                </label>
                <label className="flex items-center gap-3 text-xs font-semibold text-gray-500">
                  <span className="w-20 shrink-0">{t.rotate}</span>
                  <input type="range" min={-180} max={180} value={angle} disabled={!ready}
                    onChange={(e) => applyAngle(Number(e.target.value))}
                    className="h-1 flex-1 accent-gray-900" />
                  <span className="w-11 shrink-0 text-right tabular-nums text-gray-700">{angle}°</span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className={`flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3 ${file ? '' : 'hidden'}`}>
          <button type="button" onClick={recenter} disabled={!ready}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40">
            {t.center}
          </button>
          <button type="button" onClick={() => pickRef.current?.click()}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
            {t.change}
          </button>
          <input ref={pickRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ''; }} />
          <div className="flex-1" />
          <button type="button" onClick={onCancel}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-500">
            {t.cancel}
          </button>
          <button type="button" onClick={confirm} disabled={!ready}
            className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
            {t.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
