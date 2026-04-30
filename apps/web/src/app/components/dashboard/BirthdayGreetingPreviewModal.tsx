"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Send, RefreshCw } from "lucide-react";
import { getBirthdayGreetingPreview, sendBirthdayGreeting } from "@/app/actions/birthday-greetings";
import type { BirthdayGreetingPreviewOk } from "@/app/actions/birthday-greetings";
import { useToast } from "@/app/components/Toast";

/** Náhled e-mailu: výška podle scrollHeight dokumentu ve vrstvě iframe (sandbox allow-same-origin). */
function EmailHtmlPreviewIframe({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pixelHeight, setPixelHeight] = useState(0);

  const fitHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      const h =
        doc?.documentElement?.scrollHeight ?? doc?.documentElement?.offsetHeight ?? doc?.body?.scrollHeight ?? 0;
      if (h > 0) setPixelHeight(Math.ceil(h + 24));
    } catch {
      setPixelHeight(0);
    }
  }, []);

  useEffect(() => {
    setPixelHeight(0);
  }, [html]);

  const fallbackPx =
    typeof window !== "undefined" ? Math.min(Math.round(window.innerHeight * 0.65), 900) : 560;

  return (
    <iframe
      ref={iframeRef}
      title="Náhled e-mailu"
      sandbox="allow-same-origin"
      srcDoc={html}
      className="w-full rounded-xl border border-[color:var(--wp-border)] bg-white shadow-inner"
      style={{
        height: pixelHeight > 0 ? `${pixelHeight}px` : `${fallbackPx}px`,
        minHeight: 360,
      }}
      onLoad={fitHeight}
    />
  );
}

export function BirthdayGreetingPreviewModal({
  contactId,
  open,
  onClose,
}: {
  contactId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<BirthdayGreetingPreviewOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyPlain, setBodyPlain] = useState("");

  useEffect(() => {
    if (!open || !contactId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      const res = await getBirthdayGreetingPreview(contactId);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setLoadErr(res.message);
        setPreview(null);
        return;
      }
      setPreview(res);
      setSubject(res.subject);
      setBodyPlain(res.bodyPlain);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId]);

  const refreshPreview = useCallback(async () => {
    if (!contactId) return;
    setRefreshing(true);
    const res = await getBirthdayGreetingPreview(contactId, { subject, bodyPlain });
    setRefreshing(false);
    if (!res.ok) {
      showToast(res.message, "error");
      return;
    }
    setPreview(res);
  }, [contactId, subject, bodyPlain, showToast]);

  const handleSend = async () => {
    if (!contactId) return;
    setSending(true);
    const res = await sendBirthdayGreeting({ contactId, subject, bodyPlain });
    setSending(false);
    if (!res.ok) {
      showToast(res.message, "error");
      return;
    }
    showToast("Blahopřání bylo odesláno.", "success");
    onClose();
    router.refresh();
  };

  if (!open) return null;

  const themeLabel = preview?.theme === "birthday_gif" ? "birthday_gif" : "premium_dark";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="birthday-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Zavřít"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--wp-border)] px-5 py-4">
          <div>
            <h2 id="birthday-modal-title" className="text-lg font-black text-[color:var(--wp-text)]">
              Náhled blahopřání
            </h2>
            {preview ? (
              <p className="mt-1 text-xs font-medium text-[color:var(--wp-text-secondary)]">
                {preview.contactName}
                {preview.blockReason ? ` — ${preview.blockReason}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-surface-muted)]"
            aria-label="Zavřít"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[color:var(--wp-text-secondary)]">
              <Loader2 className="animate-spin" size={22} />
              <span className="text-sm font-medium">Načítám náhled…</span>
            </div>
          ) : loadErr ? (
            <p className="py-8 text-center text-sm font-medium text-rose-600">{loadErr}</p>
          ) : preview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-indigo-500/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  Šablona: {themeLabel}
                </span>
                {preview.alreadySentToday ? (
                  <span className="rounded-lg bg-emerald-500/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Dnes již odesláno
                  </span>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                  Předmět
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                  Text zprávy (prostý text, odstavce prázdným řádkem)
                </label>
                <textarea
                  value={bodyPlain}
                  onChange={(e) => setBodyPlain(e.target.value)}
                  rows={10}
                  className="w-full resize-y rounded-xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)]"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                    Preheader (v náhledu v e-mailu)
                  </span>
                  <button
                    type="button"
                    onClick={() => void refreshPreview()}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[#5A4BFF] hover:bg-indigo-500/10 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                    Aktualizovat náhled
                  </button>
                </div>
                <p className="rounded-lg bg-[color:var(--wp-surface-muted)] px-3 py-2 text-xs text-[color:var(--wp-text-secondary)]">
                  {preview.preheader}
                </p>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                  HTML náhled
                </p>
                <EmailHtmlPreviewIframe html={preview.html} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--wp-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-[color:var(--wp-border)] px-4 text-sm font-bold text-[color:var(--wp-text-secondary)]"
          >
            Zavřít
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!preview?.canSend || sending || loading || !!loadErr}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-black text-white shadow-md shadow-orange-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            Odeslat
          </button>
        </div>
      </div>
    </div>
  );
}
