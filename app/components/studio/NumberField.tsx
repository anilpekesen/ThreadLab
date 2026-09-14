import { useEffect, useState } from "react";
import { TextField } from "@shopify/polaris";

/**
 * Ölçü girişi. Değer dışarıda hesaplanıp yuvarlanıyor; kutu doğrudan ona
 * bağlanınca "12," yazan kullanıcının virgülü anında siliniyordu. Kutu odakta
 * iken kendi metnini tutuyor, geçerli her sayıyı hemen iletiyor ve odaktan
 * çıkınca dışarıdaki değere dönüyor.
 */
export function NumberField({
  label, value, onCommit, suffix = "mm", min, step = 0.5, labelHidden = false, disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  suffix?: string;
  min?: number;
  step?: number;
  labelHidden?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(format(value));

  useEffect(() => {
    if (!focused) setText(format(value));
  }, [value, focused]);

  return (
    <TextField
      label={label}
      labelHidden={labelHidden}
      type="number"
      step={step}
      min={min}
      autoComplete="off"
      disabled={disabled}
      suffix={suffix}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(v) => {
        setText(v);
        const n = Number(v.replace(",", "."));
        if (v.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onCommit(n);
      }}
    />
  );
}

function format(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "";
}
