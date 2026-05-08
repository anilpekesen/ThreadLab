import { useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Type } from 'lucide-react';
import { GOOGLE_FONTS } from '@/types';

interface Props {
  onAddText: (text: string, opts: Record<string, unknown>) => void;
}

export default function TextPanel({ onAddText }: Props) {
  const [text, setText] = useState('Yazını Yaz');
  const [font, setFont] = useState('Inter');
  const [size, setSize] = useState(36);
  const [color, setColor] = useState('#111827');
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');

  const handleAdd = () => {
    if (!text.trim()) return;
    onAddText(text, {
      fontFamily: font,
      fontSize: size,
      fill: color,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      underline,
      textAlign: align,
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
        <div className="mb-3 flex items-center gap-2 text-blue-600">
          <Type className="h-5 w-5" />
          <p className="text-[11px] font-black uppercase tracking-[0.22em]">Metin İçeriği</p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="min-h-[132px] w-full resize-none rounded-[24px] border-2 border-transparent bg-white p-4 text-lg font-medium text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-blue-400"
          placeholder="Yazınızı girin..."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Stil</p>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold text-slate-500">Font</label>
              <select
                value={font}
                onChange={(e) => setFont(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-colors focus:border-blue-400"
                style={{ fontFamily: font }}
              >
                {GOOGLE_FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold text-slate-500">Boyut: {size}px</label>
              <input type="range" min={8} max={120} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full" />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-500">Renk</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 w-11 cursor-pointer rounded-2xl border border-slate-200 bg-white"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { label: 'B', title: 'Kalın', active: bold, toggle: () => setBold(!bold), className: 'font-black' },
                { label: 'I', title: 'İtalik', active: italic, toggle: () => setItalic(!italic), className: 'italic' },
                { label: 'U', title: 'Altı Çizili', active: underline, toggle: () => setUnderline(!underline), className: 'underline' },
              ].map(({ label, title, active, toggle, className }) => (
                <button
                  key={label}
                  onClick={toggle}
                  title={title}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-sm transition-colors ${className} ${active ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  {label}
                </button>
              ))}

              <div className="ml-auto flex gap-1 rounded-2xl bg-slate-100 p-1">
                {[
                  { key: 'left' as const, Icon: AlignLeft },
                  { key: 'center' as const, Icon: AlignCenter },
                  { key: 'right' as const, Icon: AlignRight },
                ].map(({ key, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setAlign(key)}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${align === key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Önizleme</p>
          <div
            className="flex min-h-[180px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 text-center break-words"
            style={{
              fontFamily: font,
              fontSize: Math.min(size, 34),
              color,
              fontWeight: bold ? 'bold' : 'normal',
              fontStyle: italic ? 'italic' : 'normal',
              textDecoration: underline ? 'underline' : 'none',
              textAlign: align,
            }}
          >
            {text || '...'}
          </div>

          <button
            onClick={handleAdd}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-[22px] bg-blue-600 px-5 py-4 text-sm font-black text-white transition-colors hover:bg-blue-700"
          >
            <Type className="h-4 w-4" />
            Canvas'a Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
