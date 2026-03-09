"use client";

import { useState, useRef, useEffect } from "react";

interface CellTextProps {
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  className?: string;
}

export function CellText({ value, onChange, editable = false, className = "" }: CellTextProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setInputVal(value), [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

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
    return (
      <div
        className={`min-h-[28px] flex items-center px-2 py-1 text-[13px] text-monday-text cursor-text ${className}`}
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title="Klikněte pro úpravu"
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
