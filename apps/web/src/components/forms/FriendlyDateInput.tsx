"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCzDate, formatCzDateTyping, validateCzDateComplete } from "@/lib/forms/cz-date";

type Props = {
  id?: string;
  label: string;
  /** Uložená hodnota pro API/DB: ISO yyyy-mm-dd; v poli se vždy zobrazuje česky den. měsíc. rok. */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  /** Přepíše výchozí styl inputu (např. wizard výpovědi). */
  inputClassName?: string;
  /** Přepíše výchozí styl popisku. */
  labelClassName?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function FriendlyDateInput({
  id,
  label,
  value,
  onChange,
  className = "",
  inputClassName,
  labelClassName,
  disabled,
  placeholder = "např. 13. 9. 2026",
}: Props) {
  const [text, setText] = useState(() => formatCzDate(value) || "");
  const [error, setError] = useState<string | null>(null);
  const skipSyncRef = useRef(false);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync z prop ISO → zobrazení
    setText(formatCzDate(value) || "");
  }, [value]);

  const commitDisplay = useCallback(
    (display: string) => {
      setText(display);
      const v = validateCzDateComplete(display.trim());
      const digitLen = display.replace(/\D/g, "").length;
      if (v.ok) {
        setError(null);
        skipSyncRef.current = true;
        onChange(v.iso);
      } else {
        if (digitLen >= 8) setError(v.message || null);
        else setError(null);
        onChange("");
      }
    },
    [onChange],
  );

  function handleChange(raw: string) {
    commitDisplay(formatCzDateTyping(raw));
  }

  function handleBlur() {
    if (!text.trim()) {
      setError(null);
      onChange("");
      return;
    }
    const v = validateCzDateComplete(text);
    if (v.ok) {
      setError(null);
      setText(formatCzDate(v.iso) || text);
      onChange(v.iso);
    } else if (text.replace(/\D/g, "").length > 0) {
      setError(v.message || "Neúplné datum.");
    }
  }

  const defaultInputClass =
    "w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm min-h-[44px] text-[color:var(--wp-text)] bg-[color:var(--wp-surface)] outline-none transition focus:border-[var(--wp-accent)] focus:ring-2 focus:ring-[var(--wp-accent)]/20";
  const inputClass = inputClassName ?? defaultInputClass;
  const labelClass = labelClassName ?? "mb-1 block text-xs font-medium text-[color:var(--wp-text-muted)]";

  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={inputClass}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
