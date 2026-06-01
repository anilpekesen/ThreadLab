import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useDesignerStore } from '@/store/designerStore';
import { compressImage, generateId } from '@/utils/compress';
import type { UploadedImage } from '@/types';

const CONSENT_KEY = 'printlab_image_rights_accepted';

interface Props {
  onAddImage: (url: string) => void;
  onRemoveBg: (url: string) => Promise<string>;
  canRemoveBg: boolean;
  activeSource: 'upload' | 'qr';
}

export default function ImagePanel({ onAddImage, onRemoveBg, canRemoveBg, activeSource }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(() => {
    try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(CONSENT_KEY, consentAccepted ? '1' : '0'); } catch { }
  }, [consentAccepted]);

  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const { uploadedImages, addUploadedImage, removeUploadedImage, isBgRemoving } = useDesignerStore();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    let firstUrl = '';
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await compressImage(file, 1800);
      let serverUrl: string | undefined;
      try {
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const form = new FormData();
        form.append('image', blob, 'user-upload.png');
        form.append('side', 'user-upload');
        const res = await fetch('/apps/tshirt-designer/upload', { method: 'POST', body: form });
        if (res.ok) serverUrl = ((await res.json()) as { url?: string }).url;
      } catch { }
      addUploadedImage({ id: generateId(), dataUrl, serverUrl, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), addedAt: Date.now() });
      if (!firstUrl) firstUrl = serverUrl ?? dataUrl;
    }
    if (fileRef.current) fileRef.current.value = '';
    if (!firstUrl) return;
    if (canRemoveBg) setPendingUrl(firstUrl);
    else onAddImage(firstUrl);
  }, [addUploadedImage, onAddImage, canRemoveBg]);

  const handleAddFromUrl = useCallback(async () => {
    const value = imageUrl.trim();
    if (!value) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      const res = await fetch('/apps/tshirt-designer/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value }) });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { setUrlError(data.error ?? 'Resim yüklenemedi'); return; }
      setImageUrl('');
      setShowUrlInput(false);
      if (canRemoveBg) setPendingUrl(data.url);
      else onAddImage(data.url);
    } catch { setUrlError('Bağlantı hatası, tekrar deneyin'); }
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
                Bu görselin kullanım ve baskı hakkına sahibim ya da gerekli izinleri aldım.
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                Telif ihlali bildiriminde sipariş durdurulabilir.{' '}
                <a href="https://app.printlabapp.com/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Koşullar</a>
              </p>
            </div>
          </label>

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {/* Upload alanı — desktop: drag zone, mobile: büyük buton */}
          <div
            onDrop={consentAccepted ? (e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); } : undefined}
            onDragOver={consentAccepted ? (e) => { e.preventDefault(); setIsDragOver(true); } : undefined}
            onDragLeave={() => setIsDragOver(false)}
            onClick={() => consentAccepted && fileRef.current?.click()}
            className={`group relative cursor-pointer rounded-xl border-2 border-dashed transition-all ${
              !consentAccepted
                ? 'cursor-not-allowed border-gray-100 opacity-40'
                : isDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'
            }`}
          >
            {/* Desktop görünümü */}
            <div className="hidden flex-col items-center gap-3 px-6 py-8 text-center md:flex">
              <div className={`rounded-xl p-3 transition-colors ${isDragOver ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Görsel sürükleyin veya <span className="text-blue-600">seçin</span></p>
                <p className="mt-1 text-xs text-gray-400">PNG, JPG, WebP · Maks 10MB</p>
              </div>
            </div>

            {/* Mobil görünümü */}
            <div className="flex items-center gap-3 px-4 py-4 md:hidden">
              <div className={`flex-none rounded-lg p-2.5 transition-colors ${consentAccepted ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                <ImagePlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Galeriden seç</p>
                <p className="text-xs text-gray-400">PNG, JPG, WebP</p>
              </div>
            </div>
          </div>

          {/* URL ile ekle */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/70">
            {/* Mobil: accordion */}
            <button type="button" onClick={() => setShowUrlInput((v) => !v)} className="flex w-full items-center gap-2 px-3.5 py-2.5 md:hidden">
              <Link2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="flex-1 text-left text-xs font-medium text-gray-500">URL ile ekle</span>
              <span className="text-[10px] text-gray-400">{showUrlInput ? '▲' : '▼'}</span>
            </button>

            {/* Desktop: her zaman görünür */}
            <div className={`${showUrlInput ? 'block' : 'hidden'} md:block`}>
              <div className="flex gap-2 p-3">
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
                  className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-30"
                >
                  {urlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Ekle'}
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
                  <p className="text-sm font-semibold text-blue-700">Arka planı kaldır?</p>
                </div>
                <button onClick={() => setPendingUrl(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
              <img src={pendingUrl} alt="Önizleme" className="mx-auto my-3 max-h-24 rounded-lg object-contain" />
              <div className="flex gap-2">
                <button
                  disabled={isBgRemoving}
                  onClick={async () => {
                    const url = pendingUrl; setPendingUrl(null);
                    const result = await onRemoveBg(url);
                    if (result) addUploadedImage({ id: generateId(), dataUrl: result, serverUrl: result, name: 'Temizlenmiş', addedAt: Date.now() });
                    onAddImage(result || url);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Evet, kaldır
                </button>
                <button
                  disabled={isBgRemoving}
                  onClick={() => { const url = pendingUrl; setPendingUrl(null); onAddImage(url); }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Olduğu gibi
                </button>
              </div>
            </div>
          )}

          {isBgRemoving && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Arka plan kaldırılıyor…
            </div>
          )}

          {/* Yüklenen görseller */}
          {uploadedImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Yüklenenler</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                    <div className="aspect-square">
                      <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                    </div>
                    {/* Hover overlay — desktop */}
                    <div className="absolute inset-0 hidden flex-col items-center justify-center gap-1.5 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
                      <button onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)} className="w-[80%] rounded-lg bg-white py-1.5 text-xs font-bold text-gray-900 hover:bg-gray-50">
                        Ekle
                      </button>
                      {canRemoveBg && (
                        <button disabled={isBgRemoving} onClick={async () => { const r = await onRemoveBg(img.serverUrl ?? img.dataUrl); if (r) { addUploadedImage({ id: generateId(), dataUrl: r, serverUrl: r, name: `${img.name} ✦`, addedAt: Date.now() }); onAddImage(r); } }} className="w-[80%] rounded-lg bg-white/20 py-1.5 text-xs font-semibold text-white hover:bg-white/30 disabled:opacity-40">
                          BG Kaldır
                        </button>
                      )}
                      <button onClick={() => removeUploadedImage(img.id)} className="rounded-lg bg-red-500/80 p-1.5 text-white hover:bg-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {/* Touch actions — mobile */}
                    <div className="flex gap-1 p-1.5 md:hidden">
                      <button onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)} className="flex-1 rounded-lg bg-gray-900 py-1.5 text-[11px] font-semibold text-white">
                        Ekle
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
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeSource === 'qr' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-100 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-400">QR Kod üreteci yakında geliyor</p>
        </div>
      )}
    </div>
  );
}
