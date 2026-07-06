import { Bookmark, Trash2, CloudUpload } from 'lucide-react';
import { useDesignerStore } from '@/store/designerStore';
import { customerLoggedIn } from '@/utils/savedDesignsSync';

interface Props {
  onLoad: (frontJson: string, backJson: string) => void;
}

export default function SavedPanel({ onLoad }: Props) {
  const { savedDesigns, removeSavedDesign } = useDesignerStore();

  if (savedDesigns.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center text-slate-400">
        <Bookmark className="mb-3 h-12 w-12 opacity-25" />
        <p className="text-sm font-semibold text-slate-500">Kayıtlı tasarım yok</p>
        <p className="mt-1 text-xs font-medium text-slate-400">Üstteki kaydet butonu ile tasarımlarını saklayabilirsin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">Arşiv</p>
        <p className="text-sm font-semibold text-slate-500">{savedDesigns.length} kayıtlı tasarım</p>
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-400">
          <CloudUpload className="h-3.5 w-3.5" />
          {customerLoggedIn
            ? 'Tasarımların hesabında saklanıyor — her cihazdan erişebilirsin.'
            : 'Tasarımların bu tarayıcıda saklanıyor. Giriş yaparsan hesabında saklanır.'}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {savedDesigns.map((d) => (
          <div key={d.id} className="flex gap-3 rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm">
            <button
              onClick={() => onLoad(d.frontJson, d.backJson)}
              className="h-24 w-24 shrink-0 overflow-hidden rounded-[20px] bg-slate-100"
            >
              <img src={d.thumbnail} alt={d.name} className="h-full w-full object-cover transition-transform hover:scale-[1.03]" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{d.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {new Date(d.createdAt).toLocaleDateString('tr-TR')}
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => onLoad(d.frontJson, d.backJson)}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition-colors hover:bg-blue-700"
                >
                  Yükle
                </button>
                <button
                  onClick={() => removeSavedDesign(d.id)}
                  className="flex items-center gap-1 rounded-2xl bg-red-50 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-red-500 transition-colors hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Sil
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
