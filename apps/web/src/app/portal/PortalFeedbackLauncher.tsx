"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Bug, Lightbulb, Loader2, X } from "lucide-react";
import { useToast } from "@/app/components/Toast";

export function PortalFeedbackLauncher({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"bug" | "idea">("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const reset = useCallback(() => {
    setTitle("");
    setBody("");
    setCategory("bug");
  }, []);

  const submit = useCallback(async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      toast.showToast("Vyplňte předmět a popis.", "error");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/portal/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title: t,
          body: b,
          pageUrl: typeof window !== "undefined" ? `${window.location.origin}${pathname}` : pathname,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.showToast(data.error ?? "Odeslání selhalo.", "error");
        return;
      }
      toast.showToast("Děkujeme, zpráva byla uložena.", "success");
      reset();
      setOpen(false);
    } catch {
      toast.showToast("Odeslání selhalo.", "error");
    } finally {
      setSending(false);
    }
  }, [body, category, pathname, reset, title, toast]);

  const positionClass =
    variant === "mobile"
      ? "left-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-floating-ai"
      : "right-4 bottom-[5.5rem] md:right-6 md:bottom-[5.5rem] z-floating-ai";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Nahlásit bug nebo návrh"
        className={`fixed ${positionClass} min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center bg-white border-2 border-slate-200 text-slate-700 shadow-md hover:bg-slate-50 hover:border-indigo-300 active:scale-95 transition-all`}
        aria-label="Zpětná vazba"
      >
        <Bug size={22} className="text-indigo-600" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-feedback-title"
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <h2 id="portal-feedback-title" className="text-base font-bold text-slate-900">
                Zpětná vazba
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Zavřít"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory("bug")}
                  className={`min-h-[44px] rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 ${
                    category === "bug" ? "border-rose-400 bg-rose-50 text-rose-900" : "border-slate-200 text-slate-600"
                  }`}
                >
                  <Bug size={16} /> Nahlásit bug
                </button>
                <button
                  type="button"
                  onClick={() => setCategory("idea")}
                  className={`min-h-[44px] rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 ${
                    category === "idea" ? "border-amber-400 bg-amber-50 text-amber-950" : "border-slate-200 text-slate-600"
                  }`}
                >
                  <Lightbulb size={16} /> Návrh zlepšení
                </button>
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Předmět</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full px-3 py-2.5 min-h-[44px] border border-slate-200 rounded-xl text-sm"
                  placeholder="Stručně (např. Kalendář se neuloží)"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Popis</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={8000}
                  rows={5}
                  className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-y min-h-[120px]"
                  placeholder="Co se stalo, co očekáváte, kroky k reprodukci…"
                />
              </label>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 font-bold text-sm text-slate-700"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void submit()}
                className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : null}
                Odeslat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
