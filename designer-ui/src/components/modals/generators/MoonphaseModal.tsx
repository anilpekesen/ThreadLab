import { useState } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';
import { garmentWarning, inkVisible, pickForGarment } from './garment';

interface Option { id: string; label: string; labelEn?: string }

/** Sunucunun publicAssets çıktısı (app/lib/generators/moonphase/index.server.ts) */
interface MoonphaseAssets {
  layouts: Option[];
  styles: Option[];
  fonts: Option[];
  inks: Array<Option & { hex: string }>;
  titleEnabled: boolean;
  titleMax: number;
  titlePlaceholder: string;
  lineEnabled: boolean;
  lineMax: number;
  linePlaceholder: string;
  labelMax: number;
  trioLabels: string[];
  yearMin: number;
  yearMax: number;
}

/** Stil sırası ürün rengine göre: koyu üründe ışık mürekkep, açık üründe gölge mürekkep */
const STYLE_ORDER_DARK = ['ink', 'shaded', 'shadow'];
const STYLE_ORDER_LIGHT = ['shadow', 'ink', 'shaded'];

/**
 * Ay evresi penceresi. Müşteri tarihi (üç özel günde üç tarih ve etiket),
 * başlığı ve isimleri girer; o gecenin gerçek ay evresi sunucuda hesaplanıp
 * çizilir.
 */
