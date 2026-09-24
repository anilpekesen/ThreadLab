import { useState, useEffect, useCallback } from 'react';
import { fabric } from 'fabric';
import { GOOGLE_FONTS, FILTER_PRESETS } from '@/types';
import type { FilterPreset } from '@/types';
import { applyFilterPreset, applyAdjustments } from '@/utils/filters';
import type { CurvedText, CurvedTextOptions } from '@/utils/curvedText';

const TEXT_TR = {
  selectObject: "Canvas'ta bir nesne seç",
  general: 'Genel',
  opacity: 'Opaklık',
  forward: 'Öne',
  backward: 'Arkaya',
  textStyle: 'Yazı Stili',
  size: 'Boyut',
  color: 'Renk',
  curvedText: 'Kavisli Yazı',
  text: 'Metin',
  arcRadius: 'Yay Yarıçapı',
  position: 'Konum',
  topArc: 'Üst Yay',
  top: 'Üst',
  bottomArc: 'Alt Yay',
  bottom: 'Alt',
  letterSpacing: 'Karakter Aralığı',
  filters: 'Filtreler',
  adjustments: 'Ayarlar',
  brightness: 'Parlaklık',
  contrast: 'Kontrast',
  saturation: 'Doygunluk',
};
const TEXT_EN: typeof TEXT_TR = {
  selectObject: 'Select an object on the canvas',
  general: 'General',
  opacity: 'Opacity',
  forward: 'Forward',
  backward: 'Backward',
  textStyle: 'Text style',
  size: 'Size',
  color: 'Color',
  curvedText: 'Curved text',
  text: 'Text',
  arcRadius: 'Arc radius',
  position: 'Position',
  topArc: 'Top arc',
  top: 'Top',
  bottomArc: 'Bottom arc',
  bottom: 'Bottom',
  letterSpacing: 'Letter spacing',
  filters: 'Filters',
  adjustments: 'Adjustments',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
};
// FILTER_PRESETS etiketleri Türkçe; İngilizce mağazada bunlar gösterilir
const FILTER_LABELS_EN: Record<string, string> = {
  original: 'Original',
  grayscale: 'Grayscale',
  sepia: 'Sepia',
  invert: 'Invert',
};

interface Props {
  selectedObject: fabric.Object | null;
  onChanged: () => void;
  locale?: string;
}

