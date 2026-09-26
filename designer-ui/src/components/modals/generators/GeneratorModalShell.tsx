import type { ReactNode } from 'react';
import { luminance } from './garment';
import { tx } from '../../../i18n';

/**
 * Üretici pencerelerinin ortak iskeleti: başlık, form ya da önizleme,
 * alt düğmeler. Kelime sanatı penceresiyle aynı görünüm ve akış.
 */
export default function GeneratorModalShell({
  title, isTurkish, preview, previewAlt, busy, error, canMake,
  onMake, onEdit, onCancel, onConfirm, onAgain, againLabel, children, backdrop,
}: {
  /** Önizleme zemini: tişörtün rengi. Yoksa damalı (şeffaf) zemin. */
  backdrop?: string | null;
  title: string;
  isTurkish: boolean;
  /** Sunucudan dönen tasarım adresi; varsa form yerine gösterilir */
  preview: string;
  previewAlt: string;
  busy: boolean;
  error: string;
  canMake: boolean;
  onMake: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** Önizlemede isteğe bağlı ikinci düğme (ör. "Başka dizilim") */
  onAgain?: () => void;
  againLabel?: string;
  children: ReactNode;
}) {
  const t = tx({ make: 'Tasarımı Oluştur', ok: 'Bunu Kullan', cancel: 'Vazgeç', edit: 'Düzenle', busy: 'Hazırlanıyor…' }, { make: 'Create Design', ok: 'Use This', cancel: 'Cancel', edit: 'Edit', busy: 'Preparing…' });
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-bold text-gray-900">{title}</p>
          <button type="button" onClick={onCancel} className="rounded-full px-2 py-1 text-sm text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {preview ? (
            <div className={`rounded-xl border border-gray-100 p-3 ${backdrop ? '' : 'bg-[repeating-conic-gradient(#f4f4f4_0%_25%,transparent_0%_50%)] bg-[length:14px_14px]'}`}
              style={backdrop ? { background: backdrop } : undefined}>
              <img src={preview} alt={previewAlt} className="mx-auto max-h-[52vh] w-auto object-contain" />
              {backdrop && (
                <p className="mt-2 text-center text-[10px]" style={{ color: luminance(backdrop) < 0.35 ? '#d1d5db' : '#6b7280' }}>
                  {tx('Tişört renginde önizleme', 'Preview on the shirt color')}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">{children}</div>
          )}
          {error && <p className="mt-3 text-[11px] font-medium text-red-600">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3">
          {preview && (
            <button type="button" onClick={onEdit} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
              {t.edit}
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-500">{t.cancel}</button>
          {preview ? (
            <>
              {onAgain && (
                <button type="button" onClick={onAgain} disabled={busy}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40">
                  {busy ? t.busy : againLabel}
                </button>
              )}
              <button type="button" onClick={onConfirm} disabled={busy}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">{t.ok}</button>
            </>
          ) : (
            <button type="button" onClick={onMake} disabled={busy || !canMake}
              className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
              {busy ? t.busy : t.make}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pencerelerde ortak form parçaları */
export function FieldLabel({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <span className="flex items-baseline justify-between text-xs font-semibold text-gray-600">
      {label}
      {right != null && <span className="text-[10px] font-normal text-gray-400">{right}</span>}
    </span>
  );
}

export const inputClass = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400';

export function pillClass(active: boolean) {
  return `flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
    active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
  }`;
}
