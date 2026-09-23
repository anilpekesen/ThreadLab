import { useState } from 'react';
import GeneratorModalShell, { FieldLabel, inputClass, pillClass } from './GeneratorModalShell';
import type { GeneratorModalProps } from './types';

/** Sunucu: app/lib/generators/monogram (publicAssets) */
interface Option { id: string; label: string; labelEn: string }
export interface MonogramAssets {
  layouts: Option[];
  frames: Option[];
  joiners: Option[];
  fonts: Array<{ id: string; label: string; script?: boolean }>;
  colors: Array<{ hex: string; label: string; labelEn: string }>;
  maxLetters: number;
  topText: { max: number } | null;
  bottomText: { max: number } | null;
}

/** Düzen simgeleri: 24x16 kutuda harf yerine çubuk ve daireler */
function LayoutIcon({ id }: { id: string }) {
  const common = { width: 22, height: 15, viewBox: '0 0 24 16', 'aria-hidden': true } as const;
  switch (id) {
    case 'classic':
      return <svg {...common} fill="currentColor"><rect x="2" y="5" width="4" height="7" rx="1" /><rect x="9" y="1" width="6" height="14" rx="1" /><rect x="18" y="5" width="4" height="7" rx="1" /></svg>;
    case 'stacked':
      return <svg {...common} fill="currentColor"><rect x="1" y="3" width="5.5" height="10" rx="1" /><rect x="9.25" y="3" width="5.5" height="10" rx="1" /><rect x="17.5" y="3" width="5.5" height="10" rx="1" /></svg>;
    case 'single':
      return <svg {...common} fill="currentColor"><rect x="8" y="1" width="8" height="14" rx="1.5" /></svg>;
    default:
      return <svg {...common} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="5.5" /><circle cx="15" cy="8" r="5.5" /></svg>;
  }
}

/** Çerçeve simgeleri: 16x16 */
function FrameIcon({ id }: { id: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true } as const;
  switch (id) {
    case 'circle':
      return <svg {...common}><circle cx="8" cy="8" r="7" /><circle cx="8" cy="8" r="5.4" strokeWidth="0.8" /></svg>;
    case 'circle-text':
      return <svg {...common}><circle cx="8" cy="8" r="7.2" /><circle cx="8" cy="8" r="4.2" /><path d="M4.4 4.6 A5 5 0 0 1 11.6 4.6" strokeDasharray="1.2 1" /></svg>;
    case 'diamond':
      return <svg {...common}><path d="M8 1 L15 8 L8 15 L1 8 Z" /></svg>;
    case 'square':
      return <svg {...common}><path d="M4 1.5 H12 A2.5 2.5 0 0 0 14.5 4 V12 A2.5 2.5 0 0 0 12 14.5 H4 A2.5 2.5 0 0 0 1.5 12 V4 A2.5 2.5 0 0 0 4 1.5 Z" /></svg>;
    case 'laurel':
      return (
        <svg {...common}>
          <path d="M6.5 14.5 C2 12.5 0.8 7 3.5 2.5 M9.5 14.5 C14 12.5 15.2 7 12.5 2.5" />
          <g fill="currentColor" stroke="none">
            <ellipse cx="2.2" cy="10" rx="1.6" ry="0.8" transform="rotate(-50 2.2 10)" />
            <ellipse cx="1.9" cy="6" rx="1.5" ry="0.75" transform="rotate(-75 1.9 6)" />
            <ellipse cx="13.8" cy="10" rx="1.6" ry="0.8" transform="rotate(50 13.8 10)" />
            <ellipse cx="14.1" cy="6" rx="1.5" ry="0.75" transform="rotate(75 14.1 6)" />
          </g>
        </svg>
      );
    case 'crest':
      return <svg {...common}><path d="M2 2.5 C5 2.5 6.5 2 8 1 C9.5 2 11 2.5 14 2.5 V8 C14 11.5 11 13.8 8 15 C5 13.8 2 11.5 2 8 Z" /></svg>;
    default:
      return <svg {...common} strokeDasharray="2 2"><rect x="1.5" y="1.5" width="13" height="13" rx="1" /></svg>;
  }
}

/**
 * Monogram penceresi: 1–3 baş harf, isteğe bağlı üst/alt yazı, düzen,
 * çerçeve, yazı tipi ve mürekkep rengi. Harfler yazılırken büyük harfe
 * çevrilir ve harf/rakam dışı her şey atılır (sunucu aynı kuralı uygular).
 */
