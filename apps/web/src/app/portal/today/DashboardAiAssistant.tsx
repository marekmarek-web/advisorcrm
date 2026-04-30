"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
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

function urgentHref(item: UrgentItem): string {
  if (item.type === "review") return `/portal/contracts/review/${item.entityId}`;
  if (item.type === "task") return "/portal/tasks";
  if (item.type === "client") return `/portal/contacts/${item.entityId}`;
  return "#";
}

function metricToneClass(tone: string): string {
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200";
  if (tone === "info") return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-200";
  return "border-[color:var(--wp-surface-card-border)] bg-white/70 text-[color:var(--wp-text-secondary)] dark:bg-white/5";
}

function severityDotClass(severity: UrgentItem["severity"]): string {
  if (severity === "high") return "bg-rose-500";
  if (severity === "medium") return "bg-amber-500";
  return "bg-indigo-500";
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
    "group relative flex min-h-[280px] flex-col overflow-hidden rounded-[var(--wp-radius-card)] border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-white to-indigo-500/8 p-5 text-[color:var(--wp-text)] shadow-[0_24px_70px_-52px_rgba(79,70,229,.45)] transition-colors hover:border-fuchsia-500/30 dark:border-fuchsia-400/20 dark:from-fuchsia-500/12 dark:via-slate-950/70 dark:to-indigo-500/10 sm:p-6 lg:p-8";

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
  const primaryAction = suggestedActions[0] ?? null;
  const priority = summary?.prioritySummary;
  const metrics = priority?.metrics ?? [
    { key: "overdue", label: "Po termínu", value: summary?.overdueTasks.length ?? 0, tone: "danger" as const },
    { key: "today", label: "Dnes", value: summary?.tasksDueToday.length ?? 0, tone: "warning" as const },
    { key: "review", label: "Review", value: summary?.contractsWaitingForReview.length ?? 0, tone: "info" as const },
  ];

  return (
    <div ref={rootRef} className={cardShell}>
      <span
        className="pointer-events-none absolute -right-8 -top-8 flex h-44 w-44 items-center justify-center overflow-visible opacity-[0.12] transition-transform duration-700 will-change-transform group-hover:rotate-6 dark:opacity-[0.18]"
        aria-hidden
      >
        <AiAssistantBrandIcon size={176} className="h-full max-h-[176px] w-full max-w-[176px] object-contain" />
      </span>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.06] pointer-events-none dark:opacity-[0.08]" aria-hidden />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-500/15 bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-700 shadow-sm dark:bg-white/10 dark:text-fuchsia-100">
              <Sparkles size={12} />
              Interní AI náhled
            </div>
            <h2
              className="max-w-2xl text-[22px] font-black leading-tight tracking-tight text-[color:var(--wp-text)] sm:text-2xl lg:text-[28px]"
              style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif" }}
            >
              {priority?.headline ?? summary?.assistantSummaryText ?? "Dnešní priority jsou připravené."}
            </h2>
            <p className="mt-2 max-w-xl text-sm font-medium text-[color:var(--wp-text-secondary)]">
              {priority?.primaryFocus ? `Hlavní fokus: ${priority.primaryFocus}.` : "Krátký interní podklad pro poradce, ne doporučení klientovi."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAiDrawerOpen(true)}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-[0_18px_40px_-24px_rgba(15,23,42,.75)] transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
          >
            Otevřít chat
            <ArrowRight size={16} className="ml-2" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.slice(0, 4).map((m) => (
            <div key={m.key} className={`rounded-2xl border px-3 py-2.5 ${metricToneClass(m.tone)}`}>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-75">{m.label}</div>
              <div className="mt-1 text-2xl font-black leading-none">{m.value}</div>
            </div>
          ))}
        </div>

        {primaryAction && (
          <button
            type="button"
            onClick={() => handleAction(primaryAction)}
            className="flex min-h-[52px] w-full items-center justify-between rounded-2xl border border-indigo-500/20 bg-white/80 px-4 py-3 text-left shadow-sm transition-colors hover:bg-white dark:bg-white/10 dark:hover:bg-white/15"
          >
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">První krok</span>
              <span className="mt-0.5 block text-sm font-black text-[color:var(--wp-text)]">{priority?.primaryActionLabel ?? primaryAction.label}</span>
            </span>
            <ArrowRight size={18} className="ml-3 shrink-0 text-indigo-500" />
          </button>
        )}

        {topUrgent.length > 0 ? (
          <div className="space-y-2">
            {topUrgent.slice(0, 4).map((u: UrgentItem) => (
              <Link
                key={`${u.type}-${u.entityId}`}
                href={urgentHref(u)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white/70 px-3 py-2.5 text-left transition-colors hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${severityDotClass(u.severity)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-[color:var(--wp-text)]">{u.title}</span>
                  {u.recommendedAction ? (
                    <span className="block truncate text-xs font-medium text-[color:var(--wp-text-secondary)]">{u.recommendedAction}</span>
                  ) : null}
                </span>
                <ArrowRight size={14} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white/70 px-4 py-3 text-sm font-semibold text-[color:var(--wp-text-secondary)] dark:bg-white/5">
            Nevidím žádné urgentní položky. Zkontrolujte průběžně úkoly, kalendář nebo review frontu.
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          {suggestedActions.slice(1, 4).map((a, i) => (
            <button
              key={`${a.type}-${i}`}
              type="button"
              onClick={() => handleAction(a)}
              className="inline-flex min-h-[40px] items-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white/70 px-3 py-2 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
            >
              {a.label.length > 30 ? a.label.slice(0, 28) + "…" : a.label}
            </button>
          ))}
          <Link
            href="/portal/team-overview"
            className="inline-flex min-h-[40px] items-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white/70 px-3 py-2 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
          >
            AI playbook týmu
          </Link>
          <Link
            href="/portal/business-plan"
            className="inline-flex min-h-[40px] items-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white/70 px-3 py-2 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
          >
            AI guidance plánu
          </Link>
        </div>
      </div>
    </div>
  );
}
