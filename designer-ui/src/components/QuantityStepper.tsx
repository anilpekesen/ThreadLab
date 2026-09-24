import { useEffect, useState } from 'react';

/**
 * Adet kutusu — eksi/artı düğmeleri ve doğrudan yazılabilen bir sayı.
 *
 * Toplu alan müşteriler (10 tişört, 25 bardak) artı düğmesine onlarca kez
 * basmak zorunda kalıyordu. Sayı artık bir girdi: tıklayıp 10 yazmak yetiyor.
 * Yazarken serbest bırakılıyor, odak çıkınca sınırlara çekiliyor — yazarken
 * araya girip düzeltmek imleci zıplatıyor.
 */

export function QuantityStepper({
  value, onChange, min = 0, max = 999, size = 'md', label, locale,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** sm: beden ızgarasındaki dar hücreler, md: tek adetli ürün */
  size?: 'sm' | 'md';
  label?: string;
  locale?: string;
}) {
  const isTurkish = !locale || locale.startsWith('tr');
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  // Dışarıdan değişince (düğmeler, beden sıfırlama) kutu da güncellensin
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const kucuk = size === 'sm';
  const btn = kucuk
    ? 'flex h-5 w-5 items-center justify-center rounded-md bg-white text-xs font-bold text-gray-400 shadow-sm hover:bg-gray-100'
    : 'flex h-6 w-6 items-center justify-center rounded-lg bg-white text-sm font-bold text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-700';

  function commit(raw: string) {
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <div className={cn('flex items-center', kucuk ? 'gap-0.5' : 'gap-1')}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={isTurkish ? (label ? `${label} azalt` : 'Azalt') : (label ? `Decrease ${label}` : 'Decrease')}
        className={cn(btn, value <= min && 'opacity-40')}
      >−</button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        aria-label={label ?? (isTurkish ? 'Adet' : 'Quantity')}
        onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={(e) => { setEditing(false); commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur(); }
        }}
        className={cn(
          'rounded-md border border-transparent bg-transparent text-center tabular-nums',
          'focus:border-blue-300 focus:bg-white focus:outline-none',
          kucuk ? 'h-5 w-7 text-xs font-bold' : 'h-6 w-9 text-sm font-black',
          value > min ? 'text-blue-700' : 'text-gray-400',
        )}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={isTurkish ? (label ? `${label} artır` : 'Artır') : (label ? `Increase ${label}` : 'Increase')}
        className={cn(btn, value >= max && 'opacity-40')}
      >+</button>
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
