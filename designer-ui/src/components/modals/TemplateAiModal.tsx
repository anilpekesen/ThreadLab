import { useRef, useState } from 'react';

export interface AiTextField {
  id: string;
  label: string;
  placeholder: string;
  maxLength: number;
}

export interface AiStyleOption {
  id: string;
  label: string;
  labelEn: string;
}

export interface AiAssets {
  templateName: string;
  layoutMode: 'ai';
  side: 'front' | 'back';
  /** Şablonun müşteriye açtığı stiller; boşsa seçim gösterilmez */
  styles?: AiStyleOption[];
  textFields?: AiTextField[];
  /** Sağlayıcıya göre beklenen süre — bekleme metninde gösterilir */
  expectedSeconds?: number;
}

interface Props {
  assets: AiAssets;
  isTurkish: boolean;
  termsUrl?: string;
  /** Fotoğraf + stil + yazıları sunucuya gönderip üretilen tasarımı alır */
  onRender: (
    file: File,
    styleId: string,
    textValues: Record<string, string>,
  ) => Promise<{ url: string; quality?: { headSourcePx: number; placedPx: number; upscale: number } }>;
  onCancel: () => void;
  onConfirm: (url: string) => void;
}

const CONSENT_KEY = 'printlab_image_rights_accepted';
const DEFAULT_TERMS_URL = 'https://app.printlabapp.com/terms-of-service';
/** Uzun metinler tek satırlık kutuya sığmıyor; hikaye alanı textarea olur */
const LONG_TEXT_MIN = 60;

/**
 * AI şablonu penceresi.
 *
 * Müşteri fotoğrafını ve varsa stilini verir; üretim sunucuda yapılır. Yazılar
 * yapay zekâya gönderilmez — sunucuda gerçek fontla basılır, böylece isim ve
 * hikaye harfi harfine doğru çıkar.
 */
