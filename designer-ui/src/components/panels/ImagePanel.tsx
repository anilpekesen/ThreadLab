import { useRef, useCallback } from 'react';
import { Upload, Trash2, Sparkles } from 'lucide-react';
import { useDesignerStore } from '@/store/designerStore';
import { compressImage, generateId } from '@/utils/compress';
import type { UploadedImage } from '@/types';

interface Props {
  onAddImage: (url: string) => void;
  onRemoveBg: (url: string) => Promise<string>;
}

export default function ImagePanel({ onAddImage, onRemoveBg }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
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
  }, [addUploadedImage]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <div className="flex flex-col gap-5">
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="group cursor-pointer rounded-[28px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center transition-all hover:border-blue-400 hover:bg-blue-50/60"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-white text-blue-600 shadow-sm transition-transform group-hover:scale-105">
          <Upload className="h-8 w-8" />
        </div>
        <p className="text-base font-bold text-slate-800">Görsel sürükleyin veya yüklemek için tıklayın</p>
        <p className="mt-1 text-xs font-black uppercase tracking-[0.22em] text-slate-400">
          PNG, JPG, SVG, WEBP
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">Galeri</p>
          <p className="text-sm font-semibold text-slate-500">
            Son yüklemeler {uploadedImages.length > 0 ? `(${uploadedImages.length})` : ''}
          </p>
        </div>
        {isBgRemoving && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-600">
            AI işleniyor
          </span>
        )}
      </div>

      {uploadedImages.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white text-center text-slate-400">
          <p className="text-sm font-semibold">Henüz görsel yüklenmedi</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {uploadedImages.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"
            >
              <button className="block aspect-square w-full bg-slate-100" onClick={() => onAddImage(img.dataUrl)}>
                <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
              </button>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white transition-colors hover:bg-blue-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddImage(img.dataUrl);
                    }}
                  >
                    Ekle
                  </button>
                  <button
                    className="flex items-center justify-center rounded-xl bg-white/15 px-3 text-white transition-colors hover:bg-white/25 disabled:opacity-40"
                    disabled={isBgRemoving}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const result = await onRemoveBg(img.dataUrl);
                      if (result) onAddImage(result);
                    }}
                    title="Arka planı kaldır"
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                  <button
                    className="flex items-center justify-center rounded-xl bg-red-500/85 px-3 text-white transition-colors hover:bg-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeUploadedImage(img.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 px-3 py-2">
                <p className="truncate text-xs font-semibold text-slate-600">{img.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
