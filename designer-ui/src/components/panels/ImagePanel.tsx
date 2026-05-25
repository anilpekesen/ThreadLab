import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
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
  const [consentAccepted, setConsentAccepted] = useState(() => {
    try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(CONSENT_KEY, consentAccepted ? '1' : '0'); } catch { /* ignore */ }
  }, [consentAccepted]);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const { uploadedImages, addUploadedImage, removeUploadedImage, isBgRemoving } = useDesignerStore();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    let firstUrl = '';
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await compressImage(file, 1800);
      // Upload to server so canvas JSON stores an HTTPS URL, not a data URL
      let serverUrl: string | undefined;
      try {
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const form = new FormData();
        form.append('image', blob, 'user-upload.png');
        form.append('side', 'user-upload');
        const res = await fetch('/apps/tshirt-designer/upload', { method: 'POST', body: form });
        if (res.ok) serverUrl = ((await res.json()) as { url?: string }).url;
      } catch { /* fallback: canvas will use data URL */ }
      const img: UploadedImage = {
        id: generateId(),
        dataUrl,
        serverUrl,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
        addedAt: Date.now(),
      };
      addUploadedImage(img);
      if (!firstUrl) firstUrl = serverUrl ?? dataUrl;
    }
    if (fileRef.current) fileRef.current.value = '';
    if (!firstUrl) return;
    if (canRemoveBg) {
      setPendingUrl(firstUrl);
    } else {
      onAddImage(firstUrl);
    }
  }, [addUploadedImage, onAddImage, canRemoveBg]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);


  const handleAddFromUrl = useCallback(async () => {
    const value = imageUrl.trim();
    if (!value) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      const res = await fetch('/apps/tshirt-designer/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setUrlError(data.error ?? 'Resim yüklenemedi');
        return;
      }
      setImageUrl('');
      if (canRemoveBg) {
        setPendingUrl(data.url);
      } else {
        onAddImage(data.url);
      }
    } catch {
      setUrlError('Bağlantı hatası, tekrar deneyin');
    } finally {
      setUrlLoading(false);
    }
  }, [imageUrl, canRemoveBg, onAddImage]);

  return (
    <div className="flex flex-col gap-6">
      {/* Upload tab */}
      {activeSource === 'upload' && (
        <>
          {/* Copyright consent — must be accepted before any upload action */}
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-all ${consentAccepted ? 'border-green-300 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-green-600"
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-gray-800">
                Bu görselin kullanım ve baskı hakkına sahibim ya da gerekli izinleri aldım.
              </span>
              <span className="text-xs text-gray-500">
                Telif hakkı ihlali bildirimi halinde ilgili sipariş veya ürün durdurulabilir.{' '}
                <a href="https://app.printlabapp.com/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  Kullanım Koşulları
                </a>
              </span>
            </div>
          </label>

          <div
            onDrop={consentAccepted ? onDrop : undefined}
            onDragOver={consentAccepted ? (e) => e.preventDefault() : undefined}
            onClick={() => consentAccepted && fileRef.current?.click()}
            className={`group relative rounded-[24px] border-2 border-dashed px-6 py-8 transition-all ${consentAccepted ? 'cursor-pointer border-gray-200 hover:border-blue-400 hover:bg-blue-50/40' : 'cursor-not-allowed border-gray-100 opacity-50'}`}
          >
            <div className="flex cursor-pointer flex-col items-center justify-center gap-4 text-center">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="rounded-2xl bg-blue-50 p-4 text-blue-600 transition-transform group-hover:scale-105">
                <Upload className="h-8 w-8" />
              </div>
              <div>
                <p className="font-bold text-gray-700">Görsel sürükleyin veya yüklemek için tıklayın</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-gray-400">PNG, JPG, SVG, WebP</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={imageUrl}
                  disabled={!consentAccepted}
                  onChange={(e) => { setImageUrl(e.target.value); setUrlError(''); }}
                  onKeyDown={async (e) => { if (e.key === 'Enter' && consentAccepted) await handleAddFromUrl(); }}
                  placeholder="Veya görsel URL yapıştırın..."
                  className="w-full rounded-2xl border border-transparent bg-gray-50 py-3.5 pl-11 pr-4 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white disabled:opacity-50"
                />
              </div>
              <button
                disabled={urlLoading || !consentAccepted}
                onClick={handleAddFromUrl}
                className="flex items-center gap-1.5 rounded-2xl bg-gray-100 px-6 py-3.5 font-bold text-gray-400 transition-colors hover:bg-gray-200 disabled:opacity-50"
              >
                {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ekle'}
              </button>
            </div>
            {urlError && <p className="px-1 text-xs text-red-500">{urlError}</p>}
          </div>

          {pendingUrl && canRemoveBg && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-bold text-blue-700">Arka planı temizleyelim mi?</p>
              </div>
              <img
                src={pendingUrl}
                alt="Önizleme"
                className="mx-auto mb-3 max-h-28 rounded-xl object-contain"
              />
              <div className="flex gap-2">
                <button
                  disabled={isBgRemoving}
                  onClick={async () => {
                    const url = pendingUrl;
                    setPendingUrl(null);
                    const result = await onRemoveBg(url);
                    const finalUrl = result || url;
                    if (result) {
                      addUploadedImage({
                        id: generateId(),
                        dataUrl: result,
                        serverUrl: result,
                        name: 'Temizlenmiş resim',
                        addedAt: Date.now(),
                      });
                    }
                    onAddImage(finalUrl);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Evet, temizle
                </button>
                <button
                  disabled={isBgRemoving}
                  onClick={() => {
                    const url = pendingUrl;
                    setPendingUrl(null);
                    onAddImage(url);
                  }}
                  className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
                >
                  Olduğu gibi ekle
                </button>
              </div>
            </div>
          )}

          {isBgRemoving && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-600">
              Arka plan temizleniyor...
            </div>
          )}

          {uploadedImages.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Son Yüklemeler</p>

              {/* Mobile: liste görünümü */}
              <div className="flex flex-col gap-2 md:hidden">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-2">
                    <img src={img.dataUrl} alt={img.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{img.name || 'Görsel'}</span>
                    <div className="flex shrink-0 gap-2">
                      {canRemoveBg && (
                        <button
                          disabled={isBgRemoving}
                          onClick={async () => {
                            const result = await onRemoveBg(img.serverUrl ?? img.dataUrl);
                            if (result) {
                              addUploadedImage({ id: generateId(), dataUrl: result, serverUrl: result, name: `${img.name} (temizlenmiş)`, addedAt: Date.now() });
                              onAddImage(result);
                            }
                          }}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 disabled:opacity-40"
                          title="Arka planı kaldır"
                        >
                          <Sparkles className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => removeUploadedImage(img.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)}
                        className="flex h-10 items-center rounded-xl bg-blue-500 px-4 text-sm font-bold text-white"
                      >
                        Ekle
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: grid görünümü */}
              <div className="hidden grid-cols-4 gap-3 md:grid">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                    <div className="aspect-square w-full">
                      <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/70 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="flex-1 rounded-lg bg-blue-500 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-blue-600"
                        onClick={() => onAddImage(img.serverUrl ?? img.dataUrl)}
                      >
                        Ekle
                      </button>
                      {canRemoveBg && (
                        <button
                          className="flex items-center justify-center rounded-lg bg-white/20 px-2 py-1 text-white transition-colors hover:bg-white/30 disabled:opacity-40"
                          disabled={isBgRemoving}
                          onClick={async () => {
                            const result = await onRemoveBg(img.serverUrl ?? img.dataUrl);
                            if (result) {
                              addUploadedImage({ id: generateId(), dataUrl: result, serverUrl: result, name: `${img.name} (temizlenmiş)`, addedAt: Date.now() });
                              onAddImage(result);
                            }
                          }}
                          title="Arka planı kaldır"
                        >
                          <Sparkles className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        className="flex items-center rounded-lg bg-red-500/80 px-2 py-1 text-white transition-colors hover:bg-red-500"
                        onClick={() => removeUploadedImage(img.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* QR Kod tab — placeholder */}
      {activeSource === 'qr' && (
        <div className="flex flex-col items-center gap-3 rounded-[24px] border-2 border-dashed border-gray-200 px-6 py-12 text-center text-gray-400">
          <p className="text-sm font-bold">QR Kod üreteci yakında</p>
        </div>
      )}

    </div>
  );
}
