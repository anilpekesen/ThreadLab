import { useRef, useState } from 'react';

export interface ScatterTextField {
  id: string;
  label: string;
  placeholder: string;
  maxLength: number;
}

export interface ScatterAssets {
  templateName: string;
  layoutMode: 'scatter';
  decorationUrl?: string | null;
  textFields?: ScatterTextField[];
}

interface Props {
  assets: ScatterAssets;
  isTurkish: boolean;
  termsUrl?: string;
  /** Fotoğraf + yazıları sunucuya gönderip hazır tasarımın adresini alır */
  onRender: (file: File, textValues: Record<string, string>) => Promise<string>;
  onCancel: () => void;
  onConfirm: (url: string) => void;
}

const CONSENT_KEY = 'printlab_image_rights_accepted';
const DEFAULT_TERMS_URL = 'https://app.printlabapp.com/terms-of-service';

/**
 * Dağıtımlı şablon penceresi.
 *
 * Müşteri fotoğrafını ve yazısını verir; kompozisyon sunucuda yapılır
 * (arka plan kaldırma, kafa kesme ve dağıtım ağır işler). Dönen görsel
 * onaylanınca ürünün üstüne konur.
 */
export default function TemplateScatterModal({
  assets, isTurkish, termsUrl, onRender, onCancel, onConfirm,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(() => {
    try { const v = localStorage.getItem(CONSENT_KEY); return v == null ? true : v === '1'; }
    catch { return true; }
  });

  const fields = assets.textFields ?? [];
  const t = isTurkish
    ? { title: 'Tasarımını oluştur', pick: 'Fotoğraf Seç', change: 'Fotoğrafı değiştir',
        make: 'Tasarımı Oluştur', again: 'Yeniden Oluştur', ok: 'Bunu Kullan', cancel: 'Vazgeç',
        busy: 'Hazırlanıyor… (yaklaşık 5 saniye)',
        hint: 'Tek kişilik net bir fotoğraf yükleyin; sistem yüzü kesip tasarıma dağıtır.',
        consent: 'Bu görselin kullanım ve baskı hakkına sahibim ya da gerekli izinleri aldım.',
        consentNote: 'Telif ihlali bildiriminde sipariş durdurulabilir.', terms: 'Koşullar',
        needConsent: 'Devam etmek için yukarıdaki onayı verin', chosen: 'Seçilen fotoğraf' }
    : { title: 'Create your design', pick: 'Choose Photo', change: 'Change photo',
        make: 'Create Design', again: 'Create Again', ok: 'Use This', cancel: 'Cancel',
        busy: 'Preparing… (about 5 seconds)',
        hint: 'Upload a clear photo of one person; we cut out the face and scatter it.',
        consent: 'I own or have permission to use and print this image.',
        consentNote: 'Orders may be stopped if a copyright claim is filed.', terms: 'Terms',
        needConsent: 'Accept the notice above to continue', chosen: 'Selected photo' };

  const render = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const url = await onRender(file, values);
      setPreview(url);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-bold text-gray-900">{t.title}</p>
          <button type="button" onClick={onCancel} className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {preview ? (
            <img src={preview} alt={assets.templateName}
              className="mx-auto max-h-[46vh] w-auto rounded-xl border border-gray-100 bg-[repeating-conic-gradient(#f4f4f4_0%_25%,transparent_0%_50%)] bg-[length:14px_14px] object-contain" />
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
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(''); } e.target.value = ''; }} />
              <button type="button" disabled={!consent} onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 px-4 py-4 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-400 disabled:opacity-40">
                {!consent ? t.needConsent : file ? `${t.chosen}: ${file.name.slice(0, 28)}` : t.pick}
              </button>

              {fields.map((f) => (
                <label key={f.id} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between text-xs font-semibold text-gray-600">
                    {f.label}
                    <span className="text-[10px] font-normal text-gray-400">
                      {(values[f.id] ?? '').length}/{f.maxLength}
                    </span>
                  </span>
                  <input
                    type="text"
                    maxLength={f.maxLength}
                    placeholder={f.placeholder}
                    value={values[f.id] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
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
