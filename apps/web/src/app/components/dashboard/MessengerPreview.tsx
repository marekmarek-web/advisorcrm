"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getRecentConversations, type RecentConversation } from "@/app/actions/messages";

function timeAgo(isoOrDate: string | Date): string {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const now = new Date();
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "teď";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} d`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#ff642e", "#485fed", "#e5534b"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SIDE_PANEL_GRADIENTS = [
  "from-emerald-400 to-emerald-600",
  "from-orange-400 to-rose-500",
  "from-indigo-400 to-purple-600",
  "from-sky-400 to-blue-600",
  "from-violet-400 to-fuchsia-600",
  "from-amber-400 to-orange-500",
] as const;

function sidePanelGradientClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return SIDE_PANEL_GRADIENTS[Math.abs(hash) % SIDE_PANEL_GRADIENTS.length];
}

type MessengerPreviewProps = {
  embedded?: boolean;
  forDarkPanel?: boolean;
  /** Viz UX sidecalendar v2 — gradient avatary, unread tečka, odkaz do zpráv. */
  variant?: "default" | "sidePanelV2";
};

export function MessengerPreview({
  embedded,
  forDarkPanel,
  variant = "default",
}: MessengerPreviewProps) {
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRecentConversations(5)
      .then((rows) => {
        setConversations(rows);
      })
      .catch((err) => {
        console.error("[MessengerPreview] getRecentConversations failed", err);
        setConversations([]);
        setError("Zprávy se nepodařilo načíst.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (variant === "sidePanelV2") {
    return (
      <div className="pt-0">
        <h3 className="font-display mb-4 ml-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)]">
          Zprávy z portálu
        </h3>
        {loading ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám…</p>
        ) : error ? (
          <p className="text-sm text-rose-600 font-semibold">{error}</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné nedávné zprávy.</p>
        ) : (
          <>
            <div className="space-y-3">
              {conversations.map((c) => (
                <Link
                  key={c.contactId}
                  href={`/portal/messages?contact=${encodeURIComponent(c.contactId)}`}
                  className="relative flex cursor-pointer gap-4 rounded-2xl border border-[color:var(--wp-sc-card-border)] bg-[color:var(--wp-sc-card-bg)] p-4 text-inherit shadow-sm backdrop-blur-md transition-colors hover:border-indigo-200 hover:bg-[color:var(--wp-message-box-hover)] hover:shadow-md dark:hover:border-indigo-500/30 no-underline"
                >
                  {c.unread ? (
                    <div
                      className="absolute top-1/2 -left-1.5 h-3 w-3 -translate-y-1/2 animate-pulse rounded-full bg-indigo-500 shadow-md shadow-indigo-300 dark:shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${sidePanelGradientClass(c.contactName)} text-sm font-bold text-white shadow-lg`}
                  >
                    {getInitials(c.contactName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h4
                        className={`truncate text-sm font-bold ${
                          c.unread ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-secondary)]"
                        }`}
                      >
                        {c.contactName}
                      </h4>
                      <span className="shrink-0 text-[10px] font-bold uppercase text-[color:var(--wp-text-tertiary)]">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </div>
                    <p
                      className={`truncate text-xs ${
                        c.unread
                          ? "font-semibold text-indigo-600 dark:text-indigo-300"
                          : "text-[color:var(--wp-text-secondary)]"
                      }`}
                    >
                      {c.senderType === "advisor" ? "Vy: " : ""}
                      {c.lastMessage}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <Link
              href="/portal/messages"
              className="group mt-4 ml-1 flex items-center gap-2 text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Otevřít chat <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </>
        )}
      </div>
    );
  }

  const dark = !!forDarkPanel;

  return (
    <div className={embedded ? "pt-0" : dark ? "pt-0" : "pt-6 border-t border-[color:var(--wp-surface-card-border)]"}>
      {!embedded && (
        <div className="mb-4 flex items-center justify-between">
          <h3
            className={`text-xs font-black uppercase tracking-widest ${
              dark ? "text-aidv-text-muted-on-dark" : "text-[color:var(--wp-text-tertiary)]"
            }`}
          >
            Zprávy z portálu
          </h3>
          {!loading && conversations.length > 0 && conversations.some((c) => c.unread) && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-[10px] font-black text-rose-600">
              {conversations.filter((c) => c.unread).length}
            </span>
          )}
        </div>
      )}
      {embedded && !loading && conversations.length > 0 && conversations.some((c) => c.unread) && (
        <div className="mb-2 flex justify-end">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-[10px] font-black text-rose-600">
            {conversations.filter((c) => c.unread).length}
          </span>
        </div>
      )}

      {loading ? (
        <p className={`text-sm ${dark ? "text-aidv-text-muted-on-dark" : "text-[color:var(--wp-text-secondary)]"}`}>Načítám…</p>
      ) : error ? (
        <p className="text-sm font-semibold text-rose-600">{error}</p>
      ) : conversations.length === 0 ? (
        <p className={`text-sm ${dark ? "text-aidv-text-muted-on-dark" : "text-[color:var(--wp-text-secondary)]"}`}>
          Žádné nedávné zprávy.
        </p>
      ) : (
        <div className="space-y-3">
          {conversations.map((c) => (
            <Link
              key={c.contactId}
              href={`/portal/contacts/${c.contactId}#aktivita`}
              className={
                dark
                  ? "flex cursor-pointer gap-4 rounded-2xl border border-[color:var(--wp-sc-card-border)] bg-[color:var(--wp-sc-card-bg)] p-4 text-inherit no-underline shadow-sm backdrop-blur-md transition-all hover:border-indigo-300/40 hover:bg-[color:var(--wp-message-box-hover)]"
                  : "flex cursor-pointer gap-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4 text-inherit no-underline transition-all hover:bg-[color:var(--wp-surface-card)] hover:shadow-sm"
              }
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: avatarColor(c.contactName) }}
              >
                {getInitials(c.contactName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline justify-between">
                  <h4
                    className={`truncate pr-2 text-sm ${
                      dark
                        ? c.unread
                          ? "font-black text-[color:var(--wp-text)]"
                          : "font-bold text-[color:var(--wp-text-muted)]"
                        : c.unread
                          ? "font-black text-[color:var(--wp-text)]"
                          : "font-bold text-[color:var(--wp-text-secondary)]"
                    }`}
                  >
                    {c.contactName}
                  </h4>
                  <span
                    className={`shrink-0 text-[10px] font-bold ${dark ? "text-[color:var(--wp-text-muted)]" : "text-[color:var(--wp-text-tertiary)]"}`}
                  >
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </div>
                <p
                  className={`truncate text-xs ${
                    dark
                      ? c.unread
                        ? "font-semibold text-[color:var(--wp-text)]"
                        : "text-[color:var(--wp-text-muted)]"
                      : c.unread
                        ? "font-bold text-[color:var(--wp-text)]"
                        : "text-[color:var(--wp-text-secondary)]"
                  }`}
                >
                  {c.senderType === "advisor" ? "Vy: " : ""}
                  {c.lastMessage}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!embedded && (
        <Link
          href="/portal/contacts"
          className={`mt-3 inline-block text-xs font-semibold hover:underline ${
            dark ? "text-indigo-300 hover:text-white" : "text-indigo-600"
          }`}
        >
          Otevřít chat
        </Link>
      )}
      {embedded && (
        <Link href="/portal/contacts" className="mt-3 inline-block text-xs font-semibold text-indigo-600 hover:underline">
          Všechny zprávy →
        </Link>
      )}
    </div>
  );
}
