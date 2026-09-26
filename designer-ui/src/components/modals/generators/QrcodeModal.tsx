import { useState } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';
import { garmentWarning, inkVisible, luminance, pickForGarment } from './garment';
import { tx } from '../../../i18n';

interface Option { id: string; label: string; labelEn?: string }

interface QrcodeAssets {
  contentTypes: Array<Option & { hint: string; hintEn: string }>;
  styles: Option[];
  layouts: Option[];
  /** Boşsa şablon ortadaki kalbi kapatmış */
  icons: Option[];
  security: Option[];
  fonts: Option[];
  inks: Array<Option & { hex: string }>;
  captionEnabled: boolean;
  /** İçerik türüne göre başlangıç yazısı */
  captions: Record<string, string>;
  limits: { url: number; text: number; ssid: number; password: number; phone: number; email: number; caption: number };
}

/** Bu uzunluğun üstündeki bağlantıda kod sıklaşır; kısa bağlantı önerilir */
const LONG_URL = 90;

/**
 * QR kod penceresi: içerik türü (bağlantı, mesaj, Wi-Fi, telefon, e-posta),
 * türüne göre alanlar, isteğe bağlı yazı ve stil/düzen/kalp/yazı tipi/renk.
 * Kod sunucuda çizilir ve orada doğrulanır; burada yalnızca boş alan
 * kontrolü ve okunabilirlik uyarıları var.
 */
