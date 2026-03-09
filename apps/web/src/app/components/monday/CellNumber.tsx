"use client";

import { useState, useRef, useEffect } from "react";

interface CellNumberProps {
  value: number | string;
  onChange: (value: string) => void;
  className?: string;
}

export function CellNumber({ value, onChange, className = "" }: CellNumberProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputVal(String(value ?? ""));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const v = inputVal.trim();
    onChange(v);
  }

  return (
    <div className={`min-h-[28px] flex items-center ${className}`}>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setInputVal(String(value ?? ""));
              setEditing(false);
            }
          }}
          className="w-full h-7 px-2 text-sm text-monday-text bg-monday-surface border border-monday-blue rounded focus:outline-none monday-tabular"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left px-2 py-1 text-sm text-monday-text monday-tabular hover:bg-monday-row-hover rounded min-h-[28px]"
        >
          {value !== "" && value !== undefined ? String(value) : "—"}
        </button>
      )}
    </div>
  );
}
