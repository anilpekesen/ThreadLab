import { useMemo, useState } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';
import { garmentWarning, inkVisible, pickForGarment } from './garment';

/** Sunucu: app/lib/generators/citymap (publicAssets) */
interface CitymapAssets {
  styles: Array<{ id: string; label: string; labelEn: string; bg: string; ink: string }>;
  shapes: Array<{ id: string; label: string; labelEn: string; path: string }>;
  radii: number[];
  defaultRadius: number;
  fonts: Array<{ id: string; label: string }>;
  cities: Array<{ id: string; name: string; nameEn: string; label: string; labelEn: string; tr: boolean }>;
  defaultCity: string;
  allowCustomPoint: boolean;
  titleMax: number;
  subtitleMax: number;
  labelLanguage: 'tr' | 'en';
}

/** Aramada Türkçe harf farkı gözetilmez: "kadikoy" Kadıköy'ü bulur */
function fold(s: string) {
  return s.toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const km = (r: number, tr: boolean) => `${tr ? String(r).replace('.', ',') : r} km`;

/**
 * Şehir haritası penceresi. Müşteri listeden şehir (ya da izinliyse kendi
 * noktasını) seçer, başlık ve alt satırı yazar; harita sunucuda
 * OpenStreetMap verisinden çizilir. Yeni bir şehrin ilk çizimi veri
 * indirildiği için 10–20 sn sürebilir, sonrası önbellekten hızlı gelir.
 */
export default function CitymapModal({ assets: raw, isTurkish, garment, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as CitymapAssets & { templateName: string };
  const cities = assets.cities ?? [];
  const pick = <T extends { id: string }>(list: T[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prevF = initial?.fields ?? {};
  const prevC = initial?.choices ?? {};

  const [city, setCity] = useState(() =>
    cities.some((c) => c.id === prevF.city) ? prevF.city : cities.some((c) => c.id === assets.defaultCity) ? assets.defaultCity : cities[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState(() => assets.allowCustomPoint && !!(prevF.lat || prevF.lon));
  const [lat, setLat] = useState(prevF.lat ?? '');
  const [lon, setLon] = useState(prevF.lon ?? '');
  const [title, setTitle] = useState(prevF.title ?? '');
  const [subtitle, setSubtitle] = useState(prevF.subtitle ?? '');
  // Poster stillerinin kendi zemini var; mürekkep stillerinde yollar kumaşa basılır
  const styleInk = (s?: { bg: string; ink: string }) => (!s || s.bg ? null : s.ink);
  const [style, setStyle] = useState(() => pickForGarment(assets.styles, prevC.style, styleInk, garment));
  const [shape, setShape] = useState(() => pick(assets.shapes, prevC.shape));
  const [radius, setRadius] = useState(() =>
    assets.radii.includes(Number(prevC.radius)) ? Number(prevC.radius) : assets.defaultRadius);
  const [font, setFont] = useState(() => pick(assets.fonts, prevC.font));
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = isTurkish
    ? { city: 'Şehir', search: 'Şehir ya da ilçe ara…', none: 'Sonuç yok', customToggle: 'Listede yok mu? Konumu kendin gir',
        listToggle: 'Listeden seç', lat: 'Enlem', lon: 'Boylam', coordHint: 'Google Haritalar\'da noktaya uzun basınca görünen iki sayı (ör. 41.0082, 28.9784).',
        title: 'Başlık', subtitle: 'Alt satır', subtitlePh: 'Ör. Tanıştığımız şehir · 14.02.2021', style: 'Stil', shape: 'Şekil',
        radius: 'Yakınlık', font: 'Yazı tipi', wait: 'Harita hazırlanıyor, bu 10–20 saniye sürebilir.',
        badCoord: 'Enlem -80 ile 84, boylam -180 ile 180 arasında olmalı.', turkey: 'Türkiye', world: 'Dünya' }
    : { city: 'City', search: 'Search a city or district…', none: 'No results', customToggle: 'Not listed? Enter the location yourself',
        listToggle: 'Pick from list', lat: 'Latitude', lon: 'Longitude', coordHint: 'The two numbers Google Maps shows when you long-press a spot (e.g. 41.0082, 28.9784).',
        title: 'Title', subtitle: 'Subtitle', subtitlePh: 'e.g. Where we met · 14.02.2021', style: 'Style', shape: 'Shape',
        radius: 'Zoom', font: 'Font', wait: 'Preparing your map, this can take 10–20 seconds.',
        badCoord: 'Latitude must be between -80 and 84, longitude between -180 and 180.', turkey: 'Turkey', world: 'World' };

  const selected = cities.find((c) => c.id === city);
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return cities;
    return cities.filter((c) => fold(`${c.label} ${c.labelEn}`).includes(q));
  }, [cities, query]);

  // Başlık boş bırakılırsa sunucu şehir adını basar; yer tutucu bunu gösterir
  const titlePh = custom ? '' : (isTurkish ? selected?.name : selected?.nameEn ?? selected?.name) ?? '';
  const latN = Number(lat.replace(',', '.'));
  const lonN = Number(lon.replace(',', '.'));
  const coordOk = lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lonN)
    && latN >= -80 && latN <= 84 && lonN >= -180 && lonN <= 180;
  const canMake = custom ? coordOk : !!city;

  const render = async () => {
    if (custom && !coordOk) { setError(t.badCoord); return; }
    setBusy(true);
    setError('');
    try {
      const fields: Record<string, string> = { city, title: title.trim(), subtitle: subtitle.trim() };
      if (custom) { fields.lat = String(latN); fields.lon = String(lonN); }
      const result = await onRender(fields, { style, shape, radius, font });
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const trCities = results.filter((c) => c.tr);
  const worldCities = results.filter((c) => !c.tr);
  const cityButton = (c: CitymapAssets['cities'][number]) => (
    <button key={c.id} type="button" onClick={() => { setCity(c.id); setQuery(''); }}
      className={`block w-full px-3 py-1.5 text-left text-sm ${c.id === city ? 'bg-gray-900 font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
      {isTurkish ? c.label : c.labelEn}
    </button>
  );

  return (
    <GeneratorModalShell
      title={assets.templateName}
      isTurkish={isTurkish}
      preview={preview}
      previewAlt={assets.templateName}
      busy={busy}
      error={error}
      canMake={canMake}
      onMake={render}
      onEdit={() => setPreview('')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(preview)}
      backdrop={garment?.hex}
    >
      {busy && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">{t.wait}</p>
      )}

      {!custom ? (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.city} right={selected ? (isTurkish ? selected.label : selected.labelEn) : undefined} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className={inputClass} />
          <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200">
            {results.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">{t.none}</p>}
            {trCities.length > 0 && worldCities.length > 0 && (
              <p className="sticky top-0 bg-gray-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{t.turkey}</p>
            )}
            {trCities.map(cityButton)}
            {worldCities.length > 0 && trCities.length > 0 && (
              <p className="sticky top-0 bg-gray-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{t.world}</p>
            )}
            {worldCities.map(cityButton)}
          </div>
          {assets.allowCustomPoint && (
            <button type="button" onClick={() => setCustom(true)} className="self-start text-[11px] font-semibold text-rose-600 underline">
              {t.customToggle}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <FieldLabel label={t.lat} />
              <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value.slice(0, 12))} placeholder="41.0082" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <FieldLabel label={t.lon} />
              <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value.slice(0, 12))} placeholder="28.9784" className={inputClass} />
            </label>
          </div>
          <span className="text-[11px] text-gray-400">{t.coordHint}</span>
          <button type="button" onClick={() => { setCustom(false); setLat(''); setLon(''); }}
            className="self-start text-[11px] font-semibold text-rose-600 underline">
            {t.listToggle}
          </button>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <FieldLabel label={t.title} right={`${Array.from(title).length}/${assets.titleMax}`} />
        <input value={title} maxLength={assets.titleMax} placeholder={titlePh}
          onChange={(e) => setTitle(Array.from(e.target.value).slice(0, assets.titleMax).join(''))} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <FieldLabel label={t.subtitle} right={`${Array.from(subtitle).length}/${assets.subtitleMax}`} />
        <input value={subtitle} maxLength={assets.subtitleMax} placeholder={t.subtitlePh}
          onChange={(e) => setSubtitle(Array.from(e.target.value).slice(0, assets.subtitleMax).join(''))} className={inputClass} />
      </label>

      {assets.styles.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.style} />
          <div className="flex flex-wrap gap-1.5">
            {assets.styles.map((s) => (
              <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={pillClass(style === s.id)} aria-pressed={style === s.id}>
                <span className="flex h-4 w-4 items-center justify-center rounded border border-gray-300"
                  style={{ background: s.bg || (s.ink === '#ffffff' ? '#374151' : '#ffffff') }}>
                  <span className="h-[3px] w-2.5 rounded" style={{ background: s.ink }} />
                </span>
                {isTurkish ? s.label : s.labelEn}
              </button>
            ))}
          </div>
          {!inkVisible(styleInk(assets.styles.find((s) => s.id === style)), garment) && (
            <span className="text-[11px] font-medium text-amber-600">{garmentWarning(isTurkish, garment)}</span>
          )}
        </div>
      )}

      {assets.shapes.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.shape} />
          <div className="flex flex-wrap gap-1.5">
            {assets.shapes.map((s) => (
              <button key={s.id} type="button" onClick={() => setShape(s.id)} className={pillClass(shape === s.id)} aria-pressed={shape === s.id}>
                <svg width="14" height="14" viewBox="0 0 100 100" aria-hidden="true"><path d={s.path} fill="currentColor" /></svg>
                {isTurkish ? s.label : s.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {assets.radii.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.radius} />
          <div className="flex flex-wrap gap-1.5">
            {assets.radii.map((r) => (
              <button key={r} type="button" onClick={() => setRadius(r)} className={pillClass(radius === r)} aria-pressed={radius === r}>
                {km(r, isTurkish)}
              </button>
            ))}
          </div>
        </div>
      )}

      {assets.fonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.font} />
          <div className="flex flex-wrap gap-1.5">
            {assets.fonts.map((f) => (
              <button key={f.id} type="button" onClick={() => setFont(f.id)} className={pillClass(font === f.id)} aria-pressed={font === f.id}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </GeneratorModalShell>
  );
}
