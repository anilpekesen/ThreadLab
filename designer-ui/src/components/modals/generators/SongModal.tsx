import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';

/** Sunucunun publicAssets çıktısı (app/lib/generators/song) */
interface SongAssets {
  styles: Array<{ id: string; label: string; labelEn: string }>;
  themes: Array<{ id: string; label: string; labelEn: string; swatch: string }>;
  fonts: Array<{ id: string; label: string; url: string }>;
  requirePhoto: boolean;
  showCode: boolean;
  sampleTitle: string;
  sampleArtist: string;
  limits: { title: number; artist: number; duration: number };
}

// Sunucudaki ayrıştırıcının kaba karşılığı: yalnızca yazarken uyarı için;
// asıl kontrol sunucuda
const LINK_RE = /^(spotify:(track|album|playlist):[0-9A-Za-z]{22}|(https?:\/\/)?open\.spotify\.com\/.*(track|album|playlist)\/[0-9A-Za-z]{22})/i;
const DURATION_RE = /^\d{1,2}[:.]\d{2}$/;

/** Fotoğrafın uzun kenarı; baskıdaki kare 1700 px, fazlası yalnızca yüklemeyi yavaşlatır */
const PHOTO_MAX = 2400;

/**
 * Telefon fotoğrafları 10+ MB olabiliyor; tarayıcıda küçültüp JPEG olarak
 * göndermek yüklemeyi hızlandırır. Tarayıcı çözemezse (ör. eski HEIC) dosya
 * olduğu gibi gider, sunucu kendisi küçültür.
 */
async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const k = Math.min(1, PHOTO_MAX / Math.max(bitmap.width, bitmap.height));
    if (k === 1 && file.size < 4 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * k);
    canvas.height = Math.round(bitmap.height * k);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/** Kırpma: odak noktası (0–1) ve yakınlaştırma; sunucu aynı hesabı yapar */
interface Crop { x: number; y: number; zoom: number }

const CROP_BOX = 208;

/**
 * Kare kırpıcı: müşteri fotoğrafı sürükleyip kaydırır, kaydırıcıyla
 * yakınlaştırır. Hesap sunucudaki `photoLayer` ile birebir: kare kenarı =
 * kısa kenar / zoom, merkez odak noktası, taşarsa kenara yaslanır.
 */
function PhotoCropper({ src, crop, onChange, isTurkish }: {
  src: { url: string; w: number; h: number };
  crop: Crop;
  onChange: (c: Crop) => void;
  isTurkish: boolean;
}) {
  const side = Math.min(src.w, src.h) / crop.zoom;
  const scale = CROP_BOX / side;
  const clampC = (v: number, full: number) => Math.min(full - side / 2, Math.max(side / 2, v));
  const cx = clampC(crop.x * src.w, src.w);
  const cy = clampC(crop.y * src.h, src.h);
  const drag = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, cx, cy };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const nx = clampC(d.cx - (e.clientX - d.px) / scale, src.w);
    const ny = clampC(d.cy - (e.clientY - d.py) / scale, src.h);
    onChange({ ...crop, x: nx / src.w, y: ny / src.h });
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-gray-100 shadow-inner active:cursor-grabbing"
        style={{ width: CROP_BOX, height: CROP_BOX }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      >
        <img src={src.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none"
          style={{ width: src.w * scale, height: src.h * scale, left: CROP_BOX / 2 - cx * scale, top: CROP_BOX / 2 - cy * scale }} />
      </div>
      <div className="flex w-full max-w-[208px] items-center gap-2">
        <span className="text-[11px] text-gray-400">−</span>
        <input type="range" min={1} max={3} step={0.01} value={crop.zoom}
          onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })}
          className="flex-1 accent-rose-600" aria-label={isTurkish ? 'Yakınlaştır' : 'Zoom'} />
        <span className="text-[11px] text-gray-400">+</span>
      </div>
      <span className="text-[11px] text-gray-400">{isTurkish ? 'Fotoğrafı sürükleyerek konumlandırın' : 'Drag the photo to position it'}</span>
    </div>
  );
}

/** Görselin gerçek ölçüsü (kırpma hesabı için) */
function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/**
 * Şarkı / Spotify tasarımı penceresi: fotoğraf, şarkı adı, sanatçı, Spotify
 * bağlantısı ve (isteğe bağlı) süre. Kart sunucuda çizilir; dönen PNG
 * onaylanınca ürüne konur. Fotoğraf `initial` ile geri gelmez (dosya
 * saklanmıyor); pencere yeniden açılınca tekrar seçilmesi gerekir.
 */
