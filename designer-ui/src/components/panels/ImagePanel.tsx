import { useRef, useCallback } from 'react';
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
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      {/* Upload zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-accent transition-colors"
      >
        <div className="text-2xl mb-1">📁</div>
        <p className="text-xs text-zinc-400">Sürükle & Bırak veya tıkla</p>
        <p className="text-xs text-zinc-600 mt-1">PNG, JPG, SVG · Maks 25MB</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Gallery */}
      <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
        Son Yüklemeler ({uploadedImages.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {uploadedImages.length === 0 && (
          <p className="text-center text-zinc-600 text-xs mt-4">Henüz görsel yüklenmedi</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {uploadedImages.map((img) => (
            <div key={img.id} className="group relative rounded-lg overflow-hidden bg-zinc-800 aspect-square">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onAddImage(img.dataUrl)}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  className="flex-1 text-xs bg-accent/80 rounded px-1 py-0.5 hover:bg-accent"
                  onClick={(e) => { e.stopPropagation(); onAddImage(img.dataUrl); }}
                >Ekle</button>
                <button
                  className="flex-1 text-xs bg-zinc-700 rounded px-1 py-0.5 hover:bg-zinc-600 disabled:opacity-40"
                  disabled={isBgRemoving}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const result = await onRemoveBg(img.dataUrl);
                    if (result) onAddImage(result);
                  }}
                  title="Arka planı kaldır (AI)"
                >BG{isBgRemoving ? '⏳' : '✂'}</button>
                <button
                  className="text-xs bg-red-900/60 rounded px-1 py-0.5 hover:bg-red-800"
                  onClick={(e) => { e.stopPropagation(); removeUploadedImage(img.id); }}
                >✕</button>
              </div>
              <p className="absolute top-1 left-1 right-1 text-[10px] text-white/70 truncate opacity-0 group-hover:opacity-100">
                {img.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
