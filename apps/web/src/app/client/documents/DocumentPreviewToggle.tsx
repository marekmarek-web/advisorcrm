"use client";

import { useState } from "react";

export function DocumentPreviewToggle({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-monday-blue font-medium hover:underline"
      >
        {open ? "Skrýt náhled" : "Zobrazit náhled"}
      </button>
      {open && (
        <iframe
          src={`/api/documents/${documentId}/download`}
          className="mt-2 w-full rounded border border-monday-border"
          style={{ height: 500 }}
          title="PDF náhled"
        />
      )}
    </div>
  );
}
