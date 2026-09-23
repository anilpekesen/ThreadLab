import { useState } from 'react';

export interface WordArtShapeOption {
  id: string;
  label: string;
  labelEn: string;
  /** 100x100 kutuda SVG yolu; harf şeklinde boş */
  path: string;
}

export interface WordArtAssets {
  templateName: string;
  layoutMode: 'wordart';
  shapes: WordArtShapeOption[];
  fonts: Array<{ id: string; label: string }>;
  palettes: Array<{ id: string; label: string; labelEn: string; colors: string[] }>;
  maxWords: number;
  maxWordLength: number;
  sampleWords: string[];
  defaultLetter: string;
}

export interface WordArtChoices {
  shape?: string;
  letter?: string;
  font?: string;
  palette?: string;
  variant?: number;
}

interface Props {
  assets: WordArtAssets;
  isTurkish: boolean;
  /** Pencere daha önce kullanıldıysa son kelimeler ve seçimler */
  initial?: { words: string; choices: WordArtChoices } | null;
  /** Kelimeleri ve seçimleri sunucuya gönderip hazır tasarımın adresini alır */
  onRender: (words: string, choices: WordArtChoices) => Promise<{ url: string }>;
  onCancel: () => void;
  onConfirm: (url: string) => void;
}

/** Sunucunun sınırıyla aynı; aşan deneme şablonun kendi dizilimine döner */
const MAX_VARIANT = 20;

/**
 * Kelime sanatı penceresi.
 *
 * Müşteri kelimelerini satır satır yazar, şekil/font/renk seçer. Yerleşim
 * sunucuda yapılır ve dönen şeffaf PNG onaylanınca ürünün üstüne konur.
 * Fotoğraf yüklenmediği için telif onayı istenmiyor.
 */
