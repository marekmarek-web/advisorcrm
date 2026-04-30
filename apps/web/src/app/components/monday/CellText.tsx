"use client";

import { useState, useRef, useEffect } from "react";

interface CellTextProps {
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  className?: string;
  /** Dvojklik otevře detail (např. položku nástěnky); jednoduchý klik zůstane na úpravu textu. */
  onDetailDoubleClick?: () => void;
}

export function CellText({
  value,
  onChange,
  editable = false,
  className = "",
  onDetailDoubleClick,
}: CellTextProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickToEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setInputVal(value), [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (clickToEditTimerRef.current) clearTimeout(clickToEditTimerRef.current);
    };
  }, []);

  function commit() {
    setEditing(false);
    const v = inputVal.trim();
    if (onChange) onChange(v);
  }

  if (editable && editing) {
    return (
      <div className={`min-h-[28px] flex items-center ${className}`}>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setInputVal(value); setEditing(false); }
          }}
          className="w-full h-7 px-2 text-[13px] border border-monday-blue rounded-[6px] focus:outline-none"
        />
      </div>
    );
  }

  if (editable && onChange) {
    const delayedEditMs = onDetailDoubleClick ? 280 : 0;
    return (
      <div
        className={`min-h-[28px] flex items-center px-2 py-1 text-[13px] text-monday-text cursor-text ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          if (clickToEditTimerRef.current) clearTimeout(clickToEditTimerRef.current);
          if (delayedEditMs <= 0) {
            setEditing(true);
            return;
          }
          clickToEditTimerRef.current = setTimeout(() => {
            clickToEditTimerRef.current = null;
            setEditing(true);
          }, delayedEditMs);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (clickToEditTimerRef.current) {
            clearTimeout(clickToEditTimerRef.current);
            clickToEditTimerRef.current = null;
          }
          if (onDetailDoubleClick) {
            onDetailDoubleClick();
            return;
          }
          setEditing(true);
        }}
        title={onDetailDoubleClick ? "Kliknutí pro úpravu · dvojklik otevře detail položky" : "Klikněte pro úpravu"}
      >
        {value || "—"}
      </div>
    );
  }

  return (
    <div className={`min-h-[28px] flex items-center px-2 py-1 text-[13px] text-monday-text ${className}`} title={value || undefined}>
      {value || "—"}
    </div>
  );
}
