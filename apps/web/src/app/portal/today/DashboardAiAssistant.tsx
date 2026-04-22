"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { useToast } from "@/app/components/Toast";
import { useAiAssistantDrawer } from "@/app/portal/AiAssistantDrawerContext";
import type { UrgentItem, SuggestedAction, DashboardSummary } from "@/lib/ai/dashboard-types";

function getHref(action: SuggestedAction): string | null {
  if (action.type === "open_review" && action.payload.reviewId) {
    return `/portal/contracts/review/${action.payload.reviewId}`;
  }
  if (action.type === "view_client" && action.payload.clientId) {
    return `/portal/contacts/${action.payload.clientId}`;
  }
  if (action.type === "open_task") {
    return "/portal/tasks";
  }
  if (action.type === "open_portal_path" && typeof action.payload.path === "string") {
    const p = action.payload.path;
    if (p.startsWith("/portal/")) return p;
  }
  return null;
}

export function DashboardAiAssistant() {
  const router = useRouter();
  const toast = useToast();
  const { setOpen: setAiDrawerOpen } = useAiAssistantDrawer();
  const rootRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [phase, setPhase] = useState<"deferred" | "loading" | "ready" | "error">("deferred");
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai/dashboard-summary");
      if (!res.ok) throw new Error("Načtení shrnutí selhalo.");
      const data = await res.json();
      setSummary(data);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (cancelled || startedRef.current) return;
      startedRef.current = true;
      void loadSummary();
    };
    const el = rootRef.current;
    const io =
      el &&
      new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) start();
        },
        { rootMargin: "320px", threshold: 0 },
      );
    if (el && io) io.observe(el);
    const idleId =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(() => start(), { timeout: 3500 })
        : undefined;
    const t = window.setTimeout(start, 4500);
    return () => {
      cancelled = true;
      io?.disconnect();
      if (idleId !== undefined && typeof cancelIdleCallback !== "undefined") cancelIdleCallback(idleId);
      clearTimeout(t);
    };
  }, [loadSummary]);

  const handleDraftEmail = async (clientId: string) => {
    try {
      const res = await fetch("/api/ai/assistant/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, context: "follow_up" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.showToast(data.error ?? "Návrh e-mailu selhal.", "error");
        return;
      }
      const text = `${data.subject}\n\n${data.body}`;
      await navigator.clipboard.writeText(text);
      toast.showToast("Návrh e-mailu zkopírován do schránky.", "success");
    } catch {
      toast.showToast("Kopírování selhalo.", "error");
    }
  };

  const handleAction = (action: SuggestedAction) => {
    const href = getHref(action);
    if (href) {
      router.push(href);
      return;
    }
    if (action.type === "draft_email" && action.payload.clientId) {
      handleDraftEmail(action.payload.clientId as string);
      return;
    }
    if (action.type === "create_task") {
      router.push("/portal/tasks");
    }
  };

  const cardShell =
    "group relative flex min-h-[280px] cursor-pointer flex-col justify-center overflow-hidden rounded-[var(--wp-radius-card)] border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/10 to-indigo-500/5 p-8 text-[color:var(--wp-text)] transition-colors hover:border-fuchsia-500/30 dark:border-fuchsia-400/20 dark:from-fuchsia-500/12 dark:to-indigo-500/8";

  if (phase === "deferred" || phase === "loading") {
    return (
      <div ref={rootRef} className={`${cardShell} items-center justify-center`}>
        <div className="animate-pulse flex flex-col items-center gap-3">
          <AiAssistantBrandIcon size={40} className="opacity-25" />
          <span className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
            {phase === "deferred" ? "Připravuji…" : "Načítám…"}
          </span>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div ref={rootRef} className={cardShell}>
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-2">{error}</p>
        <button
          type="button"
          onClick={() => {
            startedRef.current = false;
            void loadSummary();
          }}
          className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  const topUrgent = (summary?.urgentItems ?? []).slice(0, 5);
  const suggestedActions = summary?.suggestedActions ?? [];

  return (
    <div ref={rootRef} className={cardShell}>
      <span
        className="pointer-events-none absolute -right-8 -top-8 flex h-44 w-44 items-center justify-center overflow-visible opacity-[0.12] transition-transform duration-700 will-change-transform group-hover:rotate-6 dark:opacity-[0.18]"
        aria-hidden
      >
        <AiAssistantBrandIcon size={176} className="h-full max-h-[176px] w-full max-w-[176px] object-contain" />
      </span>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.06] pointer-events-none dark:opacity-[0.08]" aria-hidden />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <h2 className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-[color:var(--wp-text-muted)]">AI Asistent</h2>

        <h3
          className="mb-6 max-w-lg text-xl font-bold leading-tight text-[color:var(--wp-text)] sm:text-2xl"
          style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
          {summary?.assistantSummaryText ?? "Načítám…"}
        </h3>

        {topUrgent.length > 0 && (
          <div className="mb-5 space-y-2">
            {topUrgent.map((u: UrgentItem) => (
              <Link
                key={`${u.type}-${u.entityId}`}
                href={
                  u.type === "review"
                    ? `/portal/contracts/review/${u.entityId}`
                    : u.type === "task"
                      ? "/portal/tasks"
                      : u.type === "client"
                        ? `/portal/contacts/${u.entityId}`
                        : "#"
                }
                className="flex w-full items-center justify-between rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80 px-4 py-2.5 text-left text-sm text-[color:var(--wp-text)] transition-colors hover:bg-[color:var(--wp-surface-muted)]"
              >
                <span className="flex-1 truncate">{u.title}</span>
                <ArrowRight size={14} className="ml-2 shrink-0 text-[color:var(--wp-text-tertiary)]" />
              </Link>
            ))}
          </div>
        )}

        {suggestedActions.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {suggestedActions.slice(0, 4).map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleAction(a)}
                className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80 px-3 py-2 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)]"
              >
                {a.label.length > 28 ? a.label.slice(0, 26) + "…" : a.label}
              </button>
            ))}
          </div>
        )}
        <div className="mb-5 flex flex-wrap gap-2">
          <Link
            href="/portal/team-overview"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80 px-3 py-2 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)]"
          >
            AI playbook týmu
          </Link>
          <Link
            href="/portal/business-plan"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80 px-3 py-2 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)]"
          >
            AI guidance plánu
          </Link>
        </div>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setAiDrawerOpen(true)}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] px-6 py-3.5 text-sm font-bold tracking-wide text-[color:var(--wp-text)] transition-colors hover:bg-[color:var(--wp-surface-muted)] sm:inline-flex sm:w-auto"
          >
            Otevřít asistenta
            <ArrowRight size={16} className="ml-2 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