export default function PropertiesPanel({ selectedObject, onChanged, locale }: Props) {
  const isTurkish = !locale || locale.startsWith('tr');
  const L = isTurkish ? TEXT_TR : TEXT_EN;
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterPreset>('original');

  const isText = selectedObject instanceof fabric.IText || selectedObject instanceof fabric.Text || selectedObject instanceof fabric.Textbox;
  const isCurvedText = (selectedObject as { type?: string } | null)?.type === 'curvedText';
  const isImage = selectedObject instanceof fabric.Image;

  useEffect(() => {
    setBrightness(0); setContrast(0); setSaturation(0); setActiveFilter('original');
  }, [selectedObject]);

  const getTextObj = () => selectedObject as fabric.IText;
  const getCurved = () => selectedObject as unknown as CurvedText;

  const setTextProp = useCallback((prop: string, value: unknown) => {
    if (!selectedObject) return;
    (selectedObject as fabric.IText).set(prop as keyof fabric.IText, value as never);
    selectedObject.canvas?.renderAll();
    onChanged();
  }, [selectedObject, onChanged]);

  const setCurvedProp = useCallback((prop: string, value: unknown) => {
    if (!selectedObject) return;
    // applyProps re-measures the arc, so the bounding box follows every change
    // (font family and character spacing change the width just as much as the
    // radius does) and the object is marked dirty for the next render.
    (selectedObject as unknown as CurvedText).applyProps({ [prop]: value } as Partial<CurvedTextOptions>);
    selectedObject.canvas?.requestRenderAll();
    onChanged();
  }, [selectedObject, onChanged]);

  const handleFilterPreset = (id: FilterPreset) => {
    if (!isImage || !selectedObject) return;
    setActiveFilter(id);
    applyFilterPreset(selectedObject as fabric.Image, id);
    applyAdjustments(selectedObject as fabric.Image, brightness, contrast, saturation);
    selectedObject.canvas?.renderAll();
    onChanged();
  };

  const handleAdjust = (type: 'brightness' | 'contrast' | 'saturation', val: number) => {
    if (!isImage || !selectedObject) return;
    const next = { brightness, contrast, saturation, [type]: val };
    setBrightness(next.brightness); setContrast(next.contrast); setSaturation(next.saturation);
    applyAdjustments(selectedObject as fabric.Image, next.brightness, next.contrast, next.saturation);
    selectedObject.canvas?.renderAll();
    onChanged();
  };

  const handleOpacity = (val: number) => {
    if (!selectedObject) return;
    selectedObject.set('opacity', val / 100);
    selectedObject.canvas?.renderAll();
    onChanged();
  };

  const handleLayerUp = () => {
    selectedObject?.canvas?.bringForward(selectedObject);
    selectedObject?.canvas?.renderAll();
    onChanged();
  };

  const handleLayerDown = () => {
    selectedObject?.canvas?.sendBackwards(selectedObject);
    selectedObject?.canvas?.renderAll();
    onChanged();
  };

  if (!selectedObject) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-zinc-600 text-sm gap-2">
        <span className="text-3xl">👆</span>
        <p>{L.selectObject}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pb-4">
      {/* Common: opacity, layer */}
      <Section title={L.general}>
        <Label>{L.opacity}: {Math.round((selectedObject.opacity ?? 1) * 100)}%</Label>
        <input
          type="range" min={0} max={100}
          value={Math.round((selectedObject.opacity ?? 1) * 100)}
          onChange={(e) => handleOpacity(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex gap-2 mt-1">
          <button onClick={handleLayerUp} className="flex-1 btn-sm">↑ {L.forward}</button>
          <button onClick={handleLayerDown} className="flex-1 btn-sm">↓ {L.backward}</button>
        </div>
      </Section>

      {/* Regular text properties */}
      {isText && (
        <>
          <Section title={L.textStyle}>
            <Label>Font</Label>
            <select
              value={(getTextObj().fontFamily) ?? 'Poppins'}
              onChange={(e) => setTextProp('fontFamily', e.target.value)}
              className="w-full bg-zinc-800 border border-border rounded p-1.5 text-sm focus:outline-none focus:border-accent"
            >
              {GOOGLE_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>

            <Label>{L.size}: {getTextObj().fontSize ?? 36}px</Label>
            <input
              type="range" min={8} max={120}
              value={getTextObj().fontSize ?? 36}
              onChange={(e) => setTextProp('fontSize', Number(e.target.value))}
              className="w-full"
            />

            <div className="flex gap-2 items-center">
              <Label>{L.color}</Label>
              <input
                type="color"
                value={(getTextObj().fill as string) ?? '#ffffff'}
                onChange={(e) => setTextProp('fill', e.target.value)}
                className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent"
              />
            </div>

            <div className="flex gap-1 mt-1">
              <button
                onClick={() => setTextProp('fontWeight', getTextObj().fontWeight === 'bold' ? 'normal' : 'bold')}
                className={`flex-1 btn-sm font-bold ${getTextObj().fontWeight === 'bold' ? 'bg-accent' : ''}`}
              >B</button>
              <button
                onClick={() => setTextProp('fontStyle', getTextObj().fontStyle === 'italic' ? 'normal' : 'italic')}
                className={`flex-1 btn-sm italic ${getTextObj().fontStyle === 'italic' ? 'bg-accent' : ''}`}
              >I</button>
              <button
                onClick={() => setTextProp('underline', !getTextObj().underline)}
                className={`flex-1 btn-sm underline ${getTextObj().underline ? 'bg-accent' : ''}`}
              >U</button>
            </div>
          </Section>
        </>
      )}

      {/* Curved text properties */}
      {isCurvedText && (
        <>
          <Section title={L.curvedText}>
            <Label>{L.text}</Label>
            <input
              type="text"
              value={getCurved().text}
              onChange={(e) => setCurvedProp('text', e.target.value)}
              className="w-full bg-zinc-800 border border-border rounded p-1.5 text-sm focus:outline-none focus:border-accent"
            />

            <Label>{L.arcRadius}: {getCurved().radius}px</Label>
            <input
              type="range" min={40} max={260}
              value={getCurved().radius}
              onChange={(e) => setCurvedProp('radius', Number(e.target.value))}
              className="w-full"
            />

            <Label>{L.position}</Label>
            <div className="flex gap-1">
              <button
                onClick={() => setCurvedProp('reverse', false)}
                className={`flex-1 btn-sm ${!getCurved().reverse ? 'bg-accent' : ''}`}
                title={L.topArc}
              >⌒ {L.top}</button>
              <button
                onClick={() => setCurvedProp('reverse', true)}
                className={`flex-1 btn-sm ${getCurved().reverse ? 'bg-accent' : ''}`}
                title={L.bottomArc}
              >⌣ {L.bottom}</button>
            </div>
          </Section>

          <Section title={L.textStyle}>
            <Label>Font</Label>
            <select
              value={getCurved().fontFamily ?? 'Inter'}
              onChange={(e) => setCurvedProp('fontFamily', e.target.value)}
              className="w-full bg-zinc-800 border border-border rounded p-1.5 text-sm focus:outline-none focus:border-accent"
            >
              {GOOGLE_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>

            <Label>{L.size}: {getCurved().fontSize ?? 36}px</Label>
            <input
              type="range" min={8} max={80}
              value={getCurved().fontSize ?? 36}
              onChange={(e) => setCurvedProp('fontSize', Number(e.target.value))}
              className="w-full"
            />

            <Label>{L.letterSpacing}: {getCurved().charSpacing ?? 0}px</Label>
            <input
              type="range" min={-5} max={30}
              value={getCurved().charSpacing ?? 0}
              onChange={(e) => setCurvedProp('charSpacing', Number(e.target.value))}
              className="w-full"
            />

            <div className="flex gap-2 items-center">
              <Label>{L.color}</Label>
              <input
                type="color"
                value={getCurved().fill ?? '#111827'}
                onChange={(e) => setCurvedProp('fill', e.target.value)}
                className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent"
              />
            </div>

            <div className="flex gap-1 mt-1">
              <button
                onClick={() => setCurvedProp('fontWeight', getCurved().fontWeight === 'bold' ? 'normal' : 'bold')}
                className={`flex-1 btn-sm font-bold ${getCurved().fontWeight === 'bold' ? 'bg-accent' : ''}`}
              >B</button>
              <button
                onClick={() => setCurvedProp('fontStyle', getCurved().fontStyle === 'italic' ? 'normal' : 'italic')}
                className={`flex-1 btn-sm italic ${getCurved().fontStyle === 'italic' ? 'bg-accent' : ''}`}
              >I</button>
            </div>
          </Section>
        </>
      )}

      {/* Image filters */}
      {isImage && (
        <>
          <Section title={L.filters}>
            <div className="grid grid-cols-2 gap-1">
              {FILTER_PRESETS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFilterPreset(f.id as FilterPreset)}
                  className={`text-xs py-1.5 rounded border transition-colors ${activeFilter === f.id ? 'bg-accent border-accent' : 'bg-zinc-800 border-border hover:bg-zinc-700'}`}
                >{isTurkish ? f.label : (FILTER_LABELS_EN[f.id] ?? f.label)}</button>
              ))}
            </div>
          </Section>

          <Section title={L.adjustments}>
            {([
              { label: L.brightness, key: 'brightness' as const, val: brightness },
              { label: L.contrast, key: 'contrast' as const, val: contrast },
              { label: L.saturation, key: 'saturation' as const, val: saturation },
            ]).map(({ label, key, val }) => (
              <div key={key}>
                <Label>{label}: {val > 0 ? '+' : ''}{val}</Label>
                <input
                  type="range" min={-100} max={100} value={val}
                  onChange={(e) => handleAdjust(key, Number(e.target.value))}
                  className="w-full"
                />
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide mb-2">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-zinc-400">{children}</p>;
}
