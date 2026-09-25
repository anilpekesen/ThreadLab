import { useState, type ReactNode } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';
import { garmentWarning, inkVisible, pickForGarment } from './garment';

/** Sunucu: app/lib/generators/wordsearch (publicAssets) */
interface Option { id: string; label: string; labelEn?: string }
interface WordsearchAssets {
  styles: Option[];
  fonts: Option[];
  titleFonts: Option[];
  inks: Array<{ hex: string; label: string; labelEn: string }>;
  alphabet: 'tr' | 'en';
  maxWords: number;
  wordMinLength: number;
  wordMaxLength: number;
  titleEnabled: boolean;
  titleMaxLength: number;
  titlePlaceholder: string;
}

/** Görünüm simgeleri: 24x16 kutuda harf tablosu, çözülmüşte bir kapsül */
function StyleIcon({ id }: { id: string }) {
  return (
    <svg width="22" height="15" viewBox="0 0 24 16" aria-hidden="true">
      <g fill="currentColor">
        {[3, 8, 13].map((y) => [3, 9, 15, 21].map((x) => <rect key={`${x}-${y}`} x={x - 1.2} y={y - 1.2} width="2.4" height="2.4" rx="0.6" />))}
      </g>
      {id === 'solved' && <rect x="0.8" y="5.2" width="16.4" height="5.6" rx="2.8" fill="none" stroke="currentColor" strokeWidth="1.1" />}
    </svg>
  );
}

/**
 * Kelime avı penceresi: kelimeler (isimler, yerler, anılar), isteğe bağlı
 * başlık ve görünüm/yazı tipi/renk. Kelimeler yazılırken şablonun alfabesinin
 * kuralıyla büyük harfe çevrilir, harf dışı her şey atılır (sunucu aynı
 * kuralı uygular). Tablo sunucuda sabit tohumla dizilir: aynı kelimeler her
 * seferinde aynı bulmacayı verir.
 */