export default function MoonphaseModal({ assets: raw, isTurkish, garment, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as MoonphaseAssets & { templateName: string };
  const f = initial?.fields ?? {};
  const prev = initial?.choices;
  // Önceki seçim şablonda artık kapalıysa ilk izinli değere dönülür
  const pick = (list: Option[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';

  const [layout, setLayout] = useState(() => pick(assets.layouts, prev?.layout));
  const [style, setStyle] = useState(() => {
    if (typeof prev?.style === 'string' && assets.styles.some((s) => s.id === prev.style)) return prev.style;
    if (!garment) return assets.styles[0]?.id ?? '';
    const order = garment.dark ? STYLE_ORDER_DARK : STYLE_ORDER_LIGHT;
    return order.find((id) => assets.styles.some((s) => s.id === id)) ?? assets.styles[0]?.id ?? '';
  });
  const [font, setFont] = useState(() => pick(assets.fonts, prev?.font));
  const [ink, setInk] = useState(() => pickForGarment(assets.inks, prev?.ink, (o) => o.hex, garment));
  const [title, setTitle] = useState(f.title ?? '');
  const [line, setLine] = useState(f.line ?? '');
  const [date, setDate] = useState(f.date ?? f.date_1 ?? '');
  const [trio, setTrio] = useState(() => [1, 2, 3].map((i) => ({
    date: f[`date_${i}`] ?? '',
    label: f[`label_${i}`] ?? assets.trioLabels[i - 1] ?? '',
  })));
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = isTurkish
    ? { layout: 'Düzen', date: 'Tarih', dateHint: 'O gecenin ayı çizilir', title: 'Başlık (isteğe bağlı)', line: 'İsimler ya da kısa not (isteğe bağlı)',
        days: 'Özel günler', label: 'Etiket', style: 'Ay stili', font: 'Yazı tipi', ink: 'Renk',
        noDate: 'Lütfen bir tarih seçin', noDates: 'Lütfen üç tarihi de seçin', range: 'Tarih şu aralıkta olmalı:',
        shadedLight: 'Gerçekçi ay açık renkli üründe soluk görünür; koyu ürün ya da tek renk bir stil daha iyi sonuç verir.' }
    : { layout: 'Layout', date: 'Date', dateHint: "That night's moon is drawn", title: 'Title (optional)', line: 'Names or a short note (optional)',
        days: 'Special days', label: 'Label', style: 'Moon style', font: 'Font', ink: 'Color',
        noDate: 'Please pick a date', noDates: 'Please pick all three dates', range: 'Date must be between',
        shadedLight: 'The realistic moon looks faint on light products; a dark product or a single-ink style works better.' };

  const label = (o: Option) => (isTurkish ? o.label : o.labelEn ?? o.label);
  const isTrio = layout === 'trio';
  const minDate = `${assets.yearMin}-01-01`;
  const maxDate = `${assets.yearMax}-12-31`;
  const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= minDate && d <= maxDate;
  const ready = isTrio ? trio.every((d) => d.date) : !!date;

  const render = async () => {
    const dates = isTrio ? trio.map((d) => d.date) : [date];
    if (dates.some((d) => !d)) { setError(isTrio ? t.noDates : t.noDate); return; }
    if (dates.some((d) => !dateOk(d))) { setError(`${t.range} ${assets.yearMin}–${assets.yearMax}`); return; }
    setBusy(true);
    setError('');
    try {
      const fields: Record<string, string> = {};
      if (assets.titleEnabled) fields.title = title.trim();
      if (assets.lineEnabled) fields.line = line.trim();
      if (isTrio) {
        // Etiket boş da gönderilir: müşteri sildiyse şablonun varsayılanı basılmasın
        trio.forEach((d, i) => {
          fields[`date_${i + 1}`] = d.date;
          fields[`label_${i + 1}`] = d.label.trim();
        });
      } else {
        fields.date = date;
      }
      const result = await onRender(fields, { layout, style, font, ink });
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pills = (list: Option[], value: string, set: (id: string) => void, swatch?: (o: Option) => string) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((o) => (
        <button key={o.id} type="button" onClick={() => set(o.id)} className={pillClass(value === o.id)} aria-pressed={value === o.id}>
          {swatch && <span className="h-3 w-3 rounded-sm border border-gray-300" style={{ background: swatch(o) }} />}
          {label(o)}
        </button>
      ))}
    </div>
  );

  const counter = (s: string, max: number) => `${Array.from(s).length}/${max}`;

  return (
    <GeneratorModalShell
      title={assets.templateName}
      isTurkish={isTurkish}
      preview={preview}
      previewAlt={assets.templateName}
      busy={busy}
      error={error}
      canMake={ready}
      onMake={render}
      onEdit={() => setPreview('')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(preview)}
      backdrop={garment?.hex}
    >
      {assets.layouts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.layout} />
          {pills(assets.layouts, layout, setLayout)}
        </div>
      )}

      {isTrio ? (
        <div className="flex flex-col gap-2">
          <FieldLabel label={t.days} />
          {trio.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={d.label}
                maxLength={assets.labelMax}
                placeholder={assets.trioLabels[i] || `${t.label} ${i + 1}`}
                aria-label={`${t.label} ${i + 1}`}
                onChange={(e) => setTrio((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-gray-400"
              />
              <input
                type="date"
                value={d.date}
                min={minDate}
                max={maxDate}
                aria-label={`${t.date} ${i + 1}`}
                onChange={(e) => setTrio((list) => list.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                className={`w-[9.5rem] shrink-0 rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-gray-400 ${d.date ? 'text-gray-900' : 'text-gray-400'}`}
              />
            </div>
          ))}
        </div>
      ) : (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.date} right={t.dateHint} />
          <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
      )}

      {assets.titleEnabled && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.title} right={counter(title, assets.titleMax)} />
          <input type="text" value={title} maxLength={assets.titleMax} placeholder={assets.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
      )}

      {assets.lineEnabled && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.line} right={counter(line, assets.lineMax)} />
          <input type="text" value={line} maxLength={assets.lineMax} placeholder={assets.linePlaceholder}
            onChange={(e) => setLine(e.target.value)} className={inputClass} />
        </label>
      )}

      {assets.styles.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.style} />
          {pills(assets.styles, style, setStyle)}
          {style === 'shaded' && garment && !garment.dark && (
            <span className="text-[11px] font-medium text-amber-600">{t.shadedLight}</span>
          )}
        </div>
      )}

      {assets.fonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.font} />
          {pills(assets.fonts, font, setFont)}
        </div>
      )}

      {assets.inks.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.ink} />
          {pills(assets.inks, ink, setInk, (o) => (o as Option & { hex: string }).hex)}
          {!inkVisible(assets.inks.find((o) => o.id === ink)?.hex, garment) && (
            <span className="text-[11px] font-medium text-amber-600">{garmentWarning(isTurkish, garment)}</span>
          )}
        </div>
      )}
    </GeneratorModalShell>
  );
}
