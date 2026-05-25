import { Plus, RefreshCw, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isEditing?: boolean;
  onClose?: () => void;
}

export default function TextPanel({ value, onChange, onSubmit, isEditing = false, onClose }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-gray-800">{isEditing ? 'Yazıyı Düzenle' : 'Yazı Ekle'}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-full bg-gray-100 py-2 pl-3 pr-4 text-sm font-bold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-95"
          >
            <X className="h-4 w-4" />
            Kapat
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Yazınızı girin..."
        className="h-32 w-full resize-none rounded-[24px] border-2 border-transparent bg-gray-50 p-4 text-lg font-medium outline-none transition-all focus:border-blue-400 focus:bg-white"
      />

      <button
        onClick={onSubmit}
        disabled={!value.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-blue-100 py-5 text-lg font-black text-blue-600 transition-all hover:bg-blue-200 disabled:opacity-50 disabled:hover:bg-blue-100"
      >
        {isEditing ? <RefreshCw className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        <span>{isEditing ? 'Yazıyı Güncelle' : '+ Yazı Ekle'}</span>
      </button>
    </div>
  );
}