export default function TemplateWordArtModal({ assets, isTurkish, initial, onRender, onCancel, onConfirm }: Props) {
  // Önceki seçim şablonda artık kapalıysa ilk izinli değere dönülür
  const pick = <T extends { id: string }>(list: T[], id: string | undefined) =>
    (id && list.some((x) => x.id === id) ? id : list[0]?.id) ?? '';
  const prev = initial?.choices;
  const [words, setWords] = useState(() => initial?.words || assets.sampleWords.join('\n'));
  const [shape, setShape] = useState(() => pick(assets.shapes, prev?.shape) || 'heart');
  const [letter, setLetter] = useState(prev?.letter || assets.defaultLetter || 'A');
  const [font, setFont] = useState(() => pick(assets.fonts, prev?.font));
  const [palette, setPalette] = useState(() => pick(assets.palettes, prev?.palette));
  const [variant, setVariant] = useState(prev?.variant ?? 0);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = isTurkish
    ? { title: 'Kelime tasarımını oluştur', words: 'Kelimeler', wordsHint: 'Her satıra bir kelime ya da isim yazın. Başına * koyduğunuz kelime büyük yazılır.',
        shape: 'Şekil', letter: 'Harf', font: 'Yazı tipi', colors: 'Renkler',
        make: 'Tasarımı Oluştur', again: 'Başka dizilim', ok: 'Bunu Kullan', cancel: 'Vazgeç', edit: 'Düzenle',
        busy: 'Hazırlanıyor…', count: 'kelime', tooMany: 'En fazla', empty: 'En az bir kelime yazın' }
    : { title: 'Create your word design', words: 'Words', wordsHint: 'Write one word or name per line. Put * in front of a word to make it big.',
        shape: 'Shape', letter: 'Letter', font: 'Font', colors: 'Colours',
        make: 'Create Design', again: 'Another layout', ok: 'Use This', cancel: 'Cancel', edit: 'Edit',
        busy: 'Preparing…', count: 'words', tooMany: 'At most', empty: 'Write at least one word' };

  const lines = words.split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
  const overLimit = lines.length > assets.maxWords;

  const render = async (nextVariant = variant) => {
    if (lines.length === 0) { setError(t.empty); return; }
    setBusy(true);
    setError('');
    try {
      const result = await onRender(lines.slice(0, assets.maxWords).join('\n'), {
        shape,
        letter: shape === 'letter' ? letter : undefined,
        font,
        palette,
        variant: nextVariant,
      });
      setPreview(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const shuffleLayout = () => {
    const next = (variant + 1) % (MAX_VARIANT + 1);
    setVariant(next);
    void render(next);
  };

  const pill = (active: boolean) =>
    `flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
      active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
    }`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-bold text-gray-900">{t.title}</p>
          <button type="button" onClick={onCancel} className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {preview ? (
            <img src={preview} alt={assets.templateName}
              className="mx-auto max-h-[52vh] w-auto rounded-xl border border-gray-100 bg-[repeating-conic-gradient(#f4f4f4_0%_25%,transparent_0%_50%)] bg-[length:14px_14px] object-contain" />
          ) : (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between text-xs font-semibold text-gray-600">
                  {t.words}
                  <span className={`text-[10px] font-normal ${overLimit ? 'text-red-500' : 'text-gray-400'}`}>
                    {lines.length}/{assets.maxWords} {t.count}
                  </span>
                </span>
                <textarea
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  rows={6}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm leading-snug outline-none focus:border-gray-400"
                />
                <span className="text-[11px] text-gray-400">
                  {overLimit ? `${t.tooMany} ${assets.maxWords} ${t.count}; ` : ''}{t.wordsHint}
                </span>
              </label>

              {assets.shapes.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-gray-600">{t.shape}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {assets.shapes.map((s) => (
                      <button key={s.id} type="button" onClick={() => setShape(s.id)} className={pill(shape === s.id)} aria-pressed={shape === s.id}>
                        <svg width="16" height="16" viewBox="0 0 100 100" aria-hidden="true">
                          {s.path
                            ? <path d={s.path} fill="currentColor" />
                            : <text x="50" y="84" textAnchor="middle" fontSize="92" fontWeight="900" fill="currentColor">A</text>}
                        </svg>
                        {isTurkish ? s.label : s.labelEn}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {shape === 'letter' && (
                <label className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-600">{t.letter}</span>
                  <input
                    type="text"
                    value={letter}
                    maxLength={1}
                    onChange={(e) => setLetter(e.target.value.toLocaleUpperCase(isTurkish ? 'tr-TR' : 'en-US'))}
                    className="w-14 rounded-xl border border-gray-200 px-3 py-2 text-center text-base font-bold uppercase outline-none focus:border-gray-400"
                  />
                </label>
              )}

              {assets.fonts.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-gray-600">{t.font}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {assets.fonts.map((f) => (
                      <button key={f.id} type="button" onClick={() => setFont(f.id)} className={pill(font === f.id)} aria-pressed={font === f.id}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {assets.palettes.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-gray-600">{t.colors}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {assets.palettes.map((p) => (
                      <button key={p.id} type="button" onClick={() => setPalette(p.id)} className={pill(palette === p.id)} aria-pressed={palette === p.id}>
                        <span className="flex">
                          {p.colors.slice(0, 5).map((c) => (
                            <span key={c} className="-mr-1 h-3 w-3 rounded-sm border border-gray-300" style={{ background: c }} />
                          ))}
                        </span>
                        <span className="ml-1">{isTurkish ? p.label : p.labelEn}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-[11px] font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3">
          {preview && (
            <button type="button" onClick={() => setPreview('')}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
              {t.edit}
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-500">
            {t.cancel}
          </button>
          {preview ? (
            <>
              <button type="button" onClick={shuffleLayout} disabled={busy}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40">
                {busy ? t.busy : t.again}
              </button>
              <button type="button" onClick={() => onConfirm(preview)} disabled={busy}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
                {t.ok}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => render()} disabled={busy || lines.length === 0}
              className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
              {busy ? t.busy : t.make}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