export default function QrcodeModal({ assets: raw, isTurkish, garment, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as QrcodeAssets & { templateName: string };
  // Önceki seçim şablonda artık kapalıysa ilk izinli değere dönülür
  const pick = (list: Option[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prev = initial?.choices;
  const f0 = initial?.fields ?? {};

  const [content, setContent] = useState(() => pick(assets.contentTypes, prev?.content));
  const [url, setUrl] = useState(() => f0.url ?? '');
  const [text, setText] = useState(() => f0.text ?? '');
  const [ssid, setSsid] = useState(() => f0.ssid ?? '');
  const [password, setPassword] = useState(() => f0.password ?? '');
  const [security, setSecurity] = useState(() => pick(assets.security, prev?.security));
  const [phone, setPhone] = useState(() => f0.phone ?? '');
  const [email, setEmail] = useState(() => f0.email ?? '');
  // Yazı: müşteri dokunana kadar içerik türünün önerisini izler
  const [caption, setCaption] = useState(() => f0.caption ?? assets.captions[content] ?? '');
  const [captionTouched, setCaptionTouched] = useState(() => typeof f0.caption === 'string');
  const [style, setStyle] = useState(() => pick(assets.styles, prev?.style));
  const [layout, setLayout] = useState(() => pick(assets.layouts, prev?.layout));
  const [icon, setIcon] = useState(() => pick(assets.icons, prev?.icon));
  const [font, setFont] = useState(() => pick(assets.fonts, prev?.font));
  const [ink, setInk] = useState(() => pickForGarment(assets.inks, prev?.ink, (o) => o.hex, garment));
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = tx({
        content: 'Kodun içeriği', url: 'Bağlantı', urlPh: 'ornek.com/dugun-videomuz', text: 'Mesaj', textPh: 'Okutunca görünecek mesaj',
        ssid: 'Ağ adı (SSID)', password: 'Şifre', security: 'Güvenlik', phone: 'Telefon numarası', phonePh: '+90 555 123 45 67',
        email: 'E-posta adresi', caption: 'Yazı', captionPh: 'Beni okut', heart: 'Kalp ekle',
        style: 'Stil', layout: 'Düzen', icon: 'Ortada', font: 'Yazı tipi', ink: 'Renk',
        longUrl: 'Uzun bağlantı kodu sıklaştırır; küçük baskıda zor okunabilir. Mümkünse kısaltılmış bir bağlantı kullanın.',
        heartLong: 'Çok uzun içerikte kalp, kod okunur kalsın diye çıkarılır.',
        inverted: 'Açık renk kod koyu zeminde bazı telefonlarda okunmayabilir. En güvenlisi koyu renk kodu açık renk üründe kullanmak.',
        lowContrast: 'Bu renk tişörtle yeterince zıt değil; kod zor okunabilir. Daha koyu (ya da daha açık) bir renk seçin.',
        check: 'Baskıdan önce önizlemeyi telefonunuzla okutup deneyin.',
        need: 'Kodun içeriğini yazın', wpaShort: 'WPA şifresi en az 8 karakter olmalı',
      }, {
        content: 'Code content', url: 'Link', urlPh: 'example.com/our-wedding-video', text: 'Message', textPh: 'The message shown when scanned',
        ssid: 'Network name (SSID)', password: 'Password', security: 'Security', phone: 'Phone number', phonePh: '+1 555 123 4567',
        email: 'Email address', caption: 'Caption', captionPh: 'Scan me', heart: 'Add heart',
        style: 'Style', layout: 'Layout', icon: 'Center', font: 'Font', ink: 'Color',
        longUrl: 'A long link makes the code denser and harder to scan when printed small. Use a shortened link if you can.',
        heartLong: 'For very long content the heart is left out so the code stays scannable.',
        inverted: 'A light code on a dark background may not scan on some phones. Dark code on a light product is the safest choice.',
        lowContrast: "This color doesn't contrast enough with the shirt; the code may be hard to scan. Pick a darker (or lighter) color.",
        check: 'Scan the preview with your phone before ordering.',
        need: 'Enter the code content', wpaShort: 'A WPA password must be at least 8 characters',
      });
  const label = (o: Option) => (tx(o.label, o.labelEn ?? o.label));

  const hasCaption = layout !== 'plain';
  const ready = content === 'url' ? !!url.trim()
    : content === 'text' ? !!text.trim()
    : content === 'wifi' ? !!ssid.trim() && (security === 'nopass' || !!password)
    : content === 'phone' ? !!phone.trim()
    : content === 'email' ? !!email.trim()
    : false;

  const changeContent = (id: string) => {
    setContent(id);
    if (!captionTouched) setCaption(assets.captions[id] ?? '');
  };

  // Okunabilirlik: kod tişörtten koyu olmalı (ters kod her telefonda okunmaz)
  // ve kontrast QR için metinden daha yüksek olmalı
  const inkHex = assets.inks.find((o) => o.id === ink)?.hex;
  const inkWarning = (() => {
    if (!inkHex || !garment) return '';
    if (!inkVisible(inkHex, garment)) return garmentWarning(isTurkish, garment);
    const a = luminance(inkHex), b = luminance(garment.hex);
    if (a > b) return t.inverted;
    if ((b + 0.05) / (a + 0.05) < 3) return t.lowContrast;
    return '';
  })();

  const render = async () => {
    if (!ready) { setError(t.need); return; }
    if (content === 'wifi' && security === 'WPA' && Array.from(password).length < 8) { setError(t.wpaShort); return; }
    setBusy(true);
    setError('');
    try {
      const fields: Record<string, string> = {};
      if (content === 'url') fields.url = url.trim();
      if (content === 'text') fields.text = text;
      if (content === 'wifi') { fields.ssid = ssid; fields.password = security === 'nopass' ? '' : password; }
      if (content === 'phone') fields.phone = phone.trim();
      if (content === 'email') fields.email = email.trim();
      if (hasCaption && assets.captionEnabled) fields.caption = caption.trim();
      const choices: Record<string, string> = { content, style, layout, ink };
      if (content === 'wifi') choices.security = security;
      if (assets.icons.length) choices.icon = icon;
      if (hasCaption) choices.font = font;
      const result = await onRender(fields, choices);
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pills = (list: Option[], value: string, set: (id: string) => void, swatch?: (o: Option) => string) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((o) => (
        <button key={o.id} type="button" onClick={() => set(o.id)} className={pillClass(value === o.id)} aria-pressed={value === o.id}>
          {swatch && <span className="h-3 w-3 rounded-sm border border-gray-300" style={{ background: swatch(o) }} />}
          {label(o)}
        </button>
      ))}
    </div>
  );

  const counter = (v: string, max: number) => `${Array.from(v).length}/${max}`;
  const contentHint = assets.contentTypes.find((c) => c.id === content);
  const longUrl = content === 'url' && url.trim().length > LONG_URL;

  return (
    <GeneratorModalShell
      title={assets.templateName}
      isTurkish={isTurkish}
      preview={preview}
      previewAlt={assets.templateName}
      busy={busy}
      error={error}
      canMake={ready}
      onMake={render}
      onEdit={() => setPreview('')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(preview)}
      backdrop={garment?.hex}
    >
      {assets.contentTypes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.content} />
          {pills(assets.contentTypes, content, changeContent)}
          {contentHint && <span className="text-[11px] text-gray-400">{tx(contentHint.hint, contentHint.hintEn)}</span>}
        </div>
      )}

      {content === 'url' && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.url} right={counter(url, assets.limits.url)} />
          <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            value={url} maxLength={assets.limits.url} placeholder={t.urlPh}
            onChange={(e) => setUrl(e.target.value)} className={inputClass} />
          {longUrl && (
            <span className="text-[11px] text-amber-600">
              {t.longUrl}{icon === 'heart' && assets.icons.length ? ` ${t.heartLong}` : ''}
            </span>
          )}
        </label>
      )}

      {content === 'text' && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.text} right={counter(text, assets.limits.text)} />
          <textarea value={text} maxLength={assets.limits.text} placeholder={t.textPh} rows={3}
            onChange={(e) => setText(e.target.value)} className={`${inputClass} resize-none`} />
        </label>
      )}

      {content === 'wifi' && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <FieldLabel label={t.ssid} />
            <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
              value={ssid} maxLength={assets.limits.ssid} onChange={(e) => setSsid(e.target.value)} className={inputClass} />
          </label>
          {assets.security.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel label={t.security} />
              {pills(assets.security, security, setSecurity)}
            </div>
          )}
          {security !== 'nopass' && (
            <label className="flex flex-col gap-1">
              <FieldLabel label={t.password} />
              <input type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={password} maxLength={assets.limits.password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </label>
          )}
        </div>
      )}

      {content === 'phone' && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.phone} />
          <input type="tel" inputMode="tel" value={phone} maxLength={assets.limits.phone} placeholder={t.phonePh}
            onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </label>
      )}

      {content === 'email' && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.email} />
          <input type="email" inputMode="email" autoCapitalize="off" value={email} maxLength={assets.limits.email}
            onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
      )}

      {assets.layouts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.layout} />
          {pills(assets.layouts, layout, setLayout)}
        </div>
      )}

      {hasCaption && assets.captionEnabled && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.caption} right={counter(caption, assets.limits.caption)} />
          <div className="flex items-center gap-1.5">
            <input type="text" value={caption} maxLength={assets.limits.caption} placeholder={t.captionPh}
              onChange={(e) => { setCaption(e.target.value); setCaptionTouched(true); }}
              className={`${inputClass} min-w-0 flex-1`} />
            {/* ♥ sunucuda vektör kalp olarak çizilir */}
            <button type="button" title={t.heart} aria-label={t.heart}
              disabled={Array.from(caption).length >= assets.limits.caption}
              onClick={() => { setCaption((c) => (c.trimEnd() ? `${c.trimEnd()} ♥` : '♥')); setCaptionTouched(true); }}
              className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm text-rose-600 hover:border-gray-400 disabled:opacity-40">♥</button>
          </div>
        </label>
      )}

      {assets.styles.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.style} />
          {pills(assets.styles, style, setStyle)}
        </div>
      )}

      {assets.icons.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.icon} />
          {pills(assets.icons, icon, setIcon)}
        </div>
      )}

      {hasCaption && assets.fonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.font} />
          {pills(assets.fonts, font, setFont)}
        </div>
      )}

      {assets.inks.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.ink} />
          {pills(assets.inks, ink, setInk, (o) => (o as Option & { hex: string }).hex)}
        </div>
      )}
      {inkWarning && <span className="text-[11px] font-medium text-amber-600">{inkWarning}</span>}

      <span className="text-[11px] text-gray-400">{t.check}</span>
    </GeneratorModalShell>
  );
}
