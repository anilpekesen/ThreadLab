import { useState } from 'react';
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
    <div className="flex flex-col gap-3">
      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-blue-400 text-gray-900 placeholder-gray-400"
        placeholder="Yazını gir..."
      />

      {/* Font selector */}
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Font</label>
        <select
          value={font}
          onChange={(e) => setFont(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:border-blue-400 text-gray-800"
          style={{ fontFamily: font }}
        >
          {GOOGLE_FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </div>

      {/* Size + Color */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Boyut: {size}px</label>
          <input
            type="range" min={8} max={120} value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Renk</label>
          <input
            type="color" value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-9 rounded-lg cursor-pointer border border-gray-200 bg-white"
          />
        </div>
      </div>

      {/* Style buttons */}
      <div className="flex gap-2">
        {[
          { label: 'B', title: 'Kalın', active: bold, toggle: () => setBold(!bold), style: 'font-bold' },
          { label: 'I', title: 'İtalik', active: italic, toggle: () => setItalic(!italic), style: 'italic' },
          { label: 'U', title: 'Altı Çizili', active: underline, toggle: () => setUnderline(!underline), style: 'underline' },
        ].map(({ label, title, active, toggle, style }) => (
          <button
            key={label}
            onClick={toggle}
            title={title}
            className={`w-9 h-9 rounded-xl border text-sm font-bold ${style} transition-colors ${active ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >{label}</button>
        ))}
        <div className="flex gap-1 ml-auto">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAlign(a)}
              className={`w-9 h-9 rounded-xl border text-xs transition-colors ${align === a ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >{a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}</button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div
        className="rounded-xl p-3 bg-gray-50 border border-gray-100 text-center min-h-[60px] flex items-center justify-center break-all"
        style={{ fontFamily: font, fontSize: Math.min(size, 32), color, fontWeight: bold ? 'bold' : 'normal', fontStyle: italic ? 'italic' : 'normal', textDecoration: underline ? 'underline' : 'none', textAlign: align }}
      >
        {text || '…'}
      </div>

      <button
        onClick={handleAdd}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
      >
        + Canvas'a Ekle
      </button>
    </div>
  );
}
