import { useMemo, useState } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';
import { garmentWarning, inkVisible, pickForGarment } from './garment';
import { tx } from '../../../i18n';

/** Sunucunun publicAssets çıktısı (app/lib/generators/starmap/index.server.ts) */
interface StarmapAssets {
  themes: Array<{ id: string; label: string; labelEn: string; swatch: { bg: string; ink: string } }>;
  fonts: Array<{ id: string; label: string }>;
  allowConstellationToggle: boolean;
  constellationsDefault: boolean;
  allowGridToggle: boolean;
  gridDefault: boolean;
  fillCanvas?: boolean;
  defaultTitle: string;
  defaultSubtitle: string;
  titleMax: number;
  subtitleMax: number;
  yearMin: number;
  yearMax: number;
  defaultTime: string;
  defaultCity: string;
  cities: Array<{ id: string; name: string; nameEn?: string; country?: string; countryEn?: string; turkey: boolean }>;
}

/** Aramada Türkçe harf farkı gözetilmez: "istanbul", "İSTANBUL", "Istanbul" aynı */
const fold = (s: string) =>
  s.toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Yıldız haritası penceresi. Müşteri tarih, saat ve şehir seçer, başlık ve
 * notunu yazar; gökyüzü sunucuda hesaplanıp çizilir.
 */
