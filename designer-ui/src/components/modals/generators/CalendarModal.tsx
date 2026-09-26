import { useState, type ReactNode } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';
import { garmentWarning, inkVisible, pickForGarment } from './garment';
import { tx } from '../../../i18n';

interface Option { id: string; label: string; labelEn?: string }
interface ColorOption extends Option { hex: string }

interface CalendarAssets {
  layouts: Option[];
  markers: Option[];
  fonts: Option[];
  titleFonts: Option[];
  colors: ColorOption[];
  titleEnabled: boolean;
  titleMaxLength: number;
  titlePlaceholder: string;
  namesEnabled: boolean;
  namesMaxLength: number;
  namesPlaceholder: string;
  yearMin: number;
  yearMax: number;
}

/** İşaret seçeneklerinin yanında küçük simge: müşteri adı okumadan tanısın */
const MARKER_ICON: Record<string, string> = { heart: '♥', circle: '◯', star: '★', dot: '●' };

/**
 * Özel gün takvimi penceresi: tarih (ay ve işaretli gün buradan), isteğe
 * bağlı başlık ve isim satırı, düzen/işaret/yazı tipi/renk seçimleri. Çizim
 * sunucuda yapılır; dönen şeffaf PNG onaylanınca ürüne konur.
 */
export default function CalendarModal({ assets: raw, isTurkish, garment, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as CalendarAssets & { templateName: string };
  // Önceki seçim şablonda artık kapalıysa ilk izinli değere dönülür
  const pick = (list: Option[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prev = initial?.choices;
  const f = initial?.fields;

  const [date, setDate] = useState(() => f?.date ?? '');
  const [title, setTitle] = useState(() => f?.title ?? '');
  const [names, setNames] = useState(() => f?.names ?? '');
  const [layout, setLayout] = useState(() => pick(assets.layouts, prev?.layout));
  const [marker, setMarker] = useState(() => pick(assets.markers, prev?.marker));
  const [font, setFont] = useState(() => pick(assets.fonts, prev?.font));
  const [titleFont, setTitleFont] = useState(() => pick(assets.titleFonts, prev?.titleFont));
  const [color, setColor] = useState(() => pickForGarment(assets.colors, prev?.color, (o) => o.hex, garment));
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = tx({ date: 'Özel gün', dateHelp: 'Takvim bu ayı gösterir, bu gün işaretlenir.', title: 'Başlık (isteğe bağlı)', names: 'İsimler (isteğe bağlı)',
        layout: 'Düzen', marker: 'İşaret', font: 'Rakam yazı tipi', titleFont: 'Başlık yazı tipi', color: 'Renk',
        noDate: 'Lütfen bir tarih seçin', range: 'Tarih şu yıllar arasında olmalı:' }, { date: 'Special day', dateHelp: 'The calendar shows this month with this day marked.', title: 'Title (optional)', names: 'Names (optional)',
        layout: 'Layout', marker: 'Marker', font: 'Number font', titleFont: 'Title font', color: 'Color',
        noDate: 'Please pick a date', range: 'The date must be between' });

  const minDate = `${assets.yearMin}-01-01`;
  const maxDate = `${assets.yearMax}-12-31`;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= minDate && date <= maxDate;
  const label = (o: Option) => (tx(o.label, o.labelEn ?? o.label));
  const len = (s: string) => Array.from(s).length;
  const showTitleFont = assets.titleEnabled && assets.titleFonts.length > 1 && title.trim().length > 0;

  const render = async () => {
    if (!date) { setError(t.noDate); return; }
    if (!dateOk) { setError(`${t.range} ${assets.yearMin}–${assets.yearMax}`); return; }
    setBusy(true);
    setError('');
    try {
      const fields: Record<string, string> = { date };
      if (assets.titleEnabled && title.trim()) fields.title = title.trim();
      if (assets.namesEnabled && names.trim()) fields.names = names.trim();
      const result = await onRender(fields, { layout, marker, font, titleFont, color });
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pills = (list: Option[], value: string, set: (id: string) => void, prefix?: (o: Option) => ReactNode) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((o) => (
        <button key={o.id} type="button" onClick={() => set(o.id)} className={pillClass(value === o.id)} aria-pressed={value === o.id}>
          {prefix?.(o)}
          {label(o)}
        </button>
      ))}
    </div>
  );

  return (
    <GeneratorModalShell
      title={assets.templateName}
      isTurkish={isTurkish}
      preview={preview}
      previewAlt={assets.templateName}
      busy={busy}
      error={error}
      canMake={!!date}
      onMake={render}
      onEdit={() => setPreview('')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(preview)}
      backdrop={garment?.hex}
    >
      <label className="flex flex-col gap-1">
        <FieldLabel label={t.date} />
        <input type="date" value={date} min={minDate} max={maxDate}
          onChange={(e) => { setDate(e.target.value); setError(''); }}
          className={`${inputClass} text-base`} />
        <span className="text-[11px] text-gray-400">{t.dateHelp}</span>
      </label>

      {assets.titleEnabled && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.title} right={`${len(title)}/${assets.titleMaxLength}`} />
          <input type="text" value={title} maxLength={assets.titleMaxLength} placeholder={assets.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
      )}

      {assets.namesEnabled && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.names} right={`${len(names)}/${assets.namesMaxLength}`} />
          <input type="text" value={names} maxLength={assets.namesMaxLength} placeholder={assets.namesPlaceholder}
            onChange={(e) => setNames(e.target.value)} className={inputClass} />
        </label>
      )}

      {assets.layouts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.layout} />
          {pills(assets.layouts, layout, setLayout)}
        </div>
      )}

      {assets.markers.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.marker} />
          {pills(assets.markers, marker, setMarker, (o) => (
            <span aria-hidden className="text-[13px] leading-none">{MARKER_ICON[o.id] ?? ''}</span>
          ))}
        </div>
      )}

      {assets.fonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.font} />
          {pills(assets.fonts, font, setFont)}
        </div>
      )}

      {showTitleFont && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.titleFont} />
          {pills(assets.titleFonts, titleFont, setTitleFont)}
        </div>
      )}

      {assets.colors.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.color} />
          {pills(assets.colors, color, setColor, (o) => (
            <span className="h-3 w-3 rounded-sm border border-gray-300" style={{ background: (o as ColorOption).hex }} />
          ))}
          {!inkVisible(assets.colors.find((o) => o.id === color)?.hex, garment) && (
            <span className="text-[11px] font-medium text-amber-600">{garmentWarning(isTurkish, garment)}</span>
          )}
        </div>
      )}
    </GeneratorModalShell>
  );
}
