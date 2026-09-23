import { useEffect, useRef, useState } from 'react';
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
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Küçük resmin adresi pencere kapanınca bırakılır
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  const t = isTurkish
    ? {
        photo: 'Fotoğraf', pickPhoto: 'Fotoğraf seç', changePhoto: 'Değiştir', photoHint: 'Kare olarak kırpılır; yüzler ortada tutulur.',
        photoOptional: 'isteğe bağlı', title: 'Şarkı adı', artist: 'Sanatçı', link: 'Spotify şarkı bağlantısı',
        linkHint: "Spotify'da şarkı → Paylaş → Şarkı bağlantısını kopyala", linkBad: 'Bu bir Spotify şarkı bağlantısına benzemiyor',
        optional: 'isteğe bağlı', duration: 'Şarkı süresi', durationBad: 'Örn. 3:45', style: 'Stil', theme: 'Renk', font: 'Yazı tipi',
      }
    : {
        photo: 'Photo', pickPhoto: 'Choose photo', changePhoto: 'Change', photoHint: 'Cropped to a square; faces are kept centred.',
        photoOptional: 'optional', title: 'Song title', artist: 'Artist', link: 'Spotify song link',
        linkHint: 'In Spotify: song → Share → Copy Song Link', linkBad: 'This does not look like a Spotify song link',
        optional: 'optional', duration: 'Song length', durationBad: 'e.g. 3:45', style: 'Style', theme: 'Colour', font: 'Font',
      };

  const linkBad = link.trim() !== '' && !LINK_RE.test(link.trim());
  const durationBad = duration.trim() !== '' && !DURATION_RE.test(duration.trim());
  const canMake = title.trim() !== '' && (!assets.requirePhoto || !!photo) && !linkBad;

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const small = await shrinkPhoto(file);
    setPhoto(small);
    setThumb(URL.createObjectURL(small));
  };

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await onRender(
        {
          title: title.trim(),
          artist: artist.trim(),
          link: assets.showCode ? link.trim() : '',
          duration: durationBad ? '' : duration.trim(),
        },
        { style, theme, font },
        photo,
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
      <div className="flex flex-col gap-1.5">
        <FieldLabel label={t.photo} right={assets.requirePhoto ? undefined : t.photoOptional} />
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 text-2xl text-gray-400 hover:border-gray-400">
            {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : '♫'}
          </button>
          <div className="flex min-w-0 flex-col gap-1">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-400">
              {photo ? t.changePhoto : t.pickPhoto}
            </button>
            <span className="text-[11px] text-gray-400">{t.photoHint}</span>
          </div>
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

      {assets.showCode && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.link} right={t.optional} />
          <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)}
            placeholder="https://open.spotify.com/track/…" className={inputClass} />
          <span className={`text-[11px] ${linkBad ? 'text-red-500' : 'text-gray-400'}`}>{linkBad ? t.linkBad : t.linkHint}</span>
        </label>
      )}

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
