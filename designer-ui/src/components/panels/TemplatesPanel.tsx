import { useState } from 'react';
import { fabric } from 'fabric';
import {
  CLIPART_ITEMS,
  CLIPART_CATEGORIES,
  type ClipArtCategory,
} from '@/data/clipartData';

interface Template {
  id: string;
  label: string;
  build: (cv: fabric.Canvas) => void;
}

const TEXT_TEMPLATES: Template[] = [
  {
    id: 'bold-text',
    label: 'Kalın Yazı',
    build: (cv) => {
      const txt = new fabric.IText('100%\nORİJİNAL', {
        left: cv.width! / 2,
        top: cv.height! / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Impact',
        fontSize: 52,
        fill: '#ffffff',
        textAlign: 'center',
        lineHeight: 1.1,
      });
      cv.add(txt);
      cv.setActiveObject(txt);
    },
  },
  {
    id: 'limited',
    label: 'Limited Edition',
    build: (cv) => {
      const rect = new fabric.Rect({
        left: cv.width! / 2,
        top: cv.height! / 2,
        originX: 'center',
        originY: 'center',
        width: cv.width! - 40,
        height: 60,
        fill: '#111827',
        rx: 4,
      });
      const txt = new fabric.IText('LIMITED EDITION', {
        left: cv.width! / 2,
        top: cv.height! / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Bebas Neue',
        fontSize: 26,
        fill: '#ffffff',
        charSpacing: 120,
      });
      cv.add(rect, txt);
      cv.setActiveObject(txt);
    },
  },
  {
    id: 'circle-text',
    label: 'Daire + Yazı',
    build: (cv) => {
      const cx = cv.width! / 2;
      const cy = cv.height! / 2;
      const circle = new fabric.Circle({
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        radius: 80,
        fill: 'transparent',
        stroke: '#2563eb',
        strokeWidth: 3,
      });
      const txt = new fabric.IText('Benim\nTasarımım', {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Poppins',
        fontSize: 24,
        fill: '#0f172a',
        textAlign: 'center',
      });
      cv.add(circle, txt);
      cv.setActiveObject(txt);
    },
  },
  {
    id: 'no-fear',
    label: 'No Fear',
    build: (cv) => {
      const txt = new fabric.IText('NO\nFEAR', {
        left: cv.width! / 2,
        top: cv.height! / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Anton',
        fontSize: 64,
        fill: '#dc2626',
        textAlign: 'center',
        lineHeight: 0.9,
      });
      cv.add(txt);
      cv.setActiveObject(txt);
    },
  },
  {
    id: 'badge',
    label: 'Rozet',
    build: (cv) => {
      const cx = cv.width! / 2;
      const cy = cv.height! / 2;
      const outer = new fabric.Circle({
        left: cx, top: cy, originX: 'center', originY: 'center',
        radius: 90, fill: '#1e3a8a',
      });
      const inner = new fabric.Circle({
        left: cx, top: cy, originX: 'center', originY: 'center',
        radius: 75, fill: 'transparent', stroke: '#facc15', strokeWidth: 2,
      });
      const top = new fabric.IText('EST.', {
        left: cx, top: cy - 30, originX: 'center', originY: 'center',
        fontFamily: 'Oswald', fontSize: 16, fill: '#facc15', charSpacing: 200,
      });
      const mid = new fabric.IText('2024', {
        left: cx, top: cy + 5, originX: 'center', originY: 'center',
        fontFamily: 'Anton', fontSize: 40, fill: '#ffffff',
      });
      cv.add(outer, inner, top, mid);
    },
  },
  {
    id: 'grunge',
    label: 'Grunge',
    build: (cv) => {
      const txt = new fabric.IText('BORN\nTO BE\nWILD', {
        left: cv.width! / 2,
        top: cv.height! / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Rock Salt',
        fontSize: 28,
        fill: '#f97316',
        textAlign: 'center',
        lineHeight: 1.2,
      });
      cv.add(txt);
      cv.setActiveObject(txt);
    },
  },
];

interface Props {
  onApply: (tpl: Template) => void;
  onAddImage: (url: string) => void;
}

export default function TemplatesPanel({ onApply, onAddImage }: Props) {
  const [clipartCategory, setClipArtCategory] = useState<ClipArtCategory>('all');

  const filteredClipart =
    clipartCategory === 'all'
      ? CLIPART_ITEMS
      : CLIPART_ITEMS.filter((c) => c.category === clipartCategory);

  return (
    <div className="space-y-8">

      {/* ── Clipart Galerisi ── */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">Hazır Clipart</p>
          <p className="text-sm font-semibold text-slate-500">Bir görsele tıklayarak tuvale ekleyin.</p>
        </div>

        {/* Kategori filtreleri */}
        <div className="flex flex-wrap gap-2">
          {CLIPART_CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setClipArtCategory(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                clipartCategory === id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Clipart grid */}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-5">
          {filteredClipart.map((item) => (
            <button
              key={item.id}
              onClick={() => onAddImage(item.svg)}
              title={item.name}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-gray-200 bg-white p-2 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-md"
            >
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gray-50 p-1">
                <img
                  src={item.svg}
                  alt={item.name}
                  className="h-full w-full object-contain transition-transform group-hover:scale-110"
                  draggable={false}
                />
              </div>
              <span className="w-full truncate text-[10px] font-bold text-gray-600">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ayraç */}
      <div className="border-t border-gray-100" />

      {/* ── Yazı Şablonları ── */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">Yazı Şablonları</p>
          <p className="text-sm font-semibold text-slate-500">Bir şablona tıklayıp doğrudan tuvale ekleyin.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TEXT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onApply(tpl)}
              className="rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/40"
            >
              <div className="mb-3 rounded-[18px] bg-slate-100 px-3 py-6 text-center text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                Şablon
              </div>
              <p className="text-base font-bold text-slate-800">{tpl.label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Tuvale eklemek için tıkla</p>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

export type { Template };
