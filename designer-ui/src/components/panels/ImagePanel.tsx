import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, QrCode, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useDesignerStore } from '@/store/designerStore';
import { compressImage, generateId } from '@/utils/compress';
import type { UploadedImage } from '@/types';
import { useDesignerI18n } from '../../i18n';

const CONSENT_KEY = 'printlab_image_rights_accepted';

interface Props {
  onAddImage: (url: string) => void;
  onRemoveBg: (url: string) => Promise<string>;
  canRemoveBg: boolean;
  activeSource: 'upload' | 'qr' | 'ai';
  shop?: string;
  uploadEndpoint?: string;
  sessionId?: string;
  locale?: string;
}

function isTR(locale?: string) {
  return !locale || locale.startsWith('tr');
}

export default function ImagePanel({ onAddImage, onRemoveBg, canRemoveBg, activeSource, shop, uploadEndpoint, sessionId, locale }: Props) {
  const tr = isTR(locale);
  const { t } = useDesignerI18n(locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      return stored == null ? true : stored === '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(CONSENT_KEY, consentAccepted ? '1' : '0'); } catch { }
  }, [consentAccepted]);

  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const { uploadedImages, addUploadedImage, removeUploadedImage, isBgRemoving } = useDesignerStore();

  const uploadOriginalImage = useCallback(async (file: File): Promise<string> => {
    if (!uploadEndpoint) return '';
    try {
      const form = new FormData();
      form.append('image', file, file.name || 'user-upload.png');
      form.append('side', 'user-upload');
      const res = await fetch(uploadEndpoint, { method: 'POST', body: form });
      if (!res.ok) return '';
      const data = await res.json() as { url?: string };
      return data.url ?? '';
    } catch {
      return '';
    }
  }, [uploadEndpoint]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    let firstUrl = '';
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const [dataUrl, serverUrl] = await Promise.all([
        compressImage(file, 4000),
        uploadOriginalImage(file),
      ]);
      const originalUrl = serverUrl || dataUrl;
      addUploadedImage({
        id: generateId(),
        dataUrl,
        serverUrl: originalUrl,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
        addedAt: Date.now(),
      });
      if (!firstUrl) firstUrl = originalUrl;
    }
    if (fileRef.current) fileRef.current.value = '';
    if (!firstUrl) return;
    if (canRemoveBg) setPendingUrl(firstUrl);
    else onAddImage(firstUrl);
  }, [addUploadedImage, onAddImage, canRemoveBg, uploadOriginalImage]);

  const handleAddFromUrl = useCallback(async () => {
    const value = imageUrl.trim();
    if (!value) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      const res = await fetch('/apps/tshirt-designer/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value }) });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setUrlError(data.error ?? (tr ? 'Resim yüklenemedi' : 'Could not load image')); return; }
      setImageUrl('');
      setShowUrlInput(false);
      if (canRemoveBg) setPendingUrl(data.url);
      else onAddImage(data.url);
    } catch { setUrlError(tr ? 'Bağlantı hatası, tekrar deneyin' : 'Connection error, please retry'); }
    finally { setUrlLoading(false); }
  }, [imageUrl, canRemoveBg, onAddImage]);

  return (
    <div className="flex flex-col gap-3">
      {activeSource === 'upload' && (
        <>
          {/* Telif hakkı onayı */}
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${consentAccepted ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
            <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
            <div>
              <p className="text-xs font-semibold leading-snug text-gray-700">
                {tr ? 'Bu görselin kullanım ve baskı hakkına sahibim ya da gerekli izinleri aldım.' : 'I own or have permission to use and print this image.'}
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {tr ? 'Telif ihlali bildiriminde sipariş durdurulabilir.' : 'Orders may be stopped if a copyright claim is filed.'}{' '}
                <a href="https://app.printlabapp.com/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{tr ? 'Koşullar' : 'Terms'}</a>
              </p>
            </div>
          </label>

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

            <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/80 p-3 md:p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{t.addImageTitle}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-semibold text-gray-400">PNG · JPG · WebP</span>
              </div>

            <div className="grid gap-2 md:hidden">
              <button
                type="button"
                disabled={!consentAccepted}
                onClick={() => fileRef.current?.click()}
                className="flex min-h-[58px] items-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-left text-white disabled:opacity-40"
              >
                <div className="rounded-xl bg-white/12 p-2.5">
                  <ImagePlus className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.selectFromGallery}</p>
                  <p className="text-xs text-white/70">{tr ? 'Bir veya birden fazla görsel' : 'One or more images'}</p>
                </div>
              </button>
            </div>

            <div
              onDrop={consentAccepted ? (e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); } : undefined}
              onDragOver={consentAccepted ? (e) => { e.preventDefault(); setIsDragOver(true); } : undefined}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => consentAccepted && fileRef.current?.click()}
              className={`group relative mt-1 hidden cursor-pointer rounded-2xl border-2 border-dashed transition-all md:block ${
                !consentAccepted
                  ? 'cursor-not-allowed border-gray-100 opacity-40'
                  : isDragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'
              }`}
            >
              <div className="flex flex-col items-center gap-3 px-6 py-9 text-center">
                <div className={`rounded-2xl p-3 transition-colors ${isDragOver ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">{tr ? 'Görseli sürükle bırak veya' : 'Drag & drop or'} <span className="text-blue-600">{tr ? 'bilgisayardan seç' : 'select from computer'}</span></p>
                  <p className="mt-1 text-xs text-gray-400">{tr ? 'Yüksek çözünürlük daha iyi baskı sonucu verir' : 'Higher resolution gives better print quality'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* URL ile ekle */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50/70">
            {/* Mobil: accordion */}
            <button type="button" onClick={() => setShowUrlInput((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 md:hidden">
              <Link2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="flex-1 text-left text-xs font-medium text-gray-500">{t.addWithUrl}</span>
              <span className="text-[10px] text-gray-400">{showUrlInput ? '▲' : '▼'}</span>
            </button>

            {/* Desktop: her zaman görünür */}
            <div className={`${showUrlInput ? 'block' : 'hidden'} md:block`}>
              <div className="flex flex-col gap-2 p-3 md:flex-row">
                <input
                  type="url"
                  value={imageUrl}
                  disabled={!consentAccepted}
                  onChange={(e) => { setImageUrl(e.target.value); setUrlError(''); }}
                  onKeyDown={async (e) => { if (e.key === 'Enter' && consentAccepted) await handleAddFromUrl(); }}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-300 focus:border-blue-400 disabled:opacity-40"
                />
                <button
                  disabled={urlLoading || !consentAccepted || !imageUrl.trim()}
                  onClick={handleAddFromUrl}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-30 md:px-4"
                >
                  {urlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (tr ? 'Ekle' : 'Add')}
                </button>
              </div>
              {urlError && <p className="px-3 pb-2 text-[11px] text-red-500">{urlError}</p>}
            </div>
          </div>

          {/* Arka plan kaldırma onayı */}
          {pendingUrl && canRemoveBg && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <p className="text-sm font-semibold text-blue-700">{t.removeBgQuestion}</p>
                </div>
                <button onClick={() => setPendingUrl(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
              <img src={pendingUrl} alt={t.previewLabel} className="mx-auto my-3 max-h-24 rounded-lg object-contain" />
              <div className="flex gap-2">
                <button
                  disabled={isBgRemoving}
                  onClick={async () => {
                    const url = pendingUrl; setPendingUrl(null);
                    const result = await onRemoveBg(url);
                    if (result) addUploadedImage({ id: generateId(), dataUrl: result, serverUrl: result, name: tr ? 'Temizlenmiş' : 'Cleaned', addedAt: Date.now() });
                    onAddImage(result || url);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> {t.removeBgYes}
                </button>
                <button
                  disabled={isBgRemoving}
                  onClick={() => { const url = pendingUrl; setPendingUrl(null); onAddImage(url); }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t.keepOriginal}
                </button>
              </div>
            </div>
          )}

          {isBgRemoving && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.imageRemoving}
            </div>
          )}

          {/* Yüklenen görseller */}
          {uploadedImages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{tr ? 'Yüklenenler' : 'Uploaded'}</p>
                <span className="text-[10px] text-gray-400">{uploadedImages.length} {tr ? 'görsel' : 'image'}{uploadedImages.length !== 1 && !tr ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)}
                      className="block aspect-square w-full cursor-pointer md:cursor-default"
                      aria-label={`${img.name} ${tr ? 'tasarıma ekle' : 'add to design'}`}
                    >
                      <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                    </button>
                    {/* Hover overlay — desktop */}
                    <div className="absolute inset-0 hidden flex-col items-center justify-center gap-1.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
                      <button onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)} className="w-[80%] rounded-lg bg-white py-1.5 text-xs font-bold text-gray-900 hover:bg-gray-50">
                        {tr ? 'Ekle' : 'Add'}
                      </button>
                      {canRemoveBg && (
                        <button disabled={isBgRemoving} onClick={async () => { const r = await onRemoveBg(img.serverUrl ?? img.dataUrl); if (r) { addUploadedImage({ id: generateId(), dataUrl: r, serverUrl: r, name: `${img.name} ✦`, addedAt: Date.now() }); onAddImage(r); } }} className="w-[80%] rounded-lg bg-white/20 py-1.5 text-xs font-semibold text-white hover:bg-white/30 disabled:opacity-40">
                          {tr ? 'BG Kaldır' : 'Remove BG'}
                        </button>
                      )}
                      <button onClick={() => removeUploadedImage(img.id)} className="rounded-lg bg-red-500/80 p-1.5 text-white hover:bg-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {/* Touch actions — mobile */}
                    <div className="space-y-1.5 p-2 md:hidden">
                      <p className="truncate px-1 text-[11px] font-medium text-gray-600">{img.name}</p>
                      <div className="flex gap-1">
                      <button onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)} className="flex-1 rounded-lg bg-gray-900 py-1.5 text-[11px] font-semibold text-white">
                        {tr ? 'Ekle' : 'Add'}
                      </button>
                      {canRemoveBg && (
                        <button disabled={isBgRemoving} onClick={async () => { const r = await onRemoveBg(img.serverUrl ?? img.dataUrl); if (r) { addUploadedImage({ id: generateId(), dataUrl: r, serverUrl: r, name: `${img.name} ✦`, addedAt: Date.now() }); onAddImage(r); } }} className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 text-purple-600 disabled:opacity-40">
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => removeUploadedImage(img.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeSource === 'qr' && (
        <QrPanel onAddImage={onAddImage} locale={locale} />
      )}

      {activeSource === 'ai' && (
        <AiPanel
          onAddImage={onAddImage}
          onRemoveBg={onRemoveBg}
          canRemoveBg={canRemoveBg}
          shop={shop}
          uploadEndpoint={uploadEndpoint}
          sessionId={sessionId}
          locale={locale}
        />
      )}
    </div>
  );
}

// ─── Yapay Zeka Görseli ──────────────────────────────────────────────────────

const STYLE_PRESETS = [
  { labelTr: 'Amblem / Streetwear', labelEn: 'Emblem / Streetwear', hint: 'streetwear emblem graphic, dramatic mascot logo, apparel print design' },
  { labelTr: 'Vektör illüstrasyon', labelEn: 'Vector illustration', hint: 'vector illustration style, flat design' },
  { labelTr: 'Anime / Manga', labelEn: 'Anime / Manga', hint: 'anime illustration style, manga art' },
  { labelTr: 'Gerçekçi', labelEn: 'Realistic', hint: 'realistic, highly detailed, photorealistic' },
  { labelTr: 'Vintage / Retro', labelEn: 'Vintage / Retro', hint: 'vintage retro poster art, distressed texture' },
  { labelTr: 'Minimalist', labelEn: 'Minimalist', hint: 'minimalist design, simple shapes, clean' },
  { labelTr: 'Graffiti', labelEn: 'Graffiti', hint: 'graffiti street art style, urban art' },
];

interface QuotaInfo {
  isTrial: boolean;
  isActive: boolean;
  shopRemaining: number;
  shopQuota: number;
  customerRemaining: number;
  customerLimit: number;
}

function AiPanel({
  onAddImage,
  onRemoveBg,
  canRemoveBg,
  shop,
  uploadEndpoint,
  sessionId,
  locale,
}: {
  onAddImage: (url: string) => void;
  onRemoveBg: (url: string) => Promise<string>;
  canRemoveBg: boolean;
  shop?: string;
  uploadEndpoint?: string;
  sessionId?: string;
  locale?: string;
}) {
  const tr = isTR(locale);
  const { t } = useDesignerI18n(locale);
  const { uploadedImages, addUploadedImage, removeUploadedImage } = useDesignerStore();
  const [prompt, setPrompt] = useState('');
  const [styleIdx, setStyleIdx] = useState(0);
  const [result, setResult] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const appUrl = uploadEndpoint?.split('/apps/')[0] ?? '';
  const aiImages = uploadedImages.filter((img) => img.name.startsWith('AI Tasarim'));

  const saveAiImage = useCallback((url: string, name: string) => {
    const alreadyExists = uploadedImages.some((img) => (img.serverUrl ?? img.dataUrl) === url);
    if (alreadyExists) return;
    addUploadedImage({ id: generateId(), dataUrl: url, serverUrl: url, name, addedAt: Date.now() });
  }, [addUploadedImage, uploadedImages]);

  // Panel açılınca kota bilgisini çek
  useEffect(() => {
    if (!shop) return;
    fetch(`${appUrl}/apps/tshirt-designer/generate-image?shop=${encodeURIComponent(shop)}&sessionId=${encodeURIComponent(sessionId ?? '')}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setQuota(data as QuotaInfo); })
      .catch(() => {});
  }, [appUrl, shop, sessionId]);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setLoadingStep(t.aiGenerating);
    setError('');
    setResult('');
    setEnhancedPrompt('');

    // Adım göstergesini 10 saniye sonra güncelle (bg removal aşamasına geçildiğini göster)
    const stepTimer = setTimeout(() => setLoadingStep(t.imageRemoving), 10_000);
    try {
      const res = await fetch(`${appUrl}/apps/tshirt-designer/generate-image?shop=${encodeURIComponent(shop ?? '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          styleHint: STYLE_PRESETS[styleIdx].hint,
          sessionId: sessionId ?? '',
        }),
      });
      const rawText = await res.text();
      const data = (() => {
        try {
          return JSON.parse(rawText) as { url?: string; enhancedPrompt?: string; error?: string; customerRemaining?: number; shopRemaining?: number };
        } catch {
          return { error: rawText || 'Gorsel olusturulamadi' };
        }
      })();
      if (!res.ok || !data.url) { setError(data.error ?? (tr ? 'Görsel oluşturulamadı' : 'Could not generate image')); return; }
      setResult(data.url);
      setEnhancedPrompt(data.enhancedPrompt ?? '');
      saveAiImage(data.url, 'AI Tasarim');
      if (data.customerRemaining !== undefined || data.shopRemaining !== undefined) {
        setQuota((prev) => prev ? {
          ...prev,
          customerRemaining: data.customerRemaining ?? prev.customerRemaining,
          shopRemaining: data.shopRemaining ?? prev.shopRemaining,
        } : prev);
      }
    } catch {
      setError(tr ? 'Bağlantı hatası — lütfen tekrar deneyin' : 'Connection error — please try again');
    } finally {
      clearTimeout(stepTimer);
      setLoading(false);
      setLoadingStep('');
    }
  }

  async function handleAdd() {
    if (!result) return;
    setAdding(true);
    try {
      saveAiImage(result, 'AI Tasarim');
      onAddImage(result);
      setError('');
    } catch {
      setError(tr ? 'AI görseli tişörte eklenemedi. Lütfen tekrar deneyin.' : 'Could not add AI image. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveToUploads() {
    if (!result) return;
    setSaving(true);
    try {
      saveAiImage(result, 'AI Tasarim');
      setError('');
    } finally {
      setSaving(false);
    }
  }

  async function handleMakeTransparent() {
    if (!result || !canRemoveBg) return;
    setRemovingBg(true);
    setError('');
    try {
      const cleaned = await onRemoveBg(result);
      if (!cleaned) {
        setError('Arka plan kaldirilamadi. Lutfen tekrar deneyin.');
        return;
      }
      setResult(cleaned);
      saveAiImage(cleaned, 'AI Tasarim PNG');
    } catch {
      setError('Arka plan kaldirilamadi. Lutfen tekrar deneyin.');
    } finally {
      setRemovingBg(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Başlık + Kota */}
      <div className="flex items-start gap-3 rounded-xl bg-violet-50 p-3.5">
        <span className="mt-0.5 text-lg leading-none">✦</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-violet-800">{t.aiPanelTitle}</p>
          <p className="mt-0.5 text-xs text-violet-600">
            {t.aiPanelDesc}
          </p>
          {quota && (
            <div className="mt-2 flex flex-wrap gap-2">
              {quota.isTrial ? (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                  ⚠ {t.aiDisabledTrial}
                </span>
              ) : !quota.isActive ? (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-700">
                  ✕ {t.aiSubscriptionRequired}
                </span>
              ) : (
                <>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${quota.customerRemaining > 0 ? 'bg-violet-100 text-violet-700' : 'bg-red-100 text-red-700'}`}>
                    {t.aiSessionRemaining}: {quota.customerRemaining}/{quota.customerLimit} {t.aiRemainingSuffix}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stil seçimi */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">{t.aiStyleLabel}</label>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStyleIdx(i)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                styleIdx === i
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tr ? s.labelTr : s.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt girişi */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">{t.aiPromptLabel}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={tr ? 'Orn: Turk bayragi hilal ve yildizi kartalin gogus ve kanatlarina gecmis, tek parca guclu bir amblem, yuksek enerjili streetwear tisort tasarimi' : 'E.g. A fierce eagle mascot fused with the crescent moon, single piece bold emblem, high-energy streetwear print design'}
          rows={4}
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-gray-300 focus:border-violet-400"
        />
        <p className="text-[10px] text-gray-400">
          {t.aiPromptHelp}
        </p>
      </div>

      {/* Oluştur butonu */}
      <button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim() || (quota !== null && (!quota.isActive || quota.isTrial || quota.customerRemaining <= 0 || quota.shopRemaining <= 0))}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingStep || t.aiGenerating}
          </>
        ) : (
          <>✦ {t.btnGenerateImage}</>
        )}
      </button>

      {/* Hata */}
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>
      )}

      {/* Sonuç */}
      {result && (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
          <img src={result} alt={tr ? 'AI görseli' : 'AI image'} className="w-full rounded-lg object-contain" style={{ maxHeight: 300 }} />

          {enhancedPrompt && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-medium text-violet-500 hover:text-violet-700">
                {t.aiShowPrompt}
              </summary>
              <p className="mt-1.5 rounded-lg bg-white p-2.5 text-[10px] leading-relaxed text-gray-500">{enhancedPrompt}</p>
            </details>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSaveToUploads}
              disabled={saving || removingBg}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              {saving ? t.aiSaving : t.aiSaveToUploads}
            </button>
            {canRemoveBg && (
              <button
                onClick={handleMakeTransparent}
                disabled={removingBg || adding || saving}
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-40"
              >
                {removingBg ? t.aiPreparingPng : t.btnMakeTransparentPng}
              </button>
            )}
            <button
              onClick={handleAdd}
              disabled={adding || removingBg}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <>✦ {t.aiAddToDesign}</>}
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              {t.btnRegenerate}
            </button>
          </div>
        </div>
      )}

      {aiImages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t.aiHistory}</p>
            <span className="text-[10px] text-gray-400">{aiImages.length} {tr ? 'görsel' : 'image'}{aiImages.length !== 1 && !tr ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {aiImages.map((img) => (
              <div key={img.id} className="group relative overflow-hidden rounded-2xl border border-violet-100 bg-violet-50/40">
                <button
                  type="button"
                  onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)}
                  className="block aspect-square w-full cursor-pointer md:cursor-default"
                  aria-label={`${img.name} tasarima ekle`}
                >
                  <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                </button>
                <div className="absolute inset-0 hidden flex-col items-center justify-center gap-1.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
                  <button onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)} className="w-[80%] rounded-lg bg-white py-1.5 text-xs font-bold text-gray-900 hover:bg-gray-50">
                    {tr ? 'Ekle' : 'Add'}
                  </button>
                  {canRemoveBg && (
                    <button
                      onClick={async () => {
                        const cleaned = await onRemoveBg(img.serverUrl ?? img.dataUrl);
                        if (cleaned) {
                          saveAiImage(cleaned, 'AI Tasarim PNG');
                          onAddImage(cleaned);
                        }
                      }}
                      className="w-[80%] rounded-lg bg-white/20 py-1.5 text-xs font-semibold text-white hover:bg-white/30"
                    >
                      Seffaf PNG
                    </button>
                  )}
                  <button onClick={() => removeUploadedImage(img.id)} className="rounded-lg bg-red-500/80 p-1.5 text-white hover:bg-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1.5 p-2 md:hidden">
                  <p className="truncate px-1 text-[11px] font-medium text-gray-600">{img.name}</p>
                  <div className="flex gap-1">
                    <button onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)} className="flex-1 rounded-lg bg-gray-900 py-1.5 text-[11px] font-semibold text-white">
                      {tr ? 'Ekle' : 'Add'}
                    </button>
                    {canRemoveBg && (
                      <button
                        onClick={async () => {
                          const cleaned = await onRemoveBg(img.serverUrl ?? img.dataUrl);
                          if (cleaned) {
                            saveAiImage(cleaned, 'AI Tasarim PNG');
                            onAddImage(cleaned);
                          }
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 text-purple-600"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => removeUploadedImage(img.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QR Kod ──────────────────────────────────────────────────────────────────

const QR_COLORS = [
  { labelTr: 'Siyah', labelEn: 'Black', fg: '#000000', bg: '#ffffff' },
  { labelTr: 'Lacivert', labelEn: 'Navy', fg: '#1e3a5f', bg: '#ffffff' },
  { labelTr: 'Koyu Yeşil', labelEn: 'Dark Green', fg: '#166534', bg: '#ffffff' },
  { labelTr: 'Bordo', labelEn: 'Burgundy', fg: '#7f1d1d', bg: '#ffffff' },
  { labelTr: 'Beyaz', labelEn: 'White', fg: '#ffffff', bg: '#000000' },
];

function QrPanel({ onAddImage, locale }: { onAddImage: (url: string) => void; locale?: string }) {
  const tr = isTR(locale);
  const { t } = useDesignerI18n(locale);
  const [text, setText] = useState('');
  const [colorIdx, setColorIdx] = useState(0);
  const [preview, setPreview] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!text.trim()) { setPreview(''); return; }
    let cancelled = false;
    const color = QR_COLORS[colorIdx];
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(text.trim(), {
        width: 400,
        margin: 2,
        color: { dark: color.fg, light: color.bg },
      }))
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview('');
      });
    return () => {
      cancelled = true;
    };
  }, [text, colorIdx]);

  async function handleAdd() {
    if (!preview) return;
    setAdding(true);
    try {
      onAddImage(preview);
    } catch {
      onAddImage(preview);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Açıklama */}
      <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3.5">
        <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
        <div>
          <p className="text-sm font-semibold text-gray-700">{tr ? 'QR Kod Tasarıma Ekle' : 'Add QR Code to Design'}</p>
          <p className="mt-0.5 text-xs text-gray-400">{tr ? 'URL, Instagram linki, telefon numarası veya herhangi bir metin girin. QR kodu tişörtün üzerine basılacak.' : 'Enter a URL, Instagram link, phone number or any text. The QR code will be printed on the garment.'}</p>
        </div>
      </div>

      {/* Metin girişi */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">{t.contentLabel}</label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr ? 'https://instagram.com/hesabim' : 'https://instagram.com/youraccount'}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none placeholder:text-gray-300 focus:border-gray-400"
        />
        <p className="text-[10px] text-gray-400">{tr ? 'URL, sosyal medya, telefon no, kısa metin…' : 'URL, social media, phone number, short text…'}</p>
      </div>

      {/* Renk seçimi */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-gray-600">{t.colorLabel}</label>
        <div className="flex gap-2 flex-wrap">
          {QR_COLORS.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setColorIdx(i)}
              title={tr ? c.labelTr : c.labelEn}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
                colorIdx === i ? 'border-gray-400 shadow-sm ring-1 ring-gray-300' : 'border-gray-100 hover:border-gray-300'
              }`}
              style={{ background: c.bg, color: c.fg }}
            >
              <span className="inline-block h-3.5 w-3.5 rounded-sm border border-current/20" style={{ background: c.fg }} />
              {tr ? c.labelTr : c.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Önizleme */}
      {preview ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <p className="self-start text-xs font-semibold text-gray-500">{t.previewLabel}</p>
          <img
            src={preview}
            alt={t.previewLabel}
            className="h-40 w-40 rounded-lg"
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="max-w-[240px] truncate text-center text-[10px] text-gray-400">{text}</p>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            {adding ? (tr ? 'Ekleniyor…' : 'Adding…') : (tr ? 'Tişörte Ekle' : 'Add to Design')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-100 py-10 text-center text-gray-300">
          <QrCode className="h-10 w-10" />
          <p className="text-xs">{t.enterContentAbove}</p>
        </div>
      )}
    </div>
  );
}
