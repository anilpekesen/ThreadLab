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
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Upload zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-2xl p-6 text-center cursor-pointer transition-all"
      >
        <div className="flex justify-center mb-2">
          <Upload className="w-8 h-8 text-gray-300" />
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-0.5">Fotoğraf Yükle</p>
        <p className="text-xs text-gray-400">Sürükle bırak veya tıkla · PNG, JPG, SVG</p>
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
      {uploadedImages.length > 0 && (
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Son Yüklemeler ({uploadedImages.length})
        </p>
      )}
      <div className="flex-1 overflow-y-auto">
        {uploadedImages.length === 0 && (
          <p className="text-center text-gray-400 text-xs mt-4">Henüz görsel yüklenmedi</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {uploadedImages.map((img) => (
            <div key={img.id} className="group relative rounded-xl overflow-hidden bg-gray-100 aspect-square border border-gray-200">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => onAddImage(img.dataUrl)}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  className="flex-1 text-[10px] font-bold bg-blue-500 text-white rounded-lg px-1 py-1 hover:bg-blue-600 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onAddImage(img.dataUrl); }}
                >Ekle</button>
                <button
                  className="flex-1 text-[10px] font-bold bg-white/20 text-white rounded-lg px-1 py-1 hover:bg-white/30 disabled:opacity-40 transition-colors flex items-center justify-center gap-0.5"
                  disabled={isBgRemoving}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const result = await onRemoveBg(img.dataUrl);
                    if (result) onAddImage(result);
                  }}
                  title="Arka planı kaldır (AI)"
                >
                  <Sparkles className="w-3 h-3" />
                  {isBgRemoving ? '...' : 'BG'}
                </button>
                <button
                  className="text-[10px] bg-red-500/80 text-white rounded-lg px-1.5 py-1 hover:bg-red-500 transition-colors flex items-center"
                  onClick={(e) => { e.stopPropagation(); removeUploadedImage(img.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="absolute top-1 left-1 right-1 text-[10px] text-white/80 truncate opacity-0 group-hover:opacity-100 font-medium">
                {img.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