export default function MonogramModal({ assets: rawAssets, isTurkish, initial, onRender, onCancel, onConfirm }: GeneratorModalProps) {
  const assets = rawAssets as unknown as MonogramAssets & { templateName: string };
  const pick = (list: Array<{ id: string }>, id: unknown) =>
    (typeof id === 'string' && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prevC = initial?.choices ?? {};
  const prevF = initial?.fields ?? {};
  const locale = isTurkish ? 'tr-TR' : 'en-US';
  const clean = (v: string) =>
    Array.from(v.toLocaleUpperCase(locale)).filter((ch) => /[\p{L}\p{N}]/u.test(ch)).slice(0, assets.maxLetters).join('');

  const [letters, setLetters] = useState(() => clean(prevF.letters ?? ''));
  const [topText, setTopText] = useState(prevF.topText ?? '');
  const [bottomText, setBottomText] = useState(prevF.bottomText ?? '');
  const [layout, setLayout] = useState(() => pick(assets.layouts, prevC.layout));
  const [frame, setFrame] = useState(() => pick(assets.frames, prevC.frame));
  const [joiner, setJoiner] = useState(() => pick(assets.joiners, prevC.joiner));
  const [font, setFont] = useState(() => pick(assets.fonts, prevC.font));
  const [color, setColor] = useState(() =>
    (typeof prevC.color === 'string' && assets.colors.some((c) => c.hex === prevC.color) ? prevC.color : assets.colors[0]?.hex) ?? '#111111');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = isTurkish
    ? { letters: 'Baş harfler', lettersHint: assets.maxLetters === 1 ? 'Bir harf ya da rakam' : `En fazla ${assets.maxLetters} harf`,
        top: 'Üst yazı', topPh: 'Ör: AYŞE & MEHMET', bottom: 'Alt yazı', bottomPh: 'Ör: 12.06.2026 ya da EST. 2020', optional: 'isteğe bağlı',
        layout: 'Düzen', frame: 'Çerçeve', joiner: 'Harflerin arası', font: 'Yazı tipi', color: 'Renk',
        empty: 'En az bir harf yazın', ringHint: 'Yazılı dairede üst ve alt yazı dairenin kenarına yazılır.' }
    : { letters: 'Initials', lettersHint: assets.maxLetters === 1 ? 'One letter or number' : `Up to ${assets.maxLetters} letters`,
        top: 'Top text', topPh: 'E.g. ANNA & JAMES', bottom: 'Bottom text', bottomPh: 'E.g. 12.06.2026 or EST. 2020', optional: 'optional',
        layout: 'Layout', frame: 'Frame', joiner: 'Between letters', font: 'Font', color: 'Colour',
        empty: 'Type at least one letter', ringHint: 'With the text circle, the top and bottom text run around the ring.' };

  const showJoiner = layout === 'classic' && Array.from(letters).length === 2 && assets.joiners.length > 1;
  const hasTexts = !!(assets.topText || assets.bottomText);

  const render = async () => {
    if (!letters) { setError(t.empty); return; }
    setBusy(true);
    setError('');
    try {
      const fields: Record<string, string> = { letters };
      if (assets.topText) fields.topText = topText.trim();
      if (assets.bottomText) fields.bottomText = bottomText.trim();
      const result = await onRender(fields, { layout, frame, joiner, font, color });
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeneratorModalShell
      title={assets.templateName}
      isTurkish={isTurkish}
      preview={preview}
      previewAlt={letters}
      busy={busy}
      error={error}
      canMake={letters.length > 0}
      onMake={render}
      onEdit={() => setPreview('')}
      onCancel={onCancel}
      onConfirm={() => onConfirm(preview)}
    >
      <label className="flex flex-col gap-1">
        <FieldLabel label={t.letters} right={`${Array.from(letters).length}/${assets.maxLetters}`} />
        <input
          type="text"
          value={letters}
          onChange={(e) => { setLetters(clean(e.target.value)); setError(''); }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder={(isTurkish ? 'AŞM' : 'ABC').slice(0, assets.maxLetters)}
          aria-label={t.letters}
          className="w-full rounded-xl border border-gray-200 px-3 py-3 text-center font-serif text-4xl font-semibold tracking-[0.35em] text-gray-900 outline-none placeholder:text-gray-200 focus:border-gray-400"
        />
        <span className="text-[11px] text-gray-400">{t.lettersHint}</span>
      </label>

      {hasTexts && (
        <div className="flex flex-col gap-3">
          {assets.topText && (
            <label className="flex flex-col gap-1">
              <FieldLabel label={`${t.top} (${t.optional})`} right={`${Array.from(topText).length}/${assets.topText.max}`} />
              <input type="text" value={topText} maxLength={assets.topText.max} placeholder={t.topPh}
                onChange={(e) => setTopText(e.target.value)} className={inputClass} />
            </label>
          )}
          {assets.bottomText && (
            <label className="flex flex-col gap-1">
              <FieldLabel label={`${t.bottom} (${t.optional})`} right={`${Array.from(bottomText).length}/${assets.bottomText.max}`} />
              <input type="text" value={bottomText} maxLength={assets.bottomText.max} placeholder={t.bottomPh}
                onChange={(e) => setBottomText(e.target.value)} className={inputClass} />
            </label>
          )}
        </div>
      )}

      {assets.layouts.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.layout} />
          <div className="flex flex-wrap gap-1.5">
            {assets.layouts.map((l) => (
              <button key={l.id} type="button" onClick={() => setLayout(l.id)} className={pillClass(layout === l.id)} aria-pressed={layout === l.id}>
                <LayoutIcon id={l.id} />
                {isTurkish ? l.label : l.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {showJoiner && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.joiner} />
          <div className="flex flex-wrap gap-1.5">
            {assets.joiners.map((j) => (
              <button key={j.id} type="button" onClick={() => setJoiner(j.id)} className={pillClass(joiner === j.id)} aria-pressed={joiner === j.id}>
                {isTurkish ? j.label : j.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {assets.frames.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.frame} />
          <div className="flex flex-wrap gap-1.5">
            {assets.frames.map((fr) => (
              <button key={fr.id} type="button" onClick={() => setFrame(fr.id)} className={pillClass(frame === fr.id)} aria-pressed={frame === fr.id}>
                <FrameIcon id={fr.id} />
                {isTurkish ? fr.label : fr.labelEn}
              </button>
            ))}
          </div>
          {frame === 'circle-text' && hasTexts && <span className="text-[11px] text-gray-400">{t.ringHint}</span>}
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

      {assets.colors.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t.color} />
          <div className="flex flex-wrap gap-1.5">
            {assets.colors.map((c) => (
              <button key={c.hex} type="button" onClick={() => setColor(c.hex)} className={pillClass(color === c.hex)} aria-pressed={color === c.hex}>
                <span className="h-3.5 w-3.5 rounded-full border border-gray-300" style={{ background: c.hex }} />
                {isTurkish ? c.label : c.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}
    </GeneratorModalShell>
  );
}