export default function TemplateAiModal({
  assets, isTurkish, termsUrl, onRender, onCancel, onConfirm,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const styles = assets.styles ?? [];
  const [styleId, setStyleId] = useState(styles[0]?.id ?? '');
  const [preview, setPreview] = useState('');
  const [pickWarning, setPickWarning] = useState('');
  const [quality, setQuality] = useState<{ headSourcePx: number; placedPx: number; upscale: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(() => {
    try { const v = localStorage.getItem(CONSENT_KEY); return v == null ? true : v === '1'; }
    catch { return true; }
  });

  const fields = assets.textFields ?? [];
  const seconds = assets.expectedSeconds ?? 20;

  const t = isTurkish
    ? { title: 'Tasarımını oluştur', pick: 'Fotoğraf Seç', change: 'Fotoğrafı değiştir',
        make: 'Tasarımı Oluştur', again: 'Yeniden Oluştur', ok: 'Bunu Kullan', cancel: 'Vazgeç',
        busy: `Yapay zekâ çalışıyor… (yaklaşık ${seconds} saniye)`,
        hint: 'Yüzün net göründüğü bir fotoğraf yükleyin. Yazılarınız yapay zekâya gönderilmez, tasarıma gerçek fontla basılır.',
        styleLabel: 'Tarz',
        consent: 'Bu görselin kullanım ve baskı hakkına sahibim ya da gerekli izinleri aldım.',
        consentNote: 'Telif ihlali bildiriminde sipariş durdurulabilir.', terms: 'Koşullar',
        needConsent: 'Devam etmek için yukarıdaki onayı verin', chosen: 'Seçilen fotoğraf',
        sideFront: 'Ön yüz', sideBack: 'Arka yüz',
        lowPhoto: 'Bu fotoğrafın çözünürlüğü düşük — sonuç bulanık çıkabilir. Mümkünse daha net bir fotoğraf yükleyin.',
        lowResult: 'Üretilen görsel baskı boyutuna göre küçük kaldı; baskıda hafif yumuşama olabilir.' }
    : { title: 'Create your design', pick: 'Choose Photo', change: 'Change photo',
        make: 'Create Design', again: 'Create Again', ok: 'Use This', cancel: 'Cancel',
        busy: `AI is working… (about ${seconds} seconds)`,
        hint: 'Upload a photo where the face is clear. Your text is never sent to the AI — it is printed with a real font.',
        styleLabel: 'Style',
        consent: 'I own or have permission to use and print this image.',
        consentNote: 'Orders may be stopped if a copyright claim is filed.', terms: 'Terms',
        needConsent: 'Accept the notice above to continue', chosen: 'Selected photo',
        sideFront: 'Front', sideBack: 'Back',
        lowPhoto: 'This photo is low resolution — the result may look blurry. Upload a sharper photo if you can.',
        lowResult: 'The generated image is small for the print size; the print may soften slightly.' };

  const render = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await onRender(file, styleId, values);
      setPreview(result.url);
      setQuality(result.quality ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const inspectPick = (picked: File) => {
    const url = URL.createObjectURL(picked);
    const img = new Image();
    img.onload = () => {
      setPickWarning(Math.min(img.naturalWidth, img.naturalHeight) < 600 ? t.lowPhoto : '');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const resultNotice = quality && quality.upscale > 1.15 ? t.lowResult : '';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900">{t.title}</p>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
              {assets.side === 'back' ? t.sideBack : t.sideFront}
            </span>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {preview ? (
            <div className="flex flex-col gap-3">
              <img src={preview} alt={assets.templateName}
                className="mx-auto max-h-[46vh] w-auto rounded-xl border border-gray-100 bg-[repeating-conic-gradient(#f4f4f4_0%_25%,transparent_0%_50%)] bg-[length:14px_14px] object-contain" />
              {resultNotice && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium leading-snug text-amber-800">
                  {resultNotice}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${consent ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                <input type="checkbox" checked={consent}
                  onChange={(e) => { setConsent(e.target.checked); try { localStorage.setItem(CONSENT_KEY, e.target.checked ? '1' : '0'); } catch { /* yoksay */ } }}
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

              <p className="text-xs text-gray-500">{t.hint}</p>

              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(''); setQuality(null); inspectPick(f); } e.target.value = ''; }} />
              <button type="button" disabled={!consent} onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 px-4 py-4 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-400 disabled:opacity-40">
                {!consent ? t.needConsent : file ? `${t.chosen}: ${file.name.slice(0, 28)}` : t.pick}
              </button>

              {pickWarning && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium leading-snug text-amber-800">
                  {pickWarning}
                </p>
              )}

              {styles.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-gray-600">{t.styleLabel}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {styles.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setStyleId(s.id)}
                        aria-pressed={styleId === s.id}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                          styleId === s.id
                            ? 'border-rose-600 bg-rose-600 text-white'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {isTurkish ? s.label : s.labelEn}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {fields.map((f) => (
                <label key={f.id} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between text-xs font-semibold text-gray-600">
                    {f.label}
                    <span className="text-[10px] font-normal text-gray-400">
                      {(values[f.id] ?? '').length}/{f.maxLength}
                    </span>
                  </span>
                  {f.maxLength >= LONG_TEXT_MIN ? (
                    <textarea
                      rows={3}
                      maxLength={f.maxLength}
                      placeholder={f.placeholder}
                      value={values[f.id] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                      className="resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                  ) : (
                    <input
                      type="text"
                      maxLength={f.maxLength}
                      placeholder={f.placeholder}
                      value={values[f.id] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          {error && <p className="mt-3 text-[11px] font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3">
          {preview && (
            <button type="button" onClick={() => setPreview('')}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
              {t.change}
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onCancel}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-500">
            {t.cancel}
          </button>
          {preview ? (
            <>
              <button type="button" onClick={render} disabled={busy}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40">
                {t.again}
              </button>
              <button type="button" onClick={() => onConfirm(preview)}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white">
                {t.ok}
              </button>
            </>
          ) : (
            <button type="button" onClick={render} disabled={!file || !consent || busy}
              className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
              {busy ? t.busy : t.make}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
