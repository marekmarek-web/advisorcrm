"use client";

import React, { useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  User,
  Shield,
  Heart,
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Check,
  Edit2,
  RotateCcw,
  Info,
  Activity,
  Filter,
  Building2,
  Clock,
  Eye,
  CreditCard,
  Stethoscope,
  ListChecks,
  Wrench,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { getDocumentTypeLabel } from "@/lib/ai/document-messages";
import type { PrimaryDocumentType } from "@/lib/ai/document-review-types";
import { formatAiClassifierForAdvisor } from "@/lib/ai-review/czech-labels";
import type {
  ExtractionDocument,
  ExtractedGroup,
  ExtractedField,
  AIRecommendation,
  DraftAction,
  FieldFilter,
  FieldStatus,
  ExtractionReviewState,
  PaymentSyncPreview,
} from "@/lib/ai-review/types";

const ICON_MAP: Record<string, React.ElementType> = {
  User,
  FileText,
  Shield,
  Heart,
  Building2,
};

function getIcon(name: string) {
  return ICON_MAP[name] ?? FileText;
}

/** Čitelný typ dokumentu: classifier labely, jinak mapa primárního typu, jinak původní řetězec z API. */
function documentTypeDisplayLine(doc: ExtractionDocument): string {
  const aiRaw = doc.extractionTrace?.aiClassifierJson as Record<string, string> | undefined;
  if (aiRaw && (aiRaw.documentType || aiRaw.productFamily)) {
    return formatAiClassifierForAdvisor(aiRaw);
  }
  const label = doc.documentType?.trim() ?? "";
  if (!label) return "Neurčeno";
  if (/[·•]/.test(label) || /[áčďéěíňóřšťúůýž]/i.test(label)) {
    return label;
  }
  const phrase = getDocumentTypeLabel(label as PrimaryDocumentType);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/* ─── Field Styles ──────────────────────────────────────────────── */

function fieldInputClass(status: FieldStatus) {
  const map: Record<FieldStatus, string> = {
    success:
      "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 text-[color:var(--wp-text)]",
    warning:
      "border-amber-300 bg-amber-50 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-100 text-amber-900",
    error:
      "border-rose-300 bg-rose-50 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-100 text-rose-900",
  };
  return map[status];
}

/* ─── Recommendation icon ───────────────────────────────────────── */

function RecIcon({ type }: { type: AIRecommendation["type"] }) {
  switch (type) {
    case "warning":
      return <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />;
    case "insight":
      return <Lightbulb size={18} className="text-indigo-500 shrink-0 mt-0.5" />;
    case "opportunity":
      return <TrendingUp size={18} className="text-emerald-500 shrink-0 mt-0.5" />;
    case "compliance":
      return <ShieldCheck size={18} className="text-orange-500 shrink-0 mt-0.5" />;
    case "next_step":
      return <ArrowRight size={18} className="text-blue-500 shrink-0 mt-0.5" />;
  }
}

function recTypeBadge(type: AIRecommendation["type"]) {
  const map: Record<AIRecommendation["type"], { label: string; cls: string }> = {
    warning: { label: "Upozornění", cls: "bg-amber-100 text-amber-700" },
    insight: { label: "Zjištění", cls: "bg-indigo-100 text-indigo-700" },
    opportunity: { label: "Příležitost", cls: "bg-emerald-100 text-emerald-700" },
    compliance: { label: "Kontrola", cls: "bg-orange-100 text-orange-700" },
    next_step: { label: "Další krok", cls: "bg-blue-100 text-blue-700" },
  };
  const v = map[type];
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${v.cls}`}>
      {v.label}
    </span>
  );
}

/* ─── Section Navigation ────────────────────────────────────────── */

const SECTIONS = [
  { id: "summary", label: "Shrnutí" },
  { id: "data", label: "Pole k ověření" },
  { id: "recommendations", label: "Kontroly a akce" },
] as const;

function SectionNav({ onScrollTo }: { onScrollTo: (id: string) => void }) {
  return (
    <nav className="flex gap-1 overflow-x-auto py-2 px-1 hide-scrollbar">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => onScrollTo(s.id)}
          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors whitespace-nowrap"
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

/* ─── Filter Bar ────────────────────────────────────────────────── */

const FILTERS: { value: FieldFilter; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "warning", label: "K ověření" },
  { value: "error", label: "Chyby" },
  { value: "edited", label: "Upravené" },
  { value: "unconfirmed", label: "Nepotvrzené" },
];

function FilterBar({
  active,
  onChange,
  warningCount,
  errorCount,
}: {
  active: FieldFilter;
  onChange: (f: FieldFilter) => void;
  warningCount: number;
  errorCount: number;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter size={14} className="text-[color:var(--wp-text-tertiary)]" />
      {FILTERS.map((f) => {
        const count =
          f.value === "warning"
            ? warningCount
            : f.value === "error"
              ? errorCount
              : null;
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
              active === f.value
                ? "bg-indigo-100 text-indigo-700"
                : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
            }`}
          >
            {f.label}
            {count != null && count > 0 && (
              <span className="ml-1 text-[9px]">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Document Meta Header ──────────────────────────────────────── */

function DocumentMetaHeader({ doc }: { doc: ExtractionDocument }) {
  const providerLabel =
    doc.extractionProvider === "adobe"
      ? "Adobe OCR"
      : doc.extractionProvider === "mixed"
        ? "Kombinované"
        : "Interní AI";
  const statusMap: Record<
    ExtractionDocument["reviewStatus"],
    { label: string; className: string }
  > = {
    pending: { label: "K revizi", className: "text-amber-600" },
    in_review: { label: "V řešení", className: "text-indigo-600" },
    approved: { label: "Schváleno", className: "text-emerald-600" },
    rejected: { label: "Zamítnuto", className: "text-rose-600" },
    applied: { label: "Zapsáno do CRM", className: "text-emerald-700" },
  };
  const reviewStatus = statusMap[doc.reviewStatus] ?? statusMap.pending;
  return (
    <div>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
          <FileText size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-display font-black text-[color:var(--wp-text)] tracking-tight truncate">
            {doc.fileName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-[color:var(--wp-text-secondary)] mt-1">
            <span className="text-indigo-600">{documentTypeDisplayLine(doc)}</span>
            <span className="h-1 w-1 rounded-full bg-[color:var(--wp-text-tertiary)]" />
            <span className="flex items-center gap-1">
              <User size={12} /> {doc.clientName}
            </span>
            <span className="h-1 w-1 rounded-full bg-[color:var(--wp-text-tertiary)]" />
            <span className="flex items-center gap-1">
              <Clock size={12} /> {doc.uploadTime}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1.5">
            <span>{doc.pageCount} stran</span>
            <span className="w-1 h-1 bg-[color:var(--wp-surface-card-border)] rounded-full" />
            <span>Zdroj: {doc.uploadSource}</span>
            <span className="w-1 h-1 bg-[color:var(--wp-surface-card-border)] rounded-full" />
            <span>Zpracování: {providerLabel}</span>
            <span className="w-1 h-1 bg-[color:var(--wp-surface-card-border)] rounded-full" />
            <span>Zpracováno: {doc.lastProcessedAt}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <div className="flex items-center gap-2 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl px-3 py-2 shadow-sm">
          <Activity size={14} className="text-indigo-500" />
          <span className="text-xs font-black text-[color:var(--wp-text-secondary)]">
            Celková jistota:{" "}
            <span className="text-indigo-600">{doc.globalConfidence}%</span>
          </span>
        </div>
        <div className="flex items-center gap-2 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl px-3 py-2 shadow-sm">
          <Eye size={14} className="text-[color:var(--wp-text-tertiary)]" />
          <span className="text-xs font-black text-[color:var(--wp-text-secondary)]">
            Status: <span className={reviewStatus.className}>{reviewStatus.label}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Executive Summary ─────────────────────────────────────────── */

function AdvisorOverviewCard({ doc }: { doc: ExtractionDocument }) {
  const ar = doc.advisorReview;
  if (!ar) return null;
  const row = (icon: React.ReactNode, title: string, body: string) => (
    <div className="flex gap-3 py-3 border-b border-[color:var(--wp-surface-card-border)] last:border-0">
      <div className="shrink-0 mt-0.5 text-indigo-500">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
          {title}
        </p>
        <p className="text-sm font-semibold text-[color:var(--wp-text)] leading-snug break-words">{body}</p>
      </div>
    </div>
  );
  return (
    <div
      data-section="advisor"
      className="bg-[color:var(--wp-surface-card)] rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5"
    >
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-1 flex items-center gap-2">
        <ListChecks size={14} className="text-indigo-500" /> Přehled pro poradce
      </h3>
      <p className="text-xs text-[color:var(--wp-text-tertiary)] mb-4 leading-relaxed">
        Strukturovaný výstup z extrakce — interní podklad, ne náhrada vašeho posouzení.
      </p>
      {ar.llmExecutiveBrief ? (
        <div className="mb-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 flex items-center gap-2">
            <Sparkles size={14} className="text-indigo-500" /> Shrnutí (AI)
          </p>
          <div className="text-sm font-medium text-[color:var(--wp-text)] leading-relaxed break-words whitespace-pre-wrap">
            {ar.llmExecutiveBrief}
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 px-4">
        {row(<FileText size={18} />, "Rozpoznání dokumentu", ar.recognition)}
        {row(<User size={18} />, "Klient", ar.client)}
        {row(<Shield size={18} />, "Produkt / smlouva", ar.product)}
        {row(<CreditCard size={18} />, "Platby", ar.payments)}
        {row(<Stethoscope size={18} />, "Zdravotní / citlivé údaje", ar.healthSensitive)}
      </div>
      {ar.paymentSyncPreview ? (
        <PaymentSyncPreviewCard preview={ar.paymentSyncPreview} />
      ) : null}
      {ar.manualChecklist.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-900 mb-2 flex items-center gap-2">
            <AlertTriangle size={14} /> Ruční kontrola
          </p>
          <ul className="text-sm text-amber-950 space-y-2 list-disc pl-4">
            {ar.manualChecklist.map((item, i) => (
              <li key={i} className="leading-snug">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Payment Sync Preview Card ────────────────────────────────── */

function PaymentSyncPreviewCard({ preview }: { preview: PaymentSyncPreview }) {
  const isSyncing = preview.status === "will_sync";
  const isDraft = preview.status === "will_draft";
  const isBlocked = preview.status === "blocked_missing_fields";
  const isSkipped = preview.status === "skipped_modelation";

  const borderCls = isSyncing
    ? "border-emerald-200 bg-emerald-50/60"
    : isDraft
      ? "border-amber-200 bg-amber-50/60"
      : isBlocked
        ? "border-rose-200 bg-rose-50/60"
        : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40";

  const iconEl = isSyncing ? (
    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
  ) : isDraft ? (
    <AlertTriangle size={15} className="text-amber-600 shrink-0" />
  ) : isBlocked ? (
    <XCircle size={15} className="text-rose-600 shrink-0" />
  ) : (
    <MinusCircle size={15} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
  );

  const labelCls = isSyncing
    ? "text-emerald-900"
    : isDraft
      ? "text-amber-900"
      : isBlocked
        ? "text-rose-900"
        : "text-[color:var(--wp-text-secondary)]";

  return (
    <div className={`mt-3 rounded-xl border p-3 ${borderCls}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 flex items-center gap-1.5">
        <CreditCard size={12} /> Co se propíše při schválení
      </p>
      <p className={`text-xs font-bold flex items-start gap-1.5 leading-snug ${labelCls}`}>
        {iconEl}
        <span>{preview.summary}</span>
      </p>
      {preview.presentFields.length > 0 && (isSyncing || isDraft) ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {preview.presentFields.map((f) => (
            <div key={f.label} className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                {f.label}
              </span>
              <span className="text-[11px] font-bold text-[color:var(--wp-text)] truncate" title={f.value}>
                {f.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {preview.missingFields.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {preview.missingFields.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800"
            >
              <XCircle size={10} />
              {f.label}
            </span>
          ))}
        </div>
      ) : null}
      {preview.warnings.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {preview.warnings.map((w, i) => (
            <li key={i} className="text-[10px] text-amber-800 leading-snug flex items-start gap-1">
              <AlertTriangle size={10} className="shrink-0 mt-0.5" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ACTION_ROUTE_MAP: Record<string, string> = {
  create_client: "/portal/contacts/new",
  create_new_client: "/portal/contacts/new",
  create_or_link_client: "/portal/contacts/new",
  link_existing_client: "/portal/contacts",
  attach_to_existing_client: "/portal/contacts",
  link_client: "/portal/contacts",
  create_task: "/portal/tasks",
  create_service_task: "/portal/tasks",
  create_service_review_task: "/portal/tasks",
  create_task_followup: "/portal/tasks",
  create_manual_review_task: "/portal/tasks",
  link_household: "/portal/households",
  create_or_update_pipeline_deal: "/portal/pipeline",
  create_or_update_business_plan_item: "/portal/pipeline",
  create_opportunity: "/portal/pipeline",
  propose_financial_analysis_refresh: "/portal/analyses",
  propose_financial_analysis_update: "/portal/analyses",
  schedule_consultation: "/portal/tasks",
  prepare_comparison: "/portal/analyses",
};

function resolveActionHref(action: DraftAction): string | null {
  return ACTION_ROUTE_MAP[action.type] ?? null;
}

function WorkActionsCard({ doc }: { doc: ExtractionDocument }) {
  const actions = doc.draftActions ?? [];
  return (
    <div
      data-section="workflow"
      className="bg-[color:var(--wp-surface-card)] rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5"
    >
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-3 flex items-center gap-2">
        <Wrench size={14} className="text-indigo-500" /> Navrhované pracovní kroky
      </h3>
      <p className="text-xs text-[color:var(--wp-text-tertiary)] mb-4">
        Kliknutím otevřete příslušnou sekci portálu. Automatické akce se provedou při schválení nebo při zápisu do CRM.
      </p>
      {actions.length === 0 ? (
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          Zatím nejsou k dispozici žádné navázané návrhy kroků pro tento dokument.
        </p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a, i) => {
            const href = resolveActionHref(a);
            const baseClass =
              "flex items-center gap-2 text-sm font-medium rounded-xl px-4 py-3 border transition-colors w-full text-left";
            if (href) {
              return (
                <li key={`${a.type}-${i}`}>
                  <Link
                    href={href}
                    className={`${baseClass} text-indigo-700 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800 dark:hover:bg-indigo-900/40`}
                  >
                    <ExternalLink size={15} className="text-indigo-500 shrink-0" />
                    <span className="flex-1">{a.label}</span>
                    <ArrowRight size={14} className="text-indigo-400 shrink-0" />
                  </Link>
                </li>
              );
            }
            return (
              <li
                key={`${a.type}-${i}`}
                className={`${baseClass} text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)]/50 border-[color:var(--wp-surface-card-border)] cursor-default`}
                title="Tato akce se provede automaticky při schválení"
              >
                <ArrowRight size={15} className="text-indigo-400 shrink-0" />
                <span className="flex-1">{a.label}</span>
                <span className="text-[10px] text-[color:var(--wp-text-tertiary)] font-normal shrink-0">při schválení</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExecutiveSummaryCard({ doc }: { doc: ExtractionDocument }) {
  const { diagnostics: d } = doc;
  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-3 flex items-center gap-2">
        <Info size={14} className="text-indigo-500" /> Shrnutí dokumentu
      </h3>
      <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] leading-relaxed mb-4">
        {doc.executiveSummary}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Nalezeno polí" value={`${d.extractedFields}/${d.totalFields}`} color="indigo" />
        <StatBox label="K ověření" value={String(d.warningCount)} color="amber" />
        <StatBox label="Chyby" value={String(d.errorCount)} color="rose" />
        <StatBox label="Pokrytí" value={`${d.extractionCoverage}%`} color="emerald" />
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const bgMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${bgMap[color] ?? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"}`}>
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</div>
    </div>
  );
}

/* ─── AI Recommendations Card ───────────────────────────────────── */

function AIRecommendationsCard({
  recommendations,
  dismissedMap,
  onDismiss,
  onRestore,
  onCreateTask,
  onFieldClick,
}: {
  recommendations: AIRecommendation[];
  dismissedMap: Record<string, boolean>;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  onCreateTask: (rec: AIRecommendation) => void | Promise<void>;
  onFieldClick: (fieldId: string, page?: number) => void;
}) {
  const visible = recommendations.filter((r) => !dismissedMap[r.id]);
  const dismissed = recommendations.filter((r) => dismissedMap[r.id]);

  if (visible.length === 0 && dismissed.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-[20px] border border-indigo-100 shadow-sm p-4 md:p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
      <div className="relative z-10">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-800 mb-1 flex items-center gap-2">
          <AiAssistantBrandIcon size={16} className="shrink-0" />
          Kontroly a akce
          <span className="ml-auto text-indigo-500 font-bold text-[10px] normal-case tracking-normal">
            {visible.length} aktivních
          </span>
        </h3>
        <p className="text-[10px] text-indigo-700/80 font-medium leading-snug mb-4 pl-0.5">
          Zkontrolujte body níže před schválením nebo zápisem do CRM. U úkolu můžete nechat sledovat doplnění.
        </p>

        <div className="space-y-3">
          {visible.map((rec) => (
            <div
              key={rec.id}
              className="bg-[color:var(--wp-surface-card)]/80 backdrop-blur-sm p-4 rounded-xl border border-indigo-100/50 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <RecIcon type={rec.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {recTypeBadge(rec.type)}
                  </div>
                  <p className="text-sm font-bold text-[color:var(--wp-text)] leading-snug">
                    {rec.title}
                  </p>
                  <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1 leading-relaxed">
                    {rec.description}
                  </p>
                  {rec.linkedFieldIds.length > 0 && (
                    <button
                      onClick={() =>
                        onFieldClick(rec.linkedFieldIds[0], rec.linkedPage)
                      }
                      className="mt-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                    >
                      Zobrazit v dokumentu <ArrowRight size={12} />
                    </button>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void onCreateTask(rec)}
                      className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-100/50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Vytvořit úkol
                    </button>
                    <button
                      onClick={() => onDismiss(rec.id)}
                      className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Zahodit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {dismissed.length > 0 && (
          <div className="mt-3 pt-3 border-t border-indigo-100">
            <p className="text-[10px] font-bold text-indigo-400 mb-2">
              {dismissed.length} zahozených návrhů
            </p>
            {dismissed.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between py-1.5 text-xs text-[color:var(--wp-text-tertiary)]"
              >
                <span className="truncate">{rec.title}</span>
                <button
                  onClick={() => onRestore(rec.id)}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 ml-2 shrink-0"
                >
                  Obnovit
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Review Attention Banner ───────────────────────────────────── */

function ReviewAttentionBanner({
  warningCount,
  errorCount,
  onShowProblems,
}: {
  warningCount: number;
  errorCount: number;
  onShowProblems: () => void;
}) {
  if (warningCount === 0 && errorCount === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
      <AlertCircle size={16} className="text-amber-600 shrink-0" />
      <p className="text-xs font-medium text-amber-900 leading-snug flex-1 min-w-0">
        {errorCount > 0 && <span className="font-bold">{errorCount} chybí</span>}
        {errorCount > 0 && warningCount > 0 && " · "}
        {warningCount > 0 && <span>{warningCount} k ověření</span>}
        {" — "}zkontrolujte oproti PDF.
      </p>
      <button
        onClick={onShowProblems}
        className="text-[10px] font-black uppercase tracking-widest text-amber-700 hover:text-amber-900 transition-colors flex items-center gap-1 shrink-0"
      >
        Zobrazit <ArrowRight size={12} />
      </button>
    </div>
  );
}

/* ─── Extraction Diagnostics ────────────────────────────────────── */

function ExtractionDiagnosticsCard({ doc }: { doc: ExtractionDocument }) {
  const [open, setOpen] = useState(false);
  const { diagnostics: d } = doc;

  const ocrLabel: Record<string, string> = {
    good: "Dobrá",
    fair: "Průměrná",
    poor: "Špatná",
  };
  const ocrColor: Record<string, string> = {
    good: "text-emerald-600",
    fair: "text-amber-600",
    poor: "text-rose-600",
  };

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 md:px-6 py-4 flex items-center justify-between text-left"
      >
        <span className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] flex items-center gap-2">
          <Activity size={14} className="text-indigo-500" /> Diagnostika extrakce
        </span>
        {open ? <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" /> : <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />}
      </button>
      {open && (
        <div className="px-5 md:px-6 pb-5 pt-0 border-t border-[color:var(--wp-surface-card-border)]">
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                OCR kvalita
              </span>
              <p className={`font-bold ${ocrColor[d.ocrQuality]}`}>
                {ocrLabel[d.ocrQuality]}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Nevyřešená pole
              </span>
              <p className="font-bold text-[color:var(--wp-text)]">{d.unresolvedFieldCount}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Konflikty hodnot
              </span>
              <p className="font-bold text-[color:var(--wp-text)]">{d.conflictingValueCount}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Nečitelné strany
              </span>
              <p className="font-bold text-[color:var(--wp-text)]">
                {d.pagesWithoutReadableText.length === 0
                  ? "Žádné"
                  : d.pagesWithoutReadableText.join(", ")}
              </p>
            </div>
          </div>
          {d.notes.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {d.notes.map((note, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-[color:var(--wp-text-secondary)]"
                >
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 shrink-0" />
                  {note}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Extracted Field Row ───────────────────────────────────────── */

function ExtractedFieldRow({
  field,
  isActive,
  editedValue,
  isConfirmed,
  onFieldClick,
  onEdit,
  onConfirm,
  onRevert,
}: {
  field: ExtractedField;
  isActive: boolean;
  editedValue?: string;
  isConfirmed: boolean;
  onFieldClick: (fieldId: string, page?: number) => void;
  onEdit: (fieldId: string, value: string) => void;
  onConfirm: (fieldId: string) => void;
  onRevert: (fieldId: string) => void;
}) {
  const isEdited = editedValue !== undefined;
  const displayValue = editedValue ?? field.value;
  const hasBeenEdited = isEdited && editedValue !== field.originalAiValue;

  return (
    <div
      className={`relative flex flex-col transition-all ${
        field.status !== "success" ? "md:col-span-2" : ""
      } ${isActive ? "ring-2 ring-indigo-300 rounded-xl" : ""}`}
    >
      <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2 ml-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{field.label}</span>
          {isConfirmed && (
            <span className="inline-flex items-center gap-0.5 text-emerald-600">
              <Check size={10} /> OK
            </span>
          )}
          {hasBeenEdited && !isConfirmed && (
            <span className="text-blue-500 normal-case tracking-normal font-bold">
              upraveno
            </span>
          )}
        </span>
      </label>

      <div className="relative group/input">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => onEdit(field.id, e.target.value)}
          onClick={() => onFieldClick(field.id, field.page)}
          className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all border outline-none ${fieldInputClass(
            field.status
          )} ${isConfirmed ? "opacity-70" : ""}`}
          readOnly={isConfirmed}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/input:opacity-100 transition-all">
          {!isConfirmed && (
            <button
              onClick={() => onConfirm(field.id)}
              title="Potvrdit hodnotu"
              className="p-1.5 bg-[color:var(--wp-surface-card)] text-emerald-500 hover:text-emerald-700 rounded-md shadow-sm border border-[color:var(--wp-surface-card-border)]"
            >
              <Check size={14} />
            </button>
          )}
          {hasBeenEdited && (
            <button
              onClick={() => onRevert(field.id)}
              title="Vrátit na AI návrh"
              className="p-1.5 bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 rounded-md shadow-sm border border-[color:var(--wp-surface-card-border)]"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {isConfirmed && (
            <button
              onClick={() => onRevert(field.id)}
              title="Zrušit potvrzení"
              className="p-1.5 bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-tertiary)] hover:text-amber-600 rounded-md shadow-sm border border-[color:var(--wp-surface-card-border)]"
            >
              <Edit2 size={14} />
            </button>
          )}
        </div>
      </div>

      {field.message && (
        <div
          className={`mt-2 ml-1 text-xs font-bold flex items-start gap-1.5 ${
            field.status === "warning" ? "text-amber-600" : "text-rose-600"
          }`}
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span className="leading-snug">{field.message}</span>
        </div>
      )}

      {field.sourceType && field.sourceType !== "ai" ? (
        <div className="mt-1 ml-1 text-[10px] text-[color:var(--wp-text-tertiary)] flex items-center gap-2">
          <span>Zdroj: {field.sourceType}</span>
          {field.page ? <span>Strana {field.page}</span> : null}
        </div>
      ) : field.page ? (
        <div className="mt-1 ml-1 text-[10px] text-[color:var(--wp-text-tertiary)]">Strana {field.page}</div>
      ) : null}
    </div>
  );
}

/* ─── Extracted Group Card ──────────────────────────────────────── */

function ExtractedGroupCard({
  group,
  isCollapsed,
  onToggle,
  state,
  onFieldClick,
  onEdit,
  onConfirm,
  onRevert,
  filter,
}: {
  group: ExtractedGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  state: ExtractionReviewState;
  onFieldClick: (fieldId: string, page?: number) => void;
  onEdit: (fieldId: string, value: string) => void;
  onConfirm: (fieldId: string) => void;
  onRevert: (fieldId: string) => void;
  filter: FieldFilter;
}) {
  const GroupIcon = getIcon(group.iconName);

  const filteredFields = group.fields.filter((f) => {
    if (filter === "all") return true;
    if (filter === "warning") return f.status === "warning";
    if (filter === "error") return f.status === "error";
    if (filter === "edited") return state.editedFields[f.id] !== undefined;
    if (filter === "unconfirmed") return !state.confirmedFields[f.id];
    return true;
  });

  const warningCount = group.fields.filter((f) => f.status === "warning").length;
  const errorCount = group.fields.filter((f) => f.status === "error").length;

  if (filteredFields.length === 0 && filter !== "all") return null;

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-5 md:px-6 py-4 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 flex items-center justify-between"
      >
        <h3 className="font-bold text-sm text-[color:var(--wp-text)] flex items-center gap-2">
          <GroupIcon size={16} className="text-indigo-500" />
          {group.name}
          <span className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] normal-case tracking-normal">
            {group.fields.length} polí
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {warningCount > 0 && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {warningCount} k ověření
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
              {errorCount} chyb
            </span>
          )}
          {isCollapsed ? (
            <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
          ) : (
            <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" />
          )}
        </div>
      </button>

      {!isCollapsed && (
        <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {filteredFields.map((field) => (
            <ExtractedFieldRow
              key={field.id}
              field={field}
              isActive={state.activeFieldId === field.id}
              editedValue={state.editedFields[field.id]}
              isConfirmed={state.confirmedFields[field.id] ?? false}
              onFieldClick={onFieldClick}
              onEdit={onEdit}
              onConfirm={onConfirm}
              onRevert={onRevert}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Extra Recommendations Card ────────────────────────────────── */

function ExtraRecommendationsCard({
  recommendations,
  dismissedMap,
  onDismiss,
  onCreateTask,
}: {
  recommendations: AIRecommendation[];
  dismissedMap: Record<string, boolean>;
  onDismiss: (id: string) => void;
  onCreateTask: (rec: AIRecommendation) => void | Promise<void>;
}) {
  const visible = recommendations.filter((r) => !dismissedMap[r.id]);
  if (visible.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-emerald-50/50 to-blue-50/30 rounded-[20px] border border-emerald-100 shadow-sm p-4 md:p-5">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-800 mb-4 flex items-center gap-2">
        <TrendingUp size={16} className="text-emerald-500" />
        Další interní podněty od AI
      </h3>
      <div className="space-y-3">
        {visible.map((rec) => (
          <div
            key={rec.id}
            className="bg-[color:var(--wp-surface-card)]/80 backdrop-blur-sm p-4 rounded-xl border border-emerald-100/50 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <RecIcon type={rec.type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {recTypeBadge(rec.type)}
                </div>
                <p className="text-sm font-bold text-[color:var(--wp-text)]">{rec.title}</p>
                <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1 leading-relaxed">
                  {rec.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void onCreateTask(rec)}
                    className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-100/50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Vytvořit úkol
                  </button>
                  <button
                    onClick={() => onDismiss(rec.id)}
                    className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Skrýt
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Left Panel ───────────────────────────────────────────── */

type LeftPanelProps = {
  doc: ExtractionDocument;
  state: ExtractionReviewState;
  onFieldClick: (fieldId: string, page?: number) => void;
  onEdit: (fieldId: string, value: string) => void;
  onConfirm: (fieldId: string) => void;
  onRevert: (fieldId: string) => void;
  onFilterChange: (filter: FieldFilter) => void;
  onToggleGroup: (groupId: string) => void;
  onDismissRec: (id: string) => void;
  onRestoreRec: (id: string) => void;
  onCreateTask: (rec: AIRecommendation) => void | Promise<void>;
};

export function ExtractionLeftPanel({
  doc,
  state,
  onFieldClick,
  onEdit,
  onConfirm,
  onRevert,
  onFilterChange,
  onToggleGroup,
  onDismissRec,
  onRestoreRec,
  onCreateTask,
}: LeftPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback(
    (id: string) => {
      const el = scrollRef.current?.querySelector(`[data-section="${id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    []
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80 backdrop-blur-sm px-4 md:px-6 lg:px-10 sticky top-0 z-10">
        <SectionNav onScrollTo={scrollToSection} />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scroll p-4 md:p-5 lg:p-6"
      >
        <div className="w-full space-y-4 md:space-y-5">
          <div data-section="summary">
            <DocumentMetaHeader doc={doc} />
          </div>

          <ExecutiveSummaryCard doc={doc} />

          <ReviewAttentionBanner
            warningCount={doc.diagnostics.warningCount}
            errorCount={doc.diagnostics.errorCount}
            onShowProblems={() => onFilterChange("error")}
          />

          <div data-section="diagnostics">
            <ExtractionDiagnosticsCard doc={doc} />
          </div>

          <div data-section="data">
            <div className="mb-4">
              <FilterBar
                active={state.filter}
                onChange={onFilterChange}
                warningCount={doc.diagnostics.warningCount}
                errorCount={doc.diagnostics.errorCount}
              />
            </div>
            <div className="space-y-5">
              {doc.groups.map((group) => (
                <ExtractedGroupCard
                  key={group.id}
                  group={group}
                  isCollapsed={state.collapsedGroups[group.id] ?? false}
                  onToggle={() => onToggleGroup(group.id)}
                  state={state}
                  onFieldClick={onFieldClick}
                  onEdit={onEdit}
                  onConfirm={onConfirm}
                  onRevert={onRevert}
                  filter={state.filter}
                />
              ))}
            </div>
          </div>

          <div data-section="recommendations" className="space-y-6">
            <WorkActionsCard doc={doc} />
            <AIRecommendationsCard
              recommendations={doc.recommendations}
              dismissedMap={state.dismissedRecommendations}
              onDismiss={onDismissRec}
              onRestore={onRestoreRec}
              onCreateTask={onCreateTask}
              onFieldClick={onFieldClick}
            />
            <ExtraRecommendationsCard
              recommendations={doc.extraRecommendations}
              dismissedMap={state.dismissedRecommendations}
              onDismiss={onDismissRec}
              onCreateTask={onCreateTask}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
