"use client";

import { useState } from "react";

interface CellDateProps {
  value: string;
  onChange?: (value: string) => void;
}

export function CellDate({ value, onChange }: CellDateProps) {
  const [editing, setEditing] = useState(false);

  if (editing && onChange) {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="w-full h-7 px-1.5 text-[13px] bg-transparent border border-monday-blue rounded focus:outline-none text-monday-text"
        autoFocus
      />
    );
  }

  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <div
      className="min-h-[28px] flex items-center px-1.5 text-[13px] text-monday-text cursor-text"
      onClick={() => onChange && setEditing(true)}
    >
      {display || <span className="text-monday-text-muted">—</span>}
    </div>
  );
}