export default function WordsearchModal({ assets: raw, isTurkish, garment, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = raw as unknown as WordsearchAssets & { templateName: string };
  const max = Math.max(2, assets.maxWords || 8);
  const minLen = assets.wordMinLength || 2;
  const maxLen = assets.wordMaxLength || 12;
  const locale = assets.alphabet === 'en' ? 'en-US' : 'tr-TR';
  const clean = (v: string) =>
    Array.from(v.toLocaleUpperCase(locale)).filter((ch) => /\p{L}/u.test(ch)).slice(0, maxLen).join('');
  // Önceki seçim şablonda artık kapalıysa ilk izinli değere dönülür
  const pick = (list: Option[], id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prev = initial?.choices;

  const [words, setWords] = useState<string[]>(() => {
    const f = initial?.fields ?? {};
    const rows: string[] = [];
    for (let i = 1; i <= max; i++) if (f[`word_${i}`]) rows.push(clean(f[`word_${i}`]));
    // Boş pencerede üç satır: müşteri birden çok kelime yazabileceğini görsün
    return rows.length ? rows : ['', '', ''].slice(0, Math.min(3, max));
  });
  const [title, setTitle] = useState(() => initial?.fields?.title ?? '');
  const [style, setStyle] = useState(() => pick(assets.styles, prev?.style));
  const [font, setFont] = useState(() => pick(assets.fonts, prev?.font));
  const [titleFont, setTitleFont] = useState(() => pick(assets.titleFonts, prev?.titleFont));
  const [ink, setInk] = useState(() =>
    pickForGarment(assets.inks.map((c) => ({ id: c.hex })), prev?.ink, (c) => c.id, garment) || assets.inks[0]?.hex || '#111111');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = isTurkish
    ? { words: 'Kelimeler', wordsHint: `İsimler, yerler, anılar… her biri ${minLen}–${maxLen} harf`, word: 'Kelime',
        add: '+ Kelime ekle', remove: 'Kelimeyi çıkar', max: 'En fazla', title: 'Başlık (isteğe bağlı)',
        style: 'Görünüm', font: 'Harf yazı tipi', titleFont: 'Başlık yazı tipi', ink: 'Renk',
        tooShort: `Her kelime en az ${minLen} harf olmalı`, empty: 'En az bir kelime yazın',
        placeholders: ['AYŞE', 'MEHMET', 'İSTANBUL', 'KAHVE', 'DENİZ', 'SONSUZA'] }
    : { words: 'Words', wordsHint: `Names, places, memories… ${minLen}–${maxLen} letters each`, word: 'Word',
        add: '+ Add word', remove: 'Remove word', max: 'At most', title: 'Title (optional)',
        style: 'Look', font: 'Letter font', titleFont: 'Title font', ink: 'Color',
        tooShort: `Each word needs at least ${minLen} letters`, empty: 'Enter at least one word',
        placeholders: ['EMMA', 'JAMES', 'PARIS', 'COFFEE', 'FOREVER', 'HOME'] };

  const filled = words.filter(Boolean);
  const short = filled.some((w) => Array.from(w).length < minLen);
  const ready = filled.length > 0 && !short;
  const label = (o: Option) => (isTurkish ? o.label : o.labelEn ?? o.label);

  const update = (i: number, v: string) => {
    setWords((list) => list.map((w, j) => (j === i ? clean(v) : w)));
    setError('');
  };

  const render = async () => {
    if (!filled.length) { setError(t.empty); return; }
    if (short) { setError(t.tooShort); return; }
    setBusy(true);
    setError('');
    try {
      const fields: Record<string, string> = {};
      filled.forEach((w, i) => { fields[`word_${i + 1}`] = w; });
      if (assets.titleEnabled && title.trim()) fields.title = title.trim();
      const result = await onRender(fields, { style, font, titleFont, ink });
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pills = (list: Option[], value: string, set: (id: string) => void, icon?: (o: Option) => ReactNode) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((o) => (
        <button key={o.id} type="button" onClick={() => set(o.id)} className={pillClass(value === o.id)} aria-pressed={value === o.id}>
          {icon?.(o)}
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
      <div className="flex flex-col gap-2">
        <FieldLabel label={t.words} right={`${filled.length}/${max}`} />
        <div className="grid grid-cols-2 gap-1.5">
          {words.map((w, i) => {
            const bad = !!w && Array.from(w).length < minLen;
            return (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="text"
                  value={w}
                  onChange={(e) => update(i, e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t.placeholders[i % t.placeholders.length]}
                  aria-label={`${t.word} ${i + 1}`}
                  aria-invalid={bad}
                  className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold tracking-[0.12em] text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300 ${bad ? 'border-amber-400' : 'border-gray-200 focus:border-gray-400'}`}
                />
                {words.length > 1 && (
                  <button type="button" onClick={() => setWords((list) => list.filter((_, j) => j !== i))}
                    aria-label={t.remove} title={t.remove}
                    className="shrink-0 rounded-lg px-1 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
                )}
              </div>
            );
          })}
        </div>
        {words.length < max ? (
          <button type="button" onClick={() => setWords((list) => [...list, ''])}
            className="self-start rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-500">
            {t.add}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">{t.max} {max}</span>
        )}
        <span className={`text-[11px] ${short ? 'font-medium text-amber-600' : 'text-gray-400'}`}>{short ? t.tooShort : t.wordsHint}</span>
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
          {pills(assets.styles, style, setStyle, (o) => <StyleIcon id={o.id} />)}
        </div>
      )}

      {assets.fonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.font} />
          {pills(assets.fonts, font, setFont)}
        </div>
      )}

      {assets.titleEnabled && title.trim() && assets.titleFonts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.titleFont} />
          {pills(assets.titleFonts, titleFont, setTitleFont)}
        </div>
      )}

      {assets.inks.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.ink} />
          <div className="flex flex-wrap gap-1.5">
            {assets.inks.map((c) => (
              <button key={c.hex} type="button" onClick={() => setInk(c.hex)} className={pillClass(ink === c.hex)} aria-pressed={ink === c.hex}>
                <span className="h-3.5 w-3.5 rounded-full border border-gray-300" style={{ background: c.hex }} />
                {isTurkish ? c.label : c.labelEn}
              </button>
            ))}
          </div>
          {!inkVisible(ink, garment) && (
            <span className="text-[11px] font-medium text-amber-600">{garmentWarning(isTurkish, garment)}</span>
          )}
        </div>
      )}
    </GeneratorModalShell>
  );
}
