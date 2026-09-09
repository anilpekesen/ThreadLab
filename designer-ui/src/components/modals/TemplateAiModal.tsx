import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

export interface AiTextField {
  id: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
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
  /** Sağlayıcıya göre beklenen süre; bekleme metninde gösterilir */
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
/** Uzun metinler tek satırlık kutuya sığmıyor; hikâye alanı textarea olur */
const LONG_TEXT_MIN = 60;

function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  const value = String(error || '').replace(/^Error:\s*/i, '').trim();
  return value || fallback;
}

/**
 * AI şablonu penceresi.
 *
 * Önizlemeden sonra alanları saklamayız. Müşteri ismi veya hikâyeyi aynı
 * ekranda düzeltir, değişikliği yeni önizlemeye uygular ve yalnızca güncel
 * sonuç sepete aktarılır.
 */
export default function TemplateAiModal({
  assets, isTurkish, termsUrl, onRender, onCancel, onConfirm,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    (assets.textFields ?? []).map((field) => [field.id, field.defaultValue ?? '']),
  ));
  const styles = assets.styles ?? [];
  const [styleId, setStyleId] = useState(styles[0]?.id ?? '');
  const [preview, setPreview] = useState('');
  const [renderedSignature, setRenderedSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(() => {
    try { const v = localStorage.getItem(CONSENT_KEY); return v == null ? true : v === '1'; }
    catch { return true; }
  });

  const fields = assets.textFields ?? [];
  const seconds = assets.expectedSeconds ?? 20;
  const photoUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);
  const currentSignature = useMemo(() => JSON.stringify({
    file: file ? [file.name, file.size, file.lastModified] : null,
    styleId,
    values,
  }), [file, styleId, values]);
  const hasPendingChanges = Boolean(preview && renderedSignature !== currentSignature);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

  const t = isTurkish
    ? {
        title: 'Yapay zekâ ile tasarımını oluştur',
        subtitle: 'Fotoğrafını seç, hikâyeni anlat ve baskıdan önce sonucunu gör.',
        pick: 'Fotoğraf seç', change: 'Fotoğrafı değiştir',
        make: 'Tasarımımı oluştur', apply: 'Değişiklikleri uygula', ok: 'Bu tasarımı kullan', cancel: 'Vazgeç',
        busy: `Tasarımın hazırlanıyor, yaklaşık ${seconds} saniye sürebilir`,
        photoHint: 'Yüzün net, aydınlık ve kameraya dönük olduğu bir fotoğraf en iyi sonucu verir.',
        storyHint: 'Hikâye / Not alanı tasarımın duygusunu ve detaylarını yönlendirir. İsim, sonuca doğru yazımla eklenir.',
        styleLabel: 'Tasarım tarzı', detailsTitle: 'Tasarımını kişiselleştir',
        consent: 'Bu görselin kullanım ve baskı hakkına sahibim ya da gerekli izinleri aldım.',
        consentNote: 'Telif ihlali bildiriminde sipariş durdurulabilir.', terms: 'Koşulları incele',
        needConsent: 'Tasarımı oluşturmak için kullanım hakkı onayını verin.', chosen: 'Seçilen fotoğraf',
        sideFront: 'Ön yüz', sideBack: 'Arka yüz', close: 'Pencereyi kapat',
        resultTitle: 'Tasarımın hazır', resultHint: 'İsim ve hikâyeyi kişiselleştirme alanlarından düzeltebilirsin.',
        pending: 'Yaptığın değişiklikler henüz önizlemeye uygulanmadı.',
        current: 'Önizleme güncel. Tasarımı ürüne ekleyebilirsin.',
        error: 'Tasarım oluşturulamadı. Lütfen tekrar deneyin.',
        stepPhoto: 'Fotoğraf', stepPersonalize: 'Kişiselleştir', stepConfirm: 'Onayla',
        selectedPhotoAlt: 'Yüklenen fotoğraf önizlemesi', generatedAlt: 'Yapay zekâ ile oluşturulan tasarım',
      }
    : {
        title: 'Create your design with AI',
        subtitle: 'Choose a photo, share your story, and see the result before printing.',
        pick: 'Choose photo', change: 'Change photo',
        make: 'Create my design', apply: 'Apply changes', ok: 'Use this design', cancel: 'Cancel',
        busy: `Preparing your design, this may take about ${seconds} seconds`,
        photoHint: 'A clear, well-lit photo with faces looking at the camera gives the best result.',
        storyHint: 'Your story guides the mood and details of the artwork. Names are added with accurate spelling.',
        styleLabel: 'Design style', detailsTitle: 'Personalize your design',
        consent: 'I own or have permission to use and print this image.',
        consentNote: 'Orders may be stopped if a copyright claim is filed.', terms: 'Review terms',
        needConsent: 'Confirm your image rights to create the design.', chosen: 'Selected photo',
        sideFront: 'Front', sideBack: 'Back', close: 'Close dialog',
        resultTitle: 'Your design is ready', resultHint: 'You can still edit the name and story in the personalization fields.',
        pending: 'Your changes have not been applied to the preview yet.',
        current: 'The preview is up to date. You can add it to the product.',
        error: 'Could not create the design. Please try again.',
        stepPhoto: 'Photo', stepPersonalize: 'Personalize', stepConfirm: 'Confirm',
        selectedPhotoAlt: 'Uploaded photo preview', generatedAlt: 'AI-generated design',
      };

  const render = async () => {
    if (!file || !consent || busy) return;
    setBusy(true);
    setError('');
    const requestedSignature = currentSignature;
    try {
      const result = await onRender(file, styleId, values);
      setPreview(result.url);
      setRenderedSignature(requestedSignature);
    } catch (err) {
      setError(readableError(err, t.error));
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = (nextFile: File) => {
    setFile(nextFile);
    setPreview('');
    setRenderedSignature('');
    setError('');
  };

  const canConfirm = Boolean(preview && !hasPendingChanges && !busy);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="ai-design-title">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="ai-design-title" className="text-base font-bold text-gray-950 sm:text-lg">{t.title}</h2>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600">
                  {assets.side === 'back' ? t.sideBack : t.sideFront}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-600 sm:text-sm">{t.subtitle}</p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onCancel} disabled={busy} aria-label={t.close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-40">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 sm:px-6">
          <ol className="flex items-center gap-2 text-[11px] font-semibold text-gray-500" aria-label={t.title}>
            {[t.stepPhoto, t.stepPersonalize, t.stepConfirm].map((label, index) => {
              const active = index === 0 ? Boolean(file) : index === 1 ? Boolean(preview) : canConfirm;
              return (
                <li key={label} className="flex flex-1 items-center gap-2">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${active ? 'bg-rose-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {active ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className={active ? 'text-gray-900' : ''}>{label}</span>
                  {index < 2 && <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
            <section className="flex min-h-[330px] flex-col bg-gray-950 p-4 sm:min-h-[430px] sm:p-6">
              {preview ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-3 flex items-center justify-between gap-3 text-white">
                    <div>
                      <p className="text-sm font-bold">{t.resultTitle}</p>
                      <p className="mt-0.5 text-[11px] text-gray-300">{t.resultHint}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white">
                      <Sparkles className="h-3 w-3" aria-hidden="true" /> AI
                    </span>
                  </div>
                  <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(45deg,#20242d_25%,transparent_25%),linear-gradient(-45deg,#20242d_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#20242d_75%),linear-gradient(-45deg,transparent_75%,#20242d_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
                    <img src={preview} alt={t.generatedAlt} className="max-h-[54vh] w-full object-contain" />
                    {busy && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/80 px-6 text-center text-white" aria-live="polite">
                        <LoaderCircle className="h-8 w-8 animate-spin text-rose-400" aria-hidden="true" />
                        <p className="mt-3 text-sm font-semibold">{t.busy}</p>
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                    className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-40">
                    <ImageIcon className="h-4 w-4" aria-hidden="true" />
                    {t.change}
                  </button>
                </div>
              ) : (
                <div className="flex flex-1 flex-col justify-center">
                  <div className="mx-auto w-full max-w-md text-center text-white">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                      <Upload className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-base font-bold">{file ? t.chosen : t.pick}</h3>
                    <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-gray-300">{t.photoHint}</p>
                  </div>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                    className="group relative mx-auto mt-5 flex min-h-48 w-full max-w-md items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-600 bg-gray-900 px-5 py-6 text-center transition-colors hover:border-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-40">
                    {photoUrl ? (
                      <>
                        <img src={photoUrl} alt={t.selectedPhotoAlt} className="absolute inset-0 h-full w-full object-contain" />
                        <span className="absolute inset-x-3 bottom-3 rounded-lg bg-gray-950/85 px-3 py-2 text-xs font-semibold text-white">
                          {file?.name.slice(0, 42)}
                        </span>
                      </>
                    ) : (
                      <span className="flex flex-col items-center gap-2 text-sm font-semibold text-gray-200">
                        <Upload className="h-5 w-5 text-rose-400" aria-hidden="true" />
                        {t.pick}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </section>

            <form className="flex flex-col" onSubmit={(event) => { event.preventDefault(); void render(); }}>
              <div className="flex-1 space-y-5 p-4 sm:p-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-950">{t.detailsTitle}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{t.storyHint}</p>
                </div>

                {styles.length > 0 && (
                  <fieldset disabled={busy} className="space-y-2">
                    <legend className="text-xs font-semibold text-gray-700">{t.styleLabel}</legend>
                    <div className="flex flex-wrap gap-2">
                      {styles.map((style) => (
                        <button key={style.id} type="button" onClick={() => setStyleId(style.id)} aria-pressed={styleId === style.id}
                          className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1 ${
                            styleId === style.id
                              ? 'border-rose-600 bg-rose-600 text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                          }`}>
                          {isTurkish ? style.label : style.labelEn}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <div className="space-y-4">
                  {fields.map((field) => (
                    <label key={field.id} className="block">
                      <span className="mb-1.5 flex items-baseline justify-between gap-3 text-xs font-semibold text-gray-700">
                        {field.label}
                        <span className="text-[10px] font-normal tabular-nums text-gray-500">
                          {(values[field.id] ?? '').length}/{field.maxLength}
                        </span>
                      </span>
                      {field.maxLength >= LONG_TEXT_MIN ? (
                        <textarea rows={4} maxLength={field.maxLength} placeholder={field.placeholder}
                          value={values[field.id] ?? ''} disabled={busy}
                          onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                          className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-950 outline-none placeholder:text-gray-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:bg-gray-100" />
                      ) : (
                        <input type="text" maxLength={field.maxLength} placeholder={field.placeholder}
                          value={values[field.id] ?? ''} disabled={busy}
                          onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-950 outline-none placeholder:text-gray-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:bg-gray-100" />
                      )}
                    </label>
                  ))}
                </div>

                <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ${consent ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <input type="checkbox" checked={consent} disabled={busy}
                    onChange={(event) => {
                      setConsent(event.target.checked);
                      try { localStorage.setItem(CONSENT_KEY, event.target.checked ? '1' : '0'); } catch { /* yoksay */ }
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
                  <span>
                    <span className="block text-xs font-semibold leading-snug text-gray-800">{t.consent}</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-gray-600">
                      {t.consentNote}{' '}
                      <a href={termsUrl || DEFAULT_TERMS_URL} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-rose-700 underline-offset-2 hover:underline">{t.terms}</a>
                    </span>
                  </span>
                </label>

                {!consent && <p className="text-xs font-medium text-amber-700">{t.needConsent}</p>}
                {error && <p className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700" role="alert">{error}</p>}
              </div>

              <footer className="border-t border-gray-200 bg-white p-4 sm:px-6">
                {preview && (
                  <p className={`mb-3 flex items-center gap-2 text-[11px] font-medium ${hasPendingChanges ? 'text-amber-700' : 'text-emerald-700'}`} aria-live="polite">
                    {hasPendingChanges ? <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {hasPendingChanges ? t.pending : t.current}
                  </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={onCancel} disabled={busy}
                    className="rounded-xl px-4 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-40">
                    {t.cancel}
                  </button>
                  {canConfirm && (
                    <button type="button" onClick={() => onConfirm(preview)}
                      className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
                      {t.ok}
                    </button>
                  )}
                  {(!preview || hasPendingChanges) && (
                    <button type="submit" disabled={!file || !consent || busy}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600">
                      {busy ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.busy}</> : preview ? <><RefreshCw className="h-4 w-4" aria-hidden="true" /> {t.apply}</> : <><Sparkles className="h-4 w-4" aria-hidden="true" /> {t.make}</>}
                    </button>
                  )}
                </div>
              </footer>
            </form>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) chooseFile(nextFile);
            event.target.value = '';
          }} />
      </div>
    </div>
  );
}
