"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Send, Sparkles, X } from "lucide-react";

type ChatItem = { role: "user" | "assistant"; text: string };
type AssistantSuggestion = { id: string; label: string; href: string };

export function AiSupportButton({
  anchorClassName = "bottom-5 right-5",
  variant = "floating",
  onOpenChange,
}: {
  anchorClassName?: string;
  variant?: "floating" | "header";
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([
    {
      role: "assistant",
      text: "Ahoj, jsem nápověda k tomuto portálu. Pomůžu najít sekce, nahrát dokument nebo napsat poradci — neřeším investice, pojištění ani úvěry; to patří vašemu poradci.",
    },
  ]);
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([
    { id: "openMessages", label: "Napsat poradci", href: "/client/messages" },
    { id: "openRequests", label: "Vytvořit požadavek", href: "/client/requests" },
    { id: "openDocuments", label: "Nahrát dokument", href: "/client/documents" },
  ]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setChat((prev) => [...prev, { role: "user", text: trimmed }]);
    setMessage("");
    try {
      const res = await fetch("/api/ai/client-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Odpověď se nepodařilo načíst.");
        return;
      }
      setChat((prev) => [...prev, { role: "assistant", text: String(data.message ?? "") }]);
      if (Array.isArray(data.suggestions)) {
        setSuggestions(
          data.suggestions
            .filter((s: unknown) => {
              if (!s || typeof s !== "object") return false;
              const value = s as { id?: unknown; label?: unknown; href?: unknown };
              return (
                typeof value.id === "string" &&
                typeof value.label === "string" &&
                typeof value.href === "string"
              );
            })
            .map((s: { id: string; label: string; href: string }) => ({
              id: s.id,
              label: s.label,
              href: s.href,
            }))
        );
      }
    } catch {
      setError("Odpověď se nepodařilo načíst.");
    } finally {
      setLoading(false);
    }
  }

  const trigger =
    variant === "header" ? (
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group relative grid h-11 w-11 place-items-center rounded-full bg-white text-violet-600 shadow-sm ring-1 ring-slate-200/60 transition-all active:scale-95"
        aria-label={open ? "Zavřít nápovědu k portálu" : "Otevřít nápovědu k portálu"}
        aria-expanded={open}
      >
        <Sparkles size={18} />
      </button>
    ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative p-[2.5px] rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-900/20 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 min-h-[44px]"
          aria-label="Otevřít nápovědu k portálu"
        >
          <span className="bg-white rounded-full px-5 min-h-[44px] py-2.5 flex items-center justify-center gap-2">
            <Sparkles size={16} className="text-purple-500" />
            <span className="font-black text-[color:var(--wp-text)] text-sm tracking-wide">Nápověda k portálu</span>
          </span>
        </button>
    );

  return (
    <div className={variant === "header" ? "relative z-50" : `fixed z-50 ${anchorClassName}`}>
      {trigger}
      {open ? (
        <div
          className={
            variant === "header"
              ? "fixed right-3 top-[calc(var(--safe-area-top)+4.75rem)] z-[80] w-[360px] max-w-[calc(100vw-24px)] bg-white border border-[color:var(--wp-surface-card-border)] rounded-3xl shadow-2xl p-4 client-scale-in"
              : "mt-2 w-[360px] max-w-[calc(100vw-24px)] bg-white border border-[color:var(--wp-surface-card-border)] rounded-3xl shadow-2xl p-4 client-scale-in"
          }
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-purple-500" />
              <h3 className="font-black text-[color:var(--wp-text)] text-sm">Nápověda k portálu</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text-secondary)]"
              aria-label="Zavřít panel nápovědy"
            >
              <X size={15} />
            </button>
          </div>
          <p className="text-[11px] leading-snug text-[color:var(--wp-text-secondary)] border-l-2 border-indigo-300 pl-2.5 mb-3">
            Odpovědi jsou pouze informativní a týkají se ovládání portálu. Nejde o finanční, investiční ani pojistnou radu —
            ty řeší výhradně váš poradce.
          </p>
          <div className="max-h-[260px] overflow-y-auto rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-3 space-y-2 mb-3">
            {chat.map((item, idx) => (
              <div
                key={`${item.role}-${idx}`}
                className={`rounded-lg px-3 py-2 text-sm ${
                  item.role === "assistant"
                    ? "bg-white text-[color:var(--wp-text)] border border-[color:var(--wp-surface-card-border)]"
                    : "bg-indigo-600 text-white ml-6"
                }`}
              >
                {item.text}
              </div>
            ))}
          </div>
          {error ? <p className="text-xs text-rose-600 mb-2">{error}</p> : null}
          <div className="flex gap-2 mb-3">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Dotaz k portálu…"
              className="flex-1 min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px]"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !message.trim()}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-indigo-600 text-white grid place-items-center disabled:opacity-60"
              aria-label="Odeslat zprávu"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {suggestions.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-sm font-semibold text-[color:var(--wp-text)] hover:bg-[color:var(--wp-main-scroll-bg)]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