export default function SongModal({ assets: raw, isTurkish, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as SongAssets & { templateName: string };
  const pick = <T extends { id: string }>(list: T[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prevF = initial?.fields ?? {};
  const prevC = initial?.choices ?? {};

  const [title, setTitle] = useState(() => prevF.title ?? assets.sampleTitle ?? '');
  const [artist, setArtist] = useState(() => prevF.artist ?? assets.sampleArtist ?? '');
  const [link, setLink] = useState(() => prevF.link ?? '');
  const [duration, setDuration] = useState(() => prevF.duration ?? '');
  const [style, setStyle] = useState(() => pick(assets.styles, prevC.style));
  const [theme, setTheme] = useState(() => pick(assets.themes, prevC.theme));
  const [font, setFont] = useState(() => pick(assets.fonts, prevC.font));
  const [photo, setPhoto] = useState<File | null>(null);
  const [thumb, setThumb] = useState('');
  /** Kırpıcıdaki kaynak: seçilen fotoğraf ya da albüm kapağı */
  const [source, setSource] = useState<{ url: string; w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0.5, y: 0.5, zoom: 1 });
  const [cover, setCover] = useState('');
  const [useCover, setUseCover] = useState(false);
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const lastLookup = useRef('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Küçük resmin adresi pencere kapanınca bırakılır
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  const t = isTurkish
    ? {
        photo: 'Fotoğraf', pickPhoto: 'Fotoğraf seç', changePhoto: 'Fotoğrafı değiştir', photoHint: 'Seçtikten sonra kaydırıp yakınlaştırabilirsiniz.',
        useCover: 'Albüm kapağını kullan', lookupLoading: 'Şarkı bilgileri alınıyor…', lookupOk: "Şarkı bilgileri Spotify'dan dolduruldu; dilerseniz düzenleyin.", lookupFail: 'Şarkı bilgileri alınamadı; alanları elle doldurun.',
        photoOptional: 'isteğe bağlı', title: 'Şarkı adı', artist: 'Sanatçı', link: 'Spotify şarkı bağlantısı',
        linkHint: "Spotify'da şarkı → Paylaş → Şarkı bağlantısını kopyala", linkBad: 'Bu bir Spotify şarkı bağlantısına benzemiyor',
        optional: 'isteğe bağlı', duration: 'Şarkı süresi', durationBad: 'Örn. 3:45', style: 'Stil', theme: 'Renk', font: 'Yazı tipi',
      }
    : {
        photo: 'Photo', pickPhoto: 'Choose photo', changePhoto: 'Change photo', photoHint: 'After choosing, you can drag and zoom it.',
        useCover: 'Use album cover', lookupLoading: 'Fetching song details…', lookupOk: 'Song details filled from Spotify; edit if you like.', lookupFail: 'Could not fetch song details; fill them in yourself.',
        photoOptional: 'optional', title: 'Song title', artist: 'Artist', link: 'Spotify song link',
        linkHint: 'In Spotify: song → Share → Copy Song Link', linkBad: 'This does not look like a Spotify song link',
        optional: 'optional', duration: 'Song length', durationBad: 'e.g. 3:45', style: 'Style', theme: 'Colour', font: 'Font',
      };

  const linkBad = link.trim() !== '' && !LINK_RE.test(link.trim());

  // Bağlantı yapıştırılınca şarkı adı, sanatçı, süre ve kapak Spotify'dan gelir
  useEffect(() => {
    const value = link.trim();
    if (!value || !LINK_RE.test(value) || value === lastLookup.current) return;
    const timer = window.setTimeout(async () => {
      lastLookup.current = value;
      setLookup('loading');
      try {
        const res = await fetch(`/apps/tshirt-designer/spotify-info?link=${encodeURIComponent(value)}`);
        if (!res.ok) throw new Error(String(res.status));
        const info = await res.json() as { title?: string; artist?: string; durationSec?: number; coverUrl?: string };
        if (info.title) setTitle(Array.from(info.title).slice(0, assets.limits.title).join(''));
        if (info.artist) setArtist(Array.from(info.artist).slice(0, assets.limits.artist).join(''));
        if (info.durationSec) setDuration(fmtDuration(info.durationSec));
        setCover(info.coverUrl ?? '');
        setLookup('ok');
      } catch {
        setLookup('fail');
      }
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);
  const durationBad = duration.trim() !== '' && !DURATION_RE.test(duration.trim());
  const canMake = title.trim() !== '' && (!assets.requirePhoto || !!photo || useCover) && !linkBad;

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const small = await shrinkPhoto(file);
    const url = URL.createObjectURL(small);
    setPhoto(small);
    setThumb(url);
    setUseCover(false);
    setCrop({ x: 0.5, y: 0.5, zoom: 1 });
    try {
      setSource({ url, ...(await imageSize(url)) });
    } catch {
      setSource(null);
    }
  };

  const chooseCover = async () => {
    if (!cover) return;
    setPhoto(null);
    setUseCover(true);
    setCrop({ x: 0.5, y: 0.5, zoom: 1 });
    try {
      setSource({ url: cover, ...(await imageSize(cover)) });
    } catch {
      setSource({ url: cover, w: 640, h: 640 });
    }
  };

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await onRender(
        {
          title: title.trim(),
          artist: artist.trim(),
          link: link.trim(),
          duration: durationBad ? '' : duration.trim(),
        },
        {
          style, theme, font,
          ...(source ? { photoX: crop.x, photoY: crop.y, photoZoom: crop.zoom } : {}),
          ...(useCover ? { useCover: true } : {}),
        },
        useCover ? null : photo,
      );
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const count = (v: string, max: number) => `${Array.from(v).length}/${max}`;

  return (
    <GeneratorModalShell
      title={assets.templateName}
      isTurkish={isTurkish}
      preview={preview}
      previewAlt={title}
      busy={busy}
      error={error}
      canMake={canMake}
      onMake={make}
      onEdit={() => setPreview('')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(preview)}
    >
      <label className="flex flex-col gap-1">
        <FieldLabel label={t.link} right={assets.showCode ? undefined : t.optional} />
        <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)}
          placeholder="https://open.spotify.com/track/…" className={inputClass} />
        <span className={`text-[11px] ${linkBad || lookup === 'fail' ? 'text-red-500' : lookup === 'ok' ? 'text-emerald-600' : 'text-gray-400'}`}>
          {linkBad ? t.linkBad
            : lookup === 'loading' ? t.lookupLoading
            : lookup === 'ok' ? t.lookupOk
            : lookup === 'fail' ? t.lookupFail
            : t.linkHint}
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <FieldLabel label={t.photo} right={assets.requirePhoto ? undefined : t.photoOptional} />
        {source && <PhotoCropper src={source} crop={crop} onChange={setCrop} isTurkish={isTurkish} />}
        <div className="flex flex-wrap items-center gap-2">
          {!source && (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 text-2xl text-gray-400 hover:border-gray-400">
              {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : '♫'}
            </button>
          )}
          <button type="button" onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-400">
            {photo ? t.changePhoto : t.pickPhoto}
          </button>
          {cover && !useCover && (
            <button type="button" onClick={() => void chooseCover()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:border-gray-400">
              <img src={cover} alt="" className="h-6 w-6 rounded" />
              {t.useCover}
            </button>
          )}
          {!source && <span className="text-[11px] text-gray-400">{t.photoHint}</span>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <FieldLabel label={t.title} right={count(title, assets.limits.title)} />
        <input type="text" value={title} maxLength={assets.limits.title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel label={t.artist} right={count(artist, assets.limits.artist)} />
        <input type="text" value={artist} maxLength={assets.limits.artist} onChange={(e) => setArtist(e.target.value)} className={inputClass} />
      </label>


      <label className="flex flex-col gap-1">
        <FieldLabel label={t.duration} right={t.optional} />
        <input type="text" inputMode="numeric" value={duration} maxLength={assets.limits.duration}
          onChange={(e) => setDuration(e.target.value)} placeholder="3:45" className={`${inputClass} max-w-[7rem]`} />
        {durationBad && <span className="text-[11px] text-red-500">{t.durationBad}</span>}
      </label>

      {assets.styles.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.style} />
          <div className="flex flex-wrap gap-1.5">
            {assets.styles.map((s) => (
              <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={pillClass(style === s.id)} aria-pressed={style === s.id}>
                {isTurkish ? s.label : s.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {assets.themes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.theme} />
          <div className="flex flex-wrap gap-1.5">
            {assets.themes.map((th) => (
              <button key={th.id} type="button" onClick={() => setTheme(th.id)} className={pillClass(theme === th.id)} aria-pressed={theme === th.id}>
                <span className="h-3 w-3 rounded-sm border border-gray-300" style={{ background: th.swatch }} />
                {isTurkish ? th.label : th.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {assets.fonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.font} />
          <div className="flex flex-wrap gap-1.5">
            {assets.fonts.map((f) => (
              <button key={f.id} type="button" onClick={() => setFont(f.id)} className={pillClass(font === f.id)} aria-pressed={font === f.id}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </GeneratorModalShell>
  );
}
