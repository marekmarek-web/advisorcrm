"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

export function DocumentPreviewToggle({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const previewUrl = `/api/documents/${documentId}/download`;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-indigo-600 font-bold hover:text-indigo-800 transition-colors"
      >
        {open ? "Skrýt náhled" : "Zobrazit náhled"}
      </button>
      {open && (
        <div className={`mt-2 rounded-xl border border-slate-200 overflow-hidden ${expanded ? "fixed inset-4 z-50 shadow-2xl bg-white" : ""}`}>
          {expanded && (
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-600">Náhled dokumentu</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                aria-label="Zavřít rozšířený náhled"
              >
                <Minimize2 size={14} />
              </button>
            </div>
          )}
          <div className="relative">
            {!expanded && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-white/90 border border-slate-200 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 transition-colors shadow-sm"
                aria-label="Rozbalit náhled"
              >
                <Maximize2 size={14} />
              </button>
            )}
            <iframe
              src={previewUrl}
              className="w-full"
              style={{ height: expanded ? "calc(100vh - 80px)" : 480 }}
              title="PDF náhled"
            />
          </div>
        </div>
      )}
    </div>
  );
}
