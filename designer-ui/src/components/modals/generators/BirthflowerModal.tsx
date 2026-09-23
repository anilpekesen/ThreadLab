import { useState } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';
import { garmentWarning, inkVisible, pickForGarment } from './garment';

interface Option { id: string; label: string; labelEn?: string }

interface BirthflowerAssets {
  styles: Option[];
  layouts: Option[];
  fonts: Option[];
  inks: Array<Option & { hex: string }>;
  months: Array<{ month: number; label: string; labelEn: string; flower: string; flowerEn: string }>;
  maxPeople: number;
  nameMaxLength: number;
  titleEnabled: boolean;
  titleMaxLength: number;
  titlePlaceholder: string;
}

interface PersonRow { name: string; month: string }

/**
 * Doğum çiçeği penceresi: kişi satırları (isim + doğum ayı), isteğe bağlı
 * başlık ve stil/düzen/yazı tipi/renk seçimleri. Çizim sunucuda yapılır;
 * dönen şeffaf PNG onaylanınca ürüne konur.
 */
export default function BirthflowerModal({ assets: raw, isTurkish, garment, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as BirthflowerAssets & { templateName: string };
  const max = Math.max(1, assets.maxPeople || 1);
  // Önceki seçim şablonda artık kapalıysa ilk izinli değere dönülür
  const pick = (list: Option[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prev = initial?.choices;

  const [people, setPeople] = useState<PersonRow[]>(() => {
    const f = initial?.fields ?? {};
    const rows: PersonRow[] = [];
    for (let i = 1; i <= max; i++) {
      if (f[`month_${i}`] || f[`name_${i}`]) rows.push({ name: f[`name_${i}`] ?? '', month: f[`month_${i}`] ?? '' });
    }
    return rows.length ? rows : [{ name: '', month: '' }];
  });
  const [title, setTitle] = useState(() => initial?.fields?.title ?? '');
  const [style, setStyle] = useState(() => pick(assets.styles, prev?.style));
  const [layout, setLayout] = useState(() => pick(assets.layouts, prev?.layout));
  const [font, setFont] = useState(() => pick(assets.fonts, prev?.font));
  const [ink, setInk] = useState(() => pickForGarment(assets.inks, prev?.ink, (o) => o.hex, garment));
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = isTurkish
    ? { people: 'Kişiler', name: 'İsim', month: 'Doğum ayı', pickMonth: 'Ay', add: '+ Kişi ekle', remove: 'Kişiyi çıkar',
        title: 'Başlık (isteğe bağlı)', style: 'Çizim', layout: 'Düzen', font: 'Yazı tipi', ink: 'Renk',
        singleNote: 'Tek çiçek düzeninde yalnızca ilk kişi çizilir.', needMonth: 'Her kişi için doğum ayını seçin', max: 'En fazla' }
    : { people: 'People', name: 'Name', month: 'Birth month', pickMonth: 'Month', add: '+ Add person', remove: 'Remove person',
        title: 'Title (optional)', style: 'Style', layout: 'Layout', font: 'Font', ink: 'Colour',
        singleNote: 'The single flower layout draws only the first person.', needMonth: 'Choose a birth month for everyone', max: 'At most' };

  const isSingle = layout === 'single';
  const rows = isSingle ? people.slice(0, 1) : people;
  const ready = rows.length > 0 && rows.every((p) => p.month);
  const label = (o: Option) => (isTurkish ? o.label : o.labelEn ?? o.label);

  const update = (i: number, patch: Partial<PersonRow>) =>
    setPeople((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const render = async () => {
    if (!ready) { setError(t.needMonth); return; }
    setBusy(true);
    setError('');
    try {
      const fields: Record<string, string> = {};
      if (assets.titleEnabled && title.trim()) fields.title = title.trim();
      rows.forEach((p, i) => {
        fields[`name_${i + 1}`] = p.name.trim();
        fields[`month_${i + 1}`] = p.month;
      });
      const result = await onRender(fields, { style, layout, font, ink });
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

      <div className="flex flex-col gap-2">
        <FieldLabel label={t.people} right={isSingle ? undefined : `${rows.length}/${max}`} />
        {rows.map((p, i) => {
          const m = assets.months.find((x) => String(x.month) === p.month);
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                {/* İsim asıl alan: geniş ve büyük; ay seçimi yalnızca ay adı kadar */}
                <input
                  type="text"
                  value={p.name}
                  maxLength={assets.nameMaxLength}
                  placeholder={t.name}
                  aria-label={`${t.name} ${i + 1}`}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-base font-medium outline-none focus:border-gray-400"
                />
                <select
                  value={p.month}
                  aria-label={`${t.month} ${i + 1}`}
                  onChange={(e) => update(i, { month: e.target.value })}
                  className={`w-[7.5rem] shrink-0 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm outline-none focus:border-gray-400 ${p.month ? 'text-gray-900' : 'text-gray-400'}`}
                >
                  <option value="" disabled>{t.pickMonth}</option>
                  {assets.months.map((mm) => (
                    <option key={mm.month} value={String(mm.month)} className="text-gray-900">
                      {isTurkish ? mm.label : mm.labelEn}
                    </option>
                  ))}
                </select>
                {!isSingle && people.length > 1 && (
                  <button type="button" onClick={() => setPeople((list) => list.filter((_, j) => j !== i))}
                    aria-label={t.remove} title={t.remove}
                    className="shrink-0 rounded-lg px-1.5 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
                )}
              </div>
              {m && (
                <span className="pl-1 text-[11px] text-gray-400">
                  {isTurkish ? `${m.label} çiçeği: ${m.flower}` : `${m.labelEn} flower: ${m.flowerEn}`}
                </span>
              )}
            </div>
          );
        })}
        {isSingle ? (
          people.length > 1 && <span className="text-[11px] text-gray-400">{t.singleNote}</span>
        ) : people.length < max ? (
          <button type="button" onClick={() => setPeople((list) => [...list, { name: '', month: '' }])}
            className="self-start rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-500">
            {t.add}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">{t.max} {max}</span>
        )}
      </div>

      {assets.titleEnabled && (
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.title} right={`${Array.from(title).length}/${assets.titleMaxLength}`} />
          <input
            type="text"
            value={title}
            maxLength={assets.titleMaxLength}
            placeholder={assets.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      {assets.styles.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.style} />
          {pills(assets.styles, style, setStyle)}
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
