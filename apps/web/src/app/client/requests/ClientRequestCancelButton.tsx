"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelClientPortalRequest } from "@/app/actions/client-portal-requests";
import { useToast } from "@/app/components/Toast";

export function ClientRequestCancelButton({
  requestId,
  onAfterCancel,
}: {
  requestId: string;
  /** Např. obnovení lokálního stavu v mobilním shellu po `router.refresh()`. */
  onAfterCancel?: () => void | Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function onConfirm() {
    startTransition(async () => {
      try {
        const res = await cancelClientPortalRequest(requestId);
        if (!res.success) {
          toast.showToast(res.error, "error");
          return;
        }
        toast.showToast("Požadavek byl zrušen.", "success");
        setConfirmOpen(false);
        router.refresh();
        await onAfterCancel?.();
      } catch (e) {
        toast.showToast(e instanceof Error ? e.message : "Zrušení se nepodařilo.", "error");
      }
    });
  }

  if (confirmOpen) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end w-full md:w-auto">
        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">Opravdu zrušit tento požadavek?</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={pending}
            className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 text-sm font-bold text-[color:var(--wp-text)] hover:bg-[color:var(--wp-main-scroll-bg)]"
          >
            Ne
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="min-h-[44px] rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {pending ? "Ruším…" : "Ano, zrušit"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmOpen(true)}
      className="min-h-[44px] shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-800 hover:bg-rose-100 w-full sm:w-auto"
    >
      Zrušit požadavek
    </button>
  );
}
