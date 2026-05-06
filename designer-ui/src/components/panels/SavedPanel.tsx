import { useDesignerStore } from '@/store/designerStore';

interface Props {
  onLoad: (frontJson: string, backJson: string) => void;
}

export default function SavedPanel({ onLoad }: Props) {
  const { savedDesigns, removeSavedDesign } = useDesignerStore();

  if (savedDesigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-zinc-600 text-sm gap-2">
        <span className="text-3xl">📋</span>
        <p>Kayıtlı tasarım yok</p>
        <p className="text-xs">Tasarımını kaydetmek için üstteki "Kaydet" butonunu kullan</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500">{savedDesigns.length} kayıtlı tasarım</p>
      {savedDesigns.map((d) => (
        <div key={d.id} className="flex gap-2 bg-zinc-800 border border-border rounded-lg p-2">
          <img
            src={d.thumbnail}
            alt={d.name}
            className="w-14 h-14 object-cover rounded cursor-pointer hover:opacity-80"
            onClick={() => onLoad(d.frontJson, d.backJson)}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{d.name}</p>
            <p className="text-xs text-zinc-500">{new Date(d.createdAt).toLocaleDateString('tr-TR')}</p>
            <div className="flex gap-1 mt-1">
              <button
                onClick={() => onLoad(d.frontJson, d.backJson)}
                className="text-xs bg-accent/80 hover:bg-accent px-2 py-0.5 rounded"
              >Yükle</button>
              <button
                onClick={() => removeSavedDesign(d.id)}
                className="text-xs bg-red-900/60 hover:bg-red-800 px-2 py-0.5 rounded"
              >Sil</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
