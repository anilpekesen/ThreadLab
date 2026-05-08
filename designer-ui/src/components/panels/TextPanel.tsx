import { useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Plus } from 'lucide-react';
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
    <div className="space-y-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Yazınızı girin..."
        className="h-32 w-full resize-none rounded-[24px] border-2 border-transparent bg-gray-50 p-4 text-lg font-medium outline-none transition-all focus:border-blue-400 focus:bg-white"
      />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-[24px] border border-gray-100 bg-white p-4">
          <div>
            <label className="mb-2 block text-xs font-bold text-gray-500">Font</label>
            <select
              value={font}
              onChange={(e) => setFont(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none focus:border-blue-400"
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
            <label className="mb-2 block text-xs font-bold text-gray-500">Boyut: {size}px</label>
            <input type="range" min={8} max={120} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full" />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-gray-500">Renk</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-10 rounded-xl border border-gray-200 bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: 'B', active: bold, toggle: () => setBold(!bold), className: 'font-black' },
              { label: 'I', active: italic, toggle: () => setItalic(!italic), className: 'italic' },
              { label: 'U', active: underline, toggle: () => setUnderline(!underline), className: 'underline' },
            ].map(({ label, active, toggle, className }) => (
              <button
                key={label}
                onClick={toggle}
                className={`h-10 w-10 rounded-xl border text-sm transition-colors ${className} ${active ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              {[
                { key: 'left' as const, Icon: AlignLeft },
                { key: 'center' as const, Icon: AlignCenter },
                { key: 'right' as const, Icon: AlignRight },
              ].map(({ key, Icon }) => (
                <button
                  key={key}
                  onClick={() => setAlign(key)}
                  className={`h-10 w-10 rounded-xl border transition-colors ${align === key ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  <Icon className="mx-auto h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-gray-100 bg-white p-4">
          <p className="mb-3 text-sm font-bold text-gray-800">Yazı Ekle</p>
          <div
            className="flex min-h-[140px] items-center justify-center rounded-[24px] border border-gray-100 bg-gray-50 px-4 text-center"
            style={{
              fontFamily: font,
              fontSize: Math.min(size, 30),
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
            disabled={!text.trim()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[24px] bg-blue-100 py-5 text-lg font-black text-blue-600 transition-all hover:bg-blue-200 disabled:opacity-50 disabled:hover:bg-blue-100"
          >
            <Plus className="h-6 w-6" />
            <span>+ Yazı Ekle</span>
          </button>
        </div>
      </div>
    </div>
  );
}
