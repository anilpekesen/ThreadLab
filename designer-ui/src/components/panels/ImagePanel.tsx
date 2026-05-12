import { useCallback, useRef, useState } from 'react';
import { Link, Sparkles, Trash2, Upload } from 'lucide-react';
import { useDesignerStore } from '@/store/designerStore';
import { compressImage, generateId } from '@/utils/compress';
import type { UploadedImage } from '@/types';

interface Props {
  onAddImage: (url: string) => void;
  onRemoveBg: (url: string) => Promise<string>;
}

export default function ImagePanel({ onAddImage, onRemoveBg }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [activeSource, setActiveSource] = useState<'upload' | 'qr' | 'ai'>('upload');
  const { uploadedImages, addUploadedImage, removeUploadedImage, isBgRemoving } = useDesignerStore();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await compressImage(file, 1800);
      const img: UploadedImage = {
        id: generateId(),
        dataUrl,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 40),
        addedAt: Date.now(),
      };
      addUploadedImage(img);
    }
    if (fileRef.current) fileRef.current.value = '';
  }, [addUploadedImage]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-5 border-b border-gray-100">
        {[
          { id: 'upload' as const, label: 'Yükle' },
          { id: 'qr' as const, label: 'QR Kod' },
          { id: 'ai' as const, label: 'AI Oluştur' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveSource(id)}
            className={`relative pb-3 text-sm font-bold transition-colors ${activeSource === id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {label}
            {activeSource === id && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-blue-600" />}
          </button>
        ))}
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="group relative cursor-pointer rounded-[24px] border-2 border-dashed border-gray-200 px-6 py-8 transition-all hover:border-blue-400 hover:bg-blue-50/40"
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

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Veya görsel URL yapıştırın..."
            className="w-full rounded-2xl border border-transparent bg-gray-50 py-3.5 pl-11 pr-4 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white"
          />
        </div>
        <button
          onClick={() => {
            const value = imageUrl.trim();
            if (!value) return;
            onAddImage(value);
            setImageUrl('');
          }}
          className="rounded-2xl bg-gray-100 px-6 py-3.5 font-bold text-gray-400 transition-colors hover:bg-gray-200"
        >
          Ekle
        </button>
      </div>

      {isBgRemoving && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-amber-600">
          Arka plan temizleniyor...
        </div>
      )}

      {uploadedImages.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Son Yüklemeler</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {uploadedImages.map((img) => (
              <div key={img.id} className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                <button className="block aspect-square w-full" onClick={() => onAddImage(img.dataUrl)}>
                  <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/70 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="flex-1 rounded-lg bg-blue-500 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-blue-600"
                    onClick={() => onAddImage(img.dataUrl)}
                  >
                    Ekle
                  </button>
                  <button
                    className="flex items-center justify-center rounded-lg bg-white/20 px-2 py-1 text-white transition-colors hover:bg-white/30 disabled:opacity-40"
                    disabled={isBgRemoving}
                    onClick={async () => {
                      const result = await onRemoveBg(img.dataUrl);
                      if (result) onAddImage(result);
                    }}
                    title="Arka planı kaldır"
                  >
                    <Sparkles className="h-3 w-3" />
                  </button>
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
    </div>
  );
}
