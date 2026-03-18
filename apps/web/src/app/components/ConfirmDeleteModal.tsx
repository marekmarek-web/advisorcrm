"use client";

import { useEffect, useRef } from "react";
import { BaseModal } from "./BaseModal";

interface ConfirmDeleteModalProps {
  open: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDeleteModal({
  open,
  title = "Opravdu smazat?",
  message,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDeleteModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <BaseModal open={open} onClose={onCancel} title={title} maxWidth="sm" mobileVariant="sheet">
      <div className="p-4">
        {message && <p className="text-slate-600 text-sm mt-1">{message}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 min-h-[44px] text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg px-4 min-h-[44px] text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Mažu..." : "Smazat"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
