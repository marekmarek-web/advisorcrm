"use client";

import { useState, useEffect, useCallback } from "react";
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
  return null;
}

export function DashboardAiAssistant() {
  const router = useRouter();
  const toast = useToast();
  const { setOpen: setAiDrawerOpen } = useAiAssistantDrawer();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/dashboard-summary");
      if (!res.ok) throw new Error("Načtení shrnutí selhalo.");
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
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

  if (loading && !summary) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-[32px] border border-white/10 bg-gradient-to-br from-aidv-surface-dark to-indigo-950 p-8 text-white">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <AiAssistantBrandIcon size={28} className="opacity-80" />
          <span className="text-sm text-indigo-200">Načítám…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[280px] flex-col justify-center rounded-[32px] border border-white/10 bg-gradient-to-br from-aidv-surface-dark to-indigo-950 p-8 text-white">
        <p className="text-sm text-rose-300 mb-2">{error}</p>
        <button
          type="button"
          onClick={loadSummary}
          className="text-sm font-medium text-indigo-300 hover:text-indigo-100 hover:underline"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  const topUrgent = (summary?.urgentItems ?? []).slice(0, 5);
  const suggestedActions = summary?.suggestedActions ?? [];

  return (
    <div className="group relative flex min-h-[280px] cursor-pointer flex-col justify-center overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-aidv-surface-dark to-indigo-950 p-8 text-white shadow-lg shadow-black/25 transition-colors hover:border-indigo-500/50">
      <span
        className="absolute -top-6 -right-6 flex h-40 w-40 items-center justify-center overflow-visible pointer-events-none transition-transform duration-700 will-change-transform group-hover:rotate-12"
        aria-hidden
      >
        <AiAssistantBrandIcon
          size={160}
          className="h-full max-h-[160px] w-full max-w-[160px] object-contain opacity-[0.18]"
        />
      </span>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white p-1.5 shadow-sm">
            <AiAssistantBrandIcon size={28} className="max-h-full max-w-full" />
          </div>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-200">AI Asistent</h2>
        </div>

        <h3 className="text-xl sm:text-2xl font-bold text-white mb-6 leading-tight max-w-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
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
                className="flex items-center justify-between w-full px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-left text-sm border border-white/10 transition-colors"
              >
                <span className="truncate flex-1">{u.title}</span>
                <ArrowRight size={14} className="shrink-0 ml-2 text-indigo-300" />
              </Link>
            ))}
          </div>
        )}

        {suggestedActions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {suggestedActions.slice(0, 4).map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleAction(a)}
                className="text-xs px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-indigo-100 transition-colors"
              >
                {a.label.length > 28 ? a.label.slice(0, 26) + "…" : a.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-5">
          <Link
            href="/portal/team-overview"
            className="text-xs px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-indigo-100 transition-colors min-h-[44px] inline-flex items-center"
          >
            AI playbook týmu
          </Link>
          <Link
            href="/portal/business-plan"
            className="text-xs px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-indigo-100 transition-colors min-h-[44px] inline-flex items-center"
          >
            AI guidance plánu
          </Link>
        </div>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setAiDrawerOpen(true)}
            className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-xl border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-bold tracking-wide text-white transition-colors hover:bg-white/15 sm:inline-flex sm:w-auto"
          >
            Otevřít asistenta <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