export default function StarmapModal({ assets: raw, isTurkish, garment, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as StarmapAssets & { templateName: string };
  const f = initial?.fields;
  const c = initial?.choices;
  // Önceki seçim şablonda artık kapalıysa ilk izinli değere dönülür
  const pick = <T extends { id: string }>(list: T[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';

  const [title, setTitle] = useState(f?.title ?? assets.defaultTitle);
  const [subtitle, setSubtitle] = useState(f?.subtitle ?? assets.defaultSubtitle);
  const [date, setDate] = useState(f?.date ?? '');
  const [time, setTime] = useState(f?.time || assets.defaultTime || '21:00');
  const [cityId, setCityId] = useState(() => pick(assets.cities, f?.city ?? assets.defaultCity));
  const [cityQuery, setCityQuery] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  // Temanın tişörte düşen yazı rengi: şeffaf temalarda mürekkep, dolgulu
  // temalarda (poster değilse) yazılar zemin renginde basılıyor
  const themeInk = (x?: { id: string; swatch: { bg: string; ink: string } }) =>
    !x || assets.fillCanvas ? null : x.id.startsWith('transparent') ? x.swatch.ink : x.swatch.bg;
  const [theme, setTheme] = useState(() => pickForGarment(assets.themes, c?.theme, themeInk, garment));
  const [font, setFont] = useState(() => pick(assets.fonts, c?.font));
  const [constellations, setConstellations] = useState(
    typeof c?.constellations === 'boolean' ? c.constellations : assets.constellationsDefault);
  const [grid, setGrid] = useState(typeof c?.grid === 'boolean' ? c.grid : assets.gridDefault);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = tx({ date: 'Tarih', time: 'Saat', city: 'Şehir', search: 'Şehir ara…', noCity: 'Şehir bulunamadı',
        title: 'Başlık', subtitle: 'Alt metin', subtitleHint: 'İsimler ya da kısa bir not',
        theme: 'Renk', font: 'Başlık yazı tipi', lines: 'Takımyıldız çizgileri', grid: 'Koordinat ızgarası',
        noDate: 'Lütfen bir tarih seçin', range: 'Tarih şu aralıkta olmalı:', turkey: 'Türkiye', world: 'Dünya',
        timeHint: 'Yerel saat; yaz saati otomatik hesaplanır.' }, { date: 'Date', time: 'Time', city: 'City', search: 'Search city…', noCity: 'No city found',
        title: 'Title', subtitle: 'Subtitle', subtitleHint: 'Names or a short note',
        theme: 'Color', font: 'Title font', lines: 'Constellation lines', grid: 'Coordinate grid',
        noDate: 'Please pick a date', range: 'Date must be between', turkey: 'Turkey', world: 'World',
        timeHint: 'Local time; daylight saving is handled automatically.' });

  const cityLabel = (x: StarmapAssets['cities'][number]) => {
    const name = tx(x.name, x.nameEn ?? x.name);
    const country = tx(x.country, x.countryEn ?? x.country);
    return country ? `${name}, ${country}` : name;
  };
  const selectedCity = assets.cities.find((x) => x.id === cityId);

  // Türkiye illeri önce, her grup kendi içinde alfabetik
  const sortedCities = useMemo(() => {
    const collator = new Intl.Collator(isTurkish ? 'tr' : 'en');
    const by = (a: StarmapAssets['cities'][number], b: StarmapAssets['cities'][number]) =>
      collator.compare(tx(a.name, a.nameEn ?? a.name), tx(b.name, b.nameEn ?? b.name));
    return [...assets.cities.filter((x) => x.turkey).sort(by), ...assets.cities.filter((x) => !x.turkey).sort(by)];
  }, [assets.cities, isTurkish]);

  const matches = useMemo(() => {
    const q = fold(cityQuery.trim());
    if (!q) return sortedCities;
    // Adın başıyla eşleşenler önce, sonra içinde geçenler (ülke adı dahil)
    const hay = (x: StarmapAssets['cities'][number]) => fold([x.name, x.nameEn, x.country, x.countryEn].filter(Boolean).join(' '));
    const starts = sortedCities.filter((x) => fold(x.name).startsWith(q) || fold(x.nameEn ?? '').startsWith(q));
    const rest = sortedCities.filter((x) => !starts.includes(x) && hay(x).includes(q));
    return [...starts, ...rest];
  }, [cityQuery, sortedCities]);

  const minDate = `${assets.yearMin}-01-01`;
  const maxDate = `${assets.yearMax}-12-31`;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= minDate && date <= maxDate;

  const render = async () => {
    if (!date) { setError(t.noDate); return; }
    if (!dateOk) { setError(`${t.range} ${assets.yearMin}–${assets.yearMax}`); return; }
    setBusy(true);
    setError('');
    try {
      const choices: Record<string, string | boolean> = { theme, font };
      if (assets.allowConstellationToggle) choices.constellations = constellations;
      if (assets.allowGridToggle) choices.grid = grid;
      const result = await onRender(
        { title: title.trim(), subtitle: subtitle.trim(), date, time: time || '21:00', city: cityId },
        choices,
      );
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const chooseCity = (id: string) => {
    setCityId(id);
    setCityQuery('');
    setCityOpen(false);
  };

  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)}
      className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
      {label}
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-gray-900' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );

  // Arama listesinde Türkiye → Dünya geçişinde bir ara başlık
  const firstWorld = matches.findIndex((x) => !x.turkey);

  return (
    <GeneratorModalShell
      title={assets.templateName}
      isTurkish={isTurkish}
      preview={preview}
      previewAlt={assets.templateName}
      busy={busy}
      error={error}
      canMake={!!date && !!cityId}
      onMake={render}
      onEdit={() => setPreview('')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(preview)}
      backdrop={garment?.hex}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.date} />
          <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel label={t.time} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </label>
        <span className="col-span-2 -mt-2 text-[11px] text-gray-400">{t.timeHint}</span>
      </div>

      <div className="relative flex flex-col gap-1">
        <FieldLabel label={t.city} />
        <input
          type="text"
          value={cityOpen ? cityQuery : selectedCity ? cityLabel(selectedCity) : ''}
          placeholder={t.search}
          onFocus={() => { setCityOpen(true); setCityQuery(''); }}
          // Öneriye tıklama, odak kaybından önce işlensin diye kapanış biraz geciktirilir
          onBlur={() => setTimeout(() => setCityOpen(false), 150)}
          onChange={(e) => setCityQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) { e.preventDefault(); chooseCity(matches[0].id); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          className={inputClass}
          autoComplete="off"
        />
        {cityOpen && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {matches.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">{t.noCity}</li>}
            {matches.map((x, i) => (
              <li key={x.id}>
                {(i === 0 && x.turkey) && <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{t.turkey}</p>}
                {i === firstWorld && <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{t.world}</p>}
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseCity(x.id)}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${x.id === cityId ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {cityLabel(x)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <FieldLabel label={t.title} right={`${Array.from(title).length}/${assets.titleMax}`} />
        <input type="text" value={title} maxLength={assets.titleMax} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1">
        <FieldLabel label={t.subtitle} right={`${Array.from(subtitle).length}/${assets.subtitleMax}`} />
        <textarea value={subtitle} maxLength={assets.subtitleMax} rows={2} placeholder={t.subtitleHint}
          onChange={(e) => setSubtitle(e.target.value.replace(/\r?\n/g, ' '))}
          className={`${inputClass} resize-none leading-snug`} />
      </label>

      {assets.themes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.theme} />
          <div className="flex flex-wrap gap-1.5">
            {assets.themes.map((x) => (
              <button key={x.id} type="button" onClick={() => setTheme(x.id)} className={pillClass(theme === x.id)} aria-pressed={theme === x.id}>
                <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300" style={{ background: x.swatch.bg }}>
                  <span className="h-1 w-1 rounded-full" style={{ background: x.swatch.ink }} />
                </span>
                {tx(x.label, x.labelEn)}
              </button>
            ))}
          </div>
          {!inkVisible(themeInk(assets.themes.find((x) => x.id === theme)), garment) && (
            <span className="text-[11px] font-medium text-amber-600">{garmentWarning(isTurkish, garment)}</span>
          )}
        </div>
      )}

      {assets.fonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.font} />
          <div className="flex flex-wrap gap-1.5">
            {assets.fonts.map((x) => (
              <button key={x.id} type="button" onClick={() => setFont(x.id)} className={pillClass(font === x.id)} aria-pressed={font === x.id}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(assets.allowConstellationToggle || assets.allowGridToggle) && (
        <div className="flex flex-col gap-2">
          {assets.allowConstellationToggle && toggle(t.lines, constellations, setConstellations)}
          {assets.allowGridToggle && toggle(t.grid, grid, setGrid)}
        </div>
      )}
    </GeneratorModalShell>
  );
}
