import { useState, useEffect, useCallback } from 'react';
import { fabric } from 'fabric';
import { GOOGLE_FONTS, FILTER_PRESETS } from '@/types';
import type { FilterPreset } from '@/types';
import { applyFilterPreset, applyAdjustments } from '@/utils/filters';
import type { CurvedText } from '@/utils/curvedText';

interface Props {
  selectedObject: fabric.Object | null;
  onChanged: () => void;
}

export default function PropertiesPanel({ selectedObject, onChanged }: Props) {
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
    (selectedObject as unknown as Record<string, unknown>)[prop] = value;
    // Refresh bounding box whenever text, radius or fontSize changes
    if (prop === 'radius' || prop === 'fontSize' || prop === 'text') {
      (selectedObject as unknown as CurvedText)._refreshBounds();
      selectedObject.setCoords();
    }
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
        <p>Canvas'ta bir nesne seç</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto pb-4">
      {/* Common: opacity, layer */}
      <Section title="Genel">
        <Label>Opaklık: {Math.round((selectedObject.opacity ?? 1) * 100)}%</Label>
        <input
          type="range" min={0} max={100}
          value={Math.round((selectedObject.opacity ?? 1) * 100)}
          onChange={(e) => handleOpacity(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex gap-2 mt-1">
          <button onClick={handleLayerUp} className="flex-1 btn-sm">↑ Öne</button>
          <button onClick={handleLayerDown} className="flex-1 btn-sm">↓ Arkaya</button>
        </div>
      </Section>

      {/* Regular text properties */}
      {isText && (
        <>
          <Section title="Yazı Stili">
            <Label>Font</Label>
            <select
              value={(getTextObj().fontFamily) ?? 'Poppins'}
              onChange={(e) => setTextProp('fontFamily', e.target.value)}
              className="w-full bg-zinc-800 border border-border rounded p-1.5 text-sm focus:outline-none focus:border-accent"
            >
              {GOOGLE_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>

            <Label>Boyut: {getTextObj().fontSize ?? 36}px</Label>
            <input
              type="range" min={8} max={120}
              value={getTextObj().fontSize ?? 36}
              onChange={(e) => setTextProp('fontSize', Number(e.target.value))}
              className="w-full"
            />

            <div className="flex gap-2 items-center">
              <Label>Renk</Label>
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
          <Section title="Kavisli Yazı">
            <Label>Metin</Label>
            <input
              type="text"
              value={getCurved().text}
              onChange={(e) => setCurvedProp('text', e.target.value)}
              className="w-full bg-zinc-800 border border-border rounded p-1.5 text-sm focus:outline-none focus:border-accent"
            />

            <Label>Yay Yarıçapı: {getCurved().radius}px</Label>
            <input
              type="range" min={40} max={260}
              value={getCurved().radius}
              onChange={(e) => setCurvedProp('radius', Number(e.target.value))}
              className="w-full"
            />

            <Label>Konum</Label>
            <div className="flex gap-1">
              <button
                onClick={() => setCurvedProp('reverse', false)}
                className={`flex-1 btn-sm ${!getCurved().reverse ? 'bg-accent' : ''}`}
                title="Üst Yay"
              >⌒ Üst</button>
              <button
                onClick={() => setCurvedProp('reverse', true)}
                className={`flex-1 btn-sm ${getCurved().reverse ? 'bg-accent' : ''}`}
                title="Alt Yay"
              >⌣ Alt</button>
            </div>
          </Section>

          <Section title="Yazı Stili">
            <Label>Font</Label>
            <select
              value={getCurved().fontFamily ?? 'Inter'}
              onChange={(e) => setCurvedProp('fontFamily', e.target.value)}
              className="w-full bg-zinc-800 border border-border rounded p-1.5 text-sm focus:outline-none focus:border-accent"
            >
              {GOOGLE_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>

            <Label>Boyut: {getCurved().fontSize ?? 36}px</Label>
            <input
              type="range" min={8} max={80}
              value={getCurved().fontSize ?? 36}
              onChange={(e) => setCurvedProp('fontSize', Number(e.target.value))}
              className="w-full"
            />

            <Label>Karakter Aralığı: {getCurved().charSpacing ?? 0}px</Label>
            <input
              type="range" min={-5} max={30}
              value={getCurved().charSpacing ?? 0}
              onChange={(e) => setCurvedProp('charSpacing', Number(e.target.value))}
              className="w-full"
            />

            <div className="flex gap-2 items-center">
              <Label>Renk</Label>
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
          <Section title="Filtreler">
            <div className="grid grid-cols-2 gap-1">
              {FILTER_PRESETS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFilterPreset(f.id as FilterPreset)}
                  className={`text-xs py-1.5 rounded border transition-colors ${activeFilter === f.id ? 'bg-accent border-accent' : 'bg-zinc-800 border-border hover:bg-zinc-700'}`}
                >{f.label}</button>
              ))}
            </div>
          </Section>

          <Section title="Ayarlar">
            {([
              { label: 'Parlaklık', key: 'brightness' as const, val: brightness },
              { label: 'Kontrast', key: 'contrast' as const, val: contrast },
              { label: 'Doygunluk', key: 'saturation' as const, val: saturation },
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
