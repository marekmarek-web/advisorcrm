"use client";

import { useState } from "react";
import { exportContactDataForClient } from "@/app/actions/gdpr";

export function ClientZoneExportButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const data = await exportContactDataForClient();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-dat-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg px-4 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover disabled:opacity-50"
    >
      {loading ? "Připravuji…" : "Export mých dat (GDPR)"}
    </button>
  );
}
