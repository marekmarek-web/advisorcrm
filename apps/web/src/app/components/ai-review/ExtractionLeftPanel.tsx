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
  Pencil,
  Lightbulb,
} from "lucide-react";

import { isDateFieldKey, normalizeDateForAdvisorDisplay } from "@/lib/ai/canonical-date-normalize";
import { getDocumentTypeLabel } from "@/lib/ai/document-messages";
import type { PrimaryDocumentType } from "@/lib/ai/document-review-types";
import { CanonicalFieldsPanel } from "./CanonicalFieldsPanel";
import { ReviewAttachClientDialog } from "./ReviewAttachClientDialog";
import { formatAiClassifierForAdvisor, humanizeReviewReasonLine } from "@/lib/ai-review/czech-labels";
import type {
  ExtractionDocument,
  ExtractedGroup,
  ExtractedField,
  DraftAction,
  FieldFilter,
  FieldStatus,
  ExtractionReviewState,
  PaymentSyncPreview,
  ApplyResultPayload,
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

/* ─── Section Navigation ────────────────────────────────────────── */

const SECTIONS = [
  { id: "summary", label: "Shrnutí" },
  { id: "advisor", label: "Přehled AI" },
  { id: "data", label: "Pole k ověření" },
  { id: "diagnostics", label: "Diagnostika" },
  { id: "recommendations", label: "Stav a výsledky" },
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
        Klíčové údaje z dokumentu. Ověřte oproti originálu.
      </p>
      {ar.llmExecutiveBrief ? (
        <div className="mb-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 flex items-center gap-2">
            <Sparkles size={14} className="text-indigo-500" /> Stručné shrnutí
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
              <span>{humanizeReviewReasonLine(w)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ─── CRM Mapping Proposal Card (Phase 4E) ──────────────────────── */

const PAYMENT_PAYLOAD_LABELS: Record<string, string> = {
  obligationName: "Závazek",
  provider: "Poskytovatel",
  productName: "Produkt",
  contractReference: "Č. smlouvy",
  recipientAccount: "Č. účtu",
  iban: "IBAN",
  bankCode: "Kód banky",
  variableSymbol: "Variabilní symbol",
  specificSymbol: "Specifický symbol",
  constantSymbol: "Konstantní symbol",
  regularAmount: "Pravidelná částka",
  oneOffAmount: "Jednorázová částka",
  currency: "Měna",
  frequency: "Frekvence",
  firstDueDate: "Datum první platby",
  beneficiaryName: "Příjemce",
  clientNote: "Poznámka",
};

const ENFORCEMENT_FIELD_LABELS: Record<string, string> = {
  fullName: "Jméno a příjmení",
  firstName: "Jméno",
  lastName: "Příjmení",
  email: "E-mail",
  phone: "Telefon",
  address: "Adresa",
  birthDate: "Datum narození",
  personalId: "Rodné číslo",
  idCardNumber: "Číslo dokladu / OP",
  idCardIssuedBy: "Doklad vydal",
  idCardValidUntil: "Platnost dokladu do",
  idCardIssuedAt: "Datum vydání dokladu",
  generalPractitioner: "Praktický lékař",
  contractNumber: "Číslo smlouvy",
  institutionName: "Pojišťovna / instituce",
  insurer: "Pojišťovna",
  provider: "Poskytovatel",
  productName: "Produkt",
  policyStartDate: "Počátek pojištění",
  effectiveDate: "Datum účinnosti",
  startDate: "Začátek smlouvy",
  premiumAmount: "Pojistné / pravidelná platba",
  totalMonthlyPremium: "Celkové měsíční pojistné",
  premiumAnnual: "Roční pojistné",
  annualPremium: "Roční pojistné",
  frequency: "Frekvence plateb",
  paymentFrequency: "Frekvence plateb",
  iban: "IBAN",
  accountNumber: "Číslo účtu",
  recipientAccount: "Účet příjemce",
  bankCode: "Kód banky",
  variableSymbol: "Variabilní symbol",
  specificSymbol: "Specifický symbol",
  constantSymbol: "Konstantní symbol",
};

/** ISO a podobné datumové řetězce → DD.MM.YYYY v náhledech CRM (draft akce). */
function formatCrmFieldValueForDisplay(fieldKey: string, value: string): string {
  if (isDateFieldKey(fieldKey)) return normalizeDateForAdvisorDisplay(value) || value;
  return value;
}

function humanizeEnforcementFieldKey(fieldKey: string): string {
  const local = ENFORCEMENT_FIELD_LABELS[fieldKey];
  if (local) return local;
  if (/^[a-z][a-zA-Z0-9_]*$/.test(fieldKey) && fieldKey.includes("_")) return "Údaj k ověření";
  if (/^[a-z][a-zA-Z]*[A-Z]/.test(fieldKey)) return "Údaj k ověření";
  return ENFORCEMENT_FIELD_LABELS[fieldKey] ?? "Údaj k ověření";
}

/** Build a fieldKey → {applyPolicyLabel, requiresConfirmation} lookup from extracted groups */
function buildApplyPolicyLookup(
  groups: ExtractionDocument["groups"]
): Map<string, { label: string; requires: boolean }> {
  const map = new Map<string, { label: string; requires: boolean }>();
  for (const g of groups) {
    for (const f of g.fields) {
      if (f.applyPolicyLabel) {
        // Strip "extractedFields." prefix from id to get raw key
        const key = f.id.replace(/^extractedFields\./, "");
        map.set(key, {
          label: f.applyPolicyLabel,
          requires: f.requiresConfirmation ?? false,
        });
      }
    }
  }
  return map;
}

type ApplyLabelBadgeProps = { label: string; requires: boolean };
function ApplyLabelBadge({ label, requires }: ApplyLabelBadgeProps) {
  const cls =
    label === "Propíše se automaticky"
      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400"
      : label === "Předvyplněno k potvrzení"
      ? "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400"
      : label === "Vyžaduje ruční doplnění"
      ? "text-rose-500 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400"
      : "text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded leading-none mt-0.5 w-fit ${cls}`}
    >
      {requires && label !== "Propíše se automaticky" && (
        <AlertCircle size={8} className="shrink-0" />
      )}
      {label}
    </span>
  );
}

/** Row for a single field inside CrmMappingProposalCard */
function CrmFieldRow({
  fieldKey,
  label,
  value,
  applyLookup,
  enforcementTrace,
}: {
  fieldKey: string;
  label: string;
  value: string;
  applyLookup: Map<string, { label: string; requires: boolean }>;
  enforcementTrace?: ApplyResultPayload["policyEnforcementTrace"];
}) {
  const policy = applyLookup.get(fieldKey);
  const resultStatus = enforcementTrace ? resolveFieldResultStatus(fieldKey, enforcementTrace) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
        {label}
      </span>
      <span
        className="text-xs font-semibold text-[color:var(--wp-text)] truncate"
        title={formatCrmFieldValueForDisplay(fieldKey, value)}
      >
        {formatCrmFieldValueForDisplay(fieldKey, value)}
      </span>
      {resultStatus
        ? <ApplyResultBadge status={resultStatus} />
        : policy && <ApplyLabelBadge label={policy.label} requires={policy.requires} />
      }
    </div>
  );
}

function CrmMappingProposalCard({ doc }: { doc: ExtractionDocument }) {
  const [open, setOpen] = useState(false);
  const actions = doc.draftActions ?? [];
  if (actions.length === 0 || doc.isApplied) return null;

  const paymentAction = actions.find(
    (a) =>
      a.type === "create_payment_setup" ||
      a.type === "create_payment_setup_for_portal"
  );
  const contractAction = actions.find(
    (a) =>
      a.type === "create_contract" ||
      a.type === "create_or_update_contract"
  );
  const clientAction = actions.find(
    (a) =>
      a.type === "create_client" ||
      a.type === "create_new_client" ||
      a.type === "create_or_link_client" ||
      a.type === "link_existing_client" ||
      a.type === "resolve_client_match"
  );

  const hasAnyDetail = paymentAction?.payload || contractAction?.payload || clientAction?.payload;
  if (!hasAnyDetail) return null;

  const applyLookup = buildApplyPolicyLookup(doc.groups);
  const enforcementTrace = doc.applyResultPayload?.policyEnforcementTrace;

  // Summary counts for apply policy
  const allPolicyLabels: string[] = [];
  for (const [, v] of applyLookup) allPolicyLabels.push(v.label);
  const prefillCount = allPolicyLabels.filter((l) => l === "Předvyplněno k potvrzení").length;
  const manualCount = allPolicyLabels.filter((l) => l === "Vyžaduje ruční doplnění").length;

  const readiness = doc.publishReadiness;
  const readinessBadge =
    readiness === "ready_for_publish"
      ? { cls: "bg-emerald-100 text-emerald-700", label: "Připraveno" }
      : readiness === "blocked"
        ? { cls: "bg-amber-100 text-amber-700", label: "Vyžaduje kontrolu" }
        : readiness === "review_required"
          ? { cls: "bg-amber-100 text-amber-700", label: "Vyžaduje kontrolu" }
          : { cls: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]", label: "Zpracovává se" };

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 md:px-6 py-4 flex items-center justify-between text-left"
      >
        <span className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] flex items-center gap-2">
          <ListChecks size={14} className="text-indigo-500" /> Návrh zápisu do CRM
          <span className={`ml-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${readinessBadge.cls}`}>
            {readinessBadge.label}
          </span>
        </span>
        {open ? (
          <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" />
        ) : (
          <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
        )}
      </button>

      {open && (
        <div className="px-5 md:px-6 pb-5 pt-0 border-t border-[color:var(--wp-surface-card-border)] space-y-4">
          {/* Apply policy summary */}
          {(prefillCount > 0 || manualCount > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {prefillCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-1 rounded-lg">
                  <AlertCircle size={10} />
                  {prefillCount} {prefillCount === 1 ? "pole" : prefillCount <= 4 ? "pole" : "polí"} k potvrzení
                </span>
              )}
              {manualCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 px-2 py-1 rounded-lg">
                  <AlertCircle size={10} />
                  {manualCount} {manualCount === 1 ? "pole" : manualCount <= 4 ? "pole" : "polí"} k ručnímu doplnění
                </span>
              )}
            </div>
          )}

          {!prefillCount && !manualCount && (
            <p className="mt-3 text-xs text-[color:var(--wp-text-tertiary)] leading-relaxed">
              Tato data se zapíší do CRM po kliknutí na <strong>Zapsat do CRM</strong>. Zkontrolujte je před odesláním.
            </p>
          )}

          {clientAction &&
            (clientAction.type === "link_existing_client" || clientAction.type === "resolve_client_match" ? (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-1.5 flex items-center gap-1.5">
                  <User size={11} /> Klient
                </p>
                <p className="text-xs text-[color:var(--wp-text-secondary)] leading-relaxed">{clientAction.label}</p>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-1.5 flex items-center gap-1.5">
                  <User size={11} /> Klient
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {Object.entries(clientAction.payload ?? {})
                    .filter(([, v]) => v && String(v).trim())
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <CrmFieldRow
                        key={k}
                        fieldKey={k}
                        label={k}
                        value={String(v)}
                        applyLookup={applyLookup}
                        enforcementTrace={enforcementTrace}
                      />
                    ))}
                </div>
              </div>
            ))}

          {contractAction && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-1.5 flex items-center gap-1.5">
                <Shield size={11} /> Smlouva / Produkt
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.entries(contractAction.payload ?? {})
                  .filter(([, v]) => v && String(v).trim())
                  .slice(0, 8)
                  .map(([k, v]) => (
                    <CrmFieldRow
                      key={k}
                      fieldKey={k}
                      label={k}
                      value={String(v)}
                      applyLookup={applyLookup}
                      enforcementTrace={enforcementTrace}
                    />
                  ))}
              </div>
            </div>
          )}

          {paymentAction && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-1.5 flex items-center gap-1.5">
                <CreditCard size={11} /> Platební instrukce
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.entries(paymentAction.payload ?? {})
                  .filter(([, v]) => v && String(v).trim())
                  .map(([k, v]) => (
                    <CrmFieldRow
                      key={k}
                      fieldKey={k}
                      label={PAYMENT_PAYLOAD_LABELS[k] ?? k}
                      value={String(v)}
                      applyLookup={applyLookup}
                      enforcementTrace={enforcementTrace}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Fáze 10: Apply Result Field Badge ─────────────────────────── */

type ApplyResultStatus = "auto" | "pending" | "manual" | "excluded";

function ApplyResultBadge({ status }: { status: ApplyResultStatus }) {
  const cfg: Record<ApplyResultStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    auto: {
      label: "Zapsáno automaticky",
      cls: "bg-emerald-100 text-emerald-700",
      icon: <CheckCircle2 size={9} className="shrink-0" />,
    },
    pending: {
      label: "Předvyplněno k potvrzení",
      cls: "bg-amber-100 text-amber-700",
      icon: <Clock size={9} className="shrink-0" />,
    },
    manual: {
      label: "Vyžaduje ruční doplnění",
      cls: "bg-rose-100 text-rose-700",
      icon: <Pencil size={9} className="shrink-0" />,
    },
    excluded: {
      label: "Nezapsáno",
      cls: "bg-slate-100 text-slate-500",
      icon: <XCircle size={9} className="shrink-0" />,
    },
  };
  const { label, cls, icon } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded leading-none mt-0.5 w-fit ${cls}`}>
      {icon}
      {label}
    </span>
  );
}

/** Determine per-field result status from policyEnforcementTrace */
function resolveFieldResultStatus(
  fieldKey: string,
  trace: NonNullable<ApplyResultPayload["policyEnforcementTrace"]>
): ApplyResultStatus | null {
  const sections = [
    trace.contactEnforcement,
    trace.contractEnforcement,
    trace.paymentEnforcement,
  ].filter(Boolean) as NonNullable<typeof trace.contactEnforcement>[];

  for (const s of sections) {
    if (s.autoAppliedFields.includes(fieldKey)) return "auto";
    if (s.pendingConfirmationFields.includes(fieldKey)) return "pending";
    if (s.manualRequiredFields.includes(fieldKey)) return "manual";
    if (s.excludedFields.includes(fieldKey)) return "excluded";
  }
  return null;
}

/* ─── Fáze 10+11: Enforcement Result Card (replaces CrmMappingProposalCard after apply) ── */

const SCOPE_KEY_MAP: Record<string, "contact" | "contract" | "payment"> = {
  contactEnforcement: "contact",
  contractEnforcement: "contract",
  paymentEnforcement: "payment",
};

function PendingFieldRow({
  fieldKey,
  scope,
  onConfirmPendingField,
}: {
  fieldKey: string;
  scope: "contact" | "contract" | "payment";
  onConfirmPendingField?: (fieldKey: string, scope: "contact" | "contract" | "payment") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded px-1.5 py-0.5">
        <CheckCircle2 size={10} className="shrink-0" />
        {humanizeEnforcementFieldKey(fieldKey)} — Potvrzeno a zapsáno
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 pl-2 pr-1 py-0.5">
      <span className="text-[10px] font-semibold text-amber-900">{humanizeEnforcementFieldKey(fieldKey)}</span>
      {onConfirmPendingField ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirmPendingField(fieldKey, scope);
              setConfirmed(true);
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 min-h-[20px]"
          title={`Potvrdit pole ${fieldKey}`}
        >
          {busy ? (
            <span className="inline-block w-2.5 h-2.5 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Check size={9} />
          )}
          {busy ? "" : "Potvrdit"}
        </button>
      ) : (
        <ApplyResultBadge status="pending" />
      )}
    </div>
  );
}

function EnforcementResultCard({
  doc,
  onConfirmPendingField,
}: {
  doc: ExtractionDocument;
  onConfirmPendingField?: (fieldKey: string, scope: "contact" | "contract" | "payment") => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const trace = doc.applyResultPayload?.policyEnforcementTrace;
  if (!doc.isApplied || !trace) return null;

  const s = trace.summary;
  const isSupporting = trace.supportingDocumentGuard;

  // Auto-open pokud jsou pending pole k potvrzení
  const hasPending = s.totalPendingConfirmation > 0 && !isSupporting;

  return (
    <div className={`bg-[color:var(--wp-surface-card)] rounded-[20px] border shadow-sm overflow-hidden ${hasPending ? "border-amber-300" : "border-emerald-200"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 md:px-6 py-4 flex items-center justify-between text-left"
      >
        <span className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${hasPending ? "text-amber-800" : "text-emerald-800"}`}>
          {hasPending ? (
            <Clock size={14} className="text-amber-600" />
          ) : (
            <CheckCircle2 size={14} className="text-emerald-600" />
          )}
          {isSupporting
            ? "Výsledek zpracování podkladu"
            : hasPending
              ? `Výsledek zápisu — ${s.totalPendingConfirmation} čeká na potvrzení`
              : "Výsledek zápisu do CRM"}
        </span>
        {open ? (
          <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" />
        ) : (
          <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
        )}
      </button>

      {(open || hasPending) && (
        <div className="px-5 md:px-6 pb-5 pt-0 border-t border-emerald-100 space-y-3">
          {isSupporting ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
              <p className="text-xs font-bold text-amber-900 leading-snug flex items-start gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                Tento dokument byl zpracován jako podklad. Nevznikla žádná smluvní smlouva ani zápis platebních instrukcí. Slouží pouze jako reference.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {s.totalAutoApplied > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-base font-black text-emerald-800 tabular-nums">{s.totalAutoApplied}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 leading-tight">Zapsáno automaticky</div>
                  </div>
                </div>
              )}
              {s.totalPendingConfirmation > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <Clock size={16} className="text-amber-600 shrink-0" />
                  <div>
                    <div className="text-base font-black text-amber-800 tabular-nums">{s.totalPendingConfirmation}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 leading-tight">Čeká na potvrzení</div>
                  </div>
                </div>
              )}
              {s.totalManualRequired > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5">
                  <Pencil size={16} className="text-rose-600 shrink-0" />
                  <div>
                    <div className="text-base font-black text-rose-800 tabular-nums">{s.totalManualRequired}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-rose-700 leading-tight">Ruční doplnění</div>
                  </div>
                </div>
              )}
              {s.totalExcluded > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                  <XCircle size={16} className="text-slate-500 shrink-0" />
                  <div>
                    <div className="text-base font-black text-slate-700 tabular-nums">{s.totalExcluded}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 leading-tight">Nezapsáno</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Per-section breakdown s inline Potvrdit tlačítky pro pending pole */}
          {!isSupporting && (
            <div className="space-y-3 mt-1">
              {[
                { key: "contactEnforcement" as const, label: "Klient" },
                { key: "contractEnforcement" as const, label: "Smlouva" },
                { key: "paymentEnforcement" as const, label: "Platební instrukce" },
              ].map(({ key, label }) => {
                const e = trace[key];
                if (!e) return null;
                const scope = SCOPE_KEY_MAP[key];
                const hasAny = e.autoAppliedFields.length + e.pendingConfirmationFields.length +
                  e.manualRequiredFields.length + e.excludedFields.length > 0;
                if (!hasAny) return null;
                return (
                  <div key={key}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-1.5">{label}</p>
                    <div className="space-y-1.5">
                      {/* Auto-applied pole */}
                      {e.autoAppliedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <ApplyResultBadge status="auto" />
                          <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">—</span>
                          {e.autoAppliedFields.map((f) => (
                            <span key={f} className="text-[10px] font-semibold text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] rounded px-1.5 py-0.5">
                              {humanizeEnforcementFieldKey(f)}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Pending pole — s inline Potvrdit */}
                      {e.pendingConfirmationFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-start">
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <ApplyResultBadge status="pending" />
                            <span className="text-[10px] text-[color:var(--wp-text-tertiary)] ml-0.5">—</span>
                          </div>
                          {e.pendingConfirmationFields.map((f) => (
                            <PendingFieldRow
                              key={f}
                              fieldKey={f}
                              scope={scope}
                              onConfirmPendingField={onConfirmPendingField}
                            />
                          ))}
                        </div>
                      )}
                      {/* Manual required pole */}
                      {e.manualRequiredFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <ApplyResultBadge status="manual" />
                          <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">—</span>
                          {e.manualRequiredFields.map((f) => (
                            <span key={f} className="text-[10px] font-semibold text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] rounded px-1.5 py-0.5">
                              {humanizeEnforcementFieldKey(f)}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Excluded pole */}
                      {e.excludedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <ApplyResultBadge status="excluded" />
                          <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">—</span>
                          {e.excludedFields.map((f) => (
                            <span key={f} className="text-[10px] font-semibold text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] rounded px-1.5 py-0.5">
                              {humanizeEnforcementFieldKey(f)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending confirmation call-to-action */}
          {s.totalPendingConfirmation > 0 && !isSupporting && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-900 leading-snug flex items-start gap-1.5">
                <Clock size={13} className="shrink-0 mt-0.5 text-amber-600" />
                {s.totalPendingConfirmation} {s.totalPendingConfirmation === 1 ? "pole čeká" : "polí čeká"} na potvrzení poradcem — klikněte <strong>Potvrdit</strong> u každého pole výše.
              </p>
            </div>
          )}

          {/* Manual required call-to-action */}
          {s.totalManualRequired > 0 && !isSupporting && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2.5">
              <p className="text-xs font-bold text-rose-900 leading-snug flex items-start gap-1.5">
                <Pencil size={13} className="shrink-0 mt-0.5 text-rose-600" />
                {s.totalManualRequired} {s.totalManualRequired === 1 ? "pole vyžaduje" : "polí vyžaduje"} ruční doplnění — automatický zápis nebyl možný. Doplňte data ručně v záznamu.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Action types that execute directly via apply flow — not just navigation. */
const INLINE_APPLY_ACTIONS = new Set([
  "create_client",
  "create_new_client",
  "create_or_link_client",
]);

/** Akce, které dřív mířily na obecný seznam kontaktů — přesměrování nahrazeno review-scoped výběrem (viz WorkActionsCard). */
const ACTION_ROUTE_MAP: Record<string, string> = {
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

function WorkActionsCard({
  doc,
  onExecuteDraftAction,
  onConfirmCreateNew,
  onApproveAndApply,
  onSelectClient,
  editedFields,
}: {
  doc: ExtractionDocument;
  onExecuteDraftAction?: (action: DraftAction) => void | Promise<void>;
  onConfirmCreateNew?: () => void;
  onApproveAndApply?: (editedFields: Record<string, string>, options?: { overrideGateReasons?: string[]; overrideReason?: string }) => void | Promise<void>;
  /** Výběr klienta pro tuto revizi — server + obnovení dokumentu (žádný rozcestník kontaktů). */
  onSelectClient?: (clientId: string) => void | Promise<void>;
  editedFields?: Record<string, string>;
}) {
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [executedActions, setExecutedActions] = React.useState<Set<string>>(new Set());
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [attachMarkKey, setAttachMarkKey] = React.useState<string | null>(null);
  const actions = doc.draftActions ?? [];
  const publishOutcome = doc.applyResultPayload?.publishOutcome;
  const markExecuted = (key: string) => setExecutedActions((prev) => new Set([...prev, key]));
  const openAttachModal = (actionKey: string) => {
    setAttachMarkKey(actionKey);
    setAttachOpen(true);
  };

  // Jedna pravdivá lišta výsledku je v AIReviewExtractionShell — neopakovat stejný text v levém panelu.
  if (doc.isApplied && publishOutcome) {
    return null;
  }

  if (doc.isApplied) {
    return (
      <div
        data-section="workflow"
        className="bg-emerald-50 rounded-[20px] border border-emerald-200 shadow-sm p-4 md:p-5"
      >
        <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-800 mb-3 flex items-center gap-2">
          <Check size={14} /> Zapsáno do CRM
        </h3>
        <p className="text-sm text-emerald-700 font-medium">
          Dokument byl zpracován a zapsán do CRM.
        </p>
      </div>
    );
  }

  return (
    <div
      data-section="workflow"
      className="bg-[color:var(--wp-surface-card)] rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5"
    >
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-3 flex items-center gap-2">
        <Wrench size={14} className="text-indigo-500" /> Navrhované pracovní kroky
      </h3>
      <p className="text-xs text-[color:var(--wp-text-tertiary)] mb-4">
        Akce označené jako „Dostupné" se provedou při zápisu do CRM. Doporučení vyžadují vaše rozhodnutí.
      </p>
      {actions.length === 0 ? (
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          Zatím nejsou k dispozici žádné navázané návrhy kroků pro tento dokument.
        </p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a, i) => {
            const actionKey = `${a.type}-${i}`;
            const baseClass =
              "flex items-center gap-2 text-sm font-medium rounded-xl px-4 py-3 border transition-colors w-full text-left";
            const isBusy = busyAction === actionKey;
            const isLocallyExecuted = executedActions.has(actionKey);
            const effectiveStatus = isLocallyExecuted ? "executed" as const : (a.status ?? "available" as const);

            if (effectiveStatus === "executed") {
              return (
                <li key={actionKey}>
                  <div className={`${baseClass} text-emerald-700 bg-emerald-50/60 border-emerald-200 cursor-default`}>
                    <Check size={15} className="text-emerald-500 shrink-0" />
                    <span className="flex-1">{a.label}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">Provedeno</span>
                  </div>
                </li>
              );
            }

            if (effectiveStatus === "skipped") {
              return (
                <li key={actionKey}>
                  <div className={`${baseClass} text-slate-500 bg-slate-50/60 border-slate-200 cursor-default opacity-60`}>
                    <MinusCircle size={15} className="text-slate-400 shrink-0" />
                    <span className="flex-1 line-through">{a.label}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">Přeskočeno</span>
                  </div>
                </li>
              );
            }

            if (a.type === "link_existing_client") {
              const cid = typeof a.payload?.clientId === "string" ? a.payload.clientId : null;
              const displayName = typeof a.payload?.displayName === "string" ? a.payload.displayName : null;
              const alreadyLinked = !!doc.matchedClientId;
              if (!cid) {
                if (alreadyLinked) {
                  return (
                    <li key={actionKey}>
                      <div className={`${baseClass} text-emerald-800 bg-emerald-50/70 border-emerald-200 cursor-default`}>
                        <Check size={15} className="text-emerald-600 shrink-0" />
                        <span className="flex-1">Klient propojen k této revizi</span>
                        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                          Hotovo
                        </span>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={actionKey}>
                    <button
                      type="button"
                      disabled={!onSelectClient}
                      onClick={() => openAttachModal(actionKey)}
                      className={`${baseClass} text-indigo-700 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800 dark:hover:bg-indigo-900/40 disabled:opacity-50`}
                    >
                      <CheckCircle2 size={15} className="text-indigo-500 shrink-0" />
                      <span className="flex-1">{a.label}</span>
                      <ArrowRight size={14} className="text-indigo-400 shrink-0" />
                    </button>
                  </li>
                );
              }
              return (
                <li key={actionKey}>
                  <button
                    type="button"
                    disabled={isBusy || alreadyLinked || !onSelectClient}
                    onClick={async () => {
                      if (!onSelectClient || !cid) return;
                      setBusyAction(actionKey);
                      try {
                        await onSelectClient(cid);
                        markExecuted(actionKey);
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    className={`${baseClass} text-indigo-700 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800 dark:hover:bg-indigo-900/40 disabled:opacity-50`}
                  >
                    {isBusy ? (
                      <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                    ) : alreadyLinked ? (
                      <Check size={15} className="text-emerald-500 shrink-0" />
                    ) : (
                      <CheckCircle2 size={15} className="text-indigo-500 shrink-0" />
                    )}
                    <span className="flex-1">
                      {alreadyLinked
                        ? `Klient propojen${displayName ? `: ${displayName}` : ""}`
                        : a.label}
                    </span>
                    {!alreadyLinked && <ArrowRight size={14} className="text-indigo-400 shrink-0" />}
                  </button>
                </li>
              );
            }

            if (a.type === "resolve_client_match") {
              const matchResolved = !!doc.matchedClientId;
              if (matchResolved) {
                return (
                  <li key={actionKey}>
                    <div className={`${baseClass} text-emerald-800 bg-emerald-50/60 border-emerald-200 cursor-default`}>
                      <Check size={15} className="text-emerald-600 shrink-0" />
                      <span className="flex-1 font-semibold">Klient k revizi vybrán</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">Hotovo</span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={actionKey}>
                  <div
                    className={`${baseClass} flex-col items-stretch text-[color:var(--wp-text)] bg-amber-50/50 border-amber-200`}
                  >
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      <span className="flex-1 font-semibold min-w-0">{a.label}</span>
                      <button
                        type="button"
                        disabled={!onSelectClient}
                        onClick={() => openAttachModal(actionKey)}
                        className="text-xs font-black text-indigo-700 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 shrink-0 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        Vybrat klienta
                      </button>
                    </div>
                    <p className="text-[11px] text-[color:var(--wp-text-secondary)] mt-2 leading-snug pl-0.5">
                      Zápis do CRM počká na výběr klienta. Vyberte správný záznam z navržených shod nebo z celého seznamu — zůstanete v této revizi.
                    </p>
                  </div>
                </li>
              );
            }

            // Inline apply action: create client → confirm + trigger apply flow
            if (INLINE_APPLY_ACTIONS.has(a.type) && onApproveAndApply) {
              if (
                (a.type === "create_new_client" || a.type === "create_client") &&
                doc.matchVerdict === "existing_match"
              ) {
                return null;
              }
              const alreadyLinked = !!doc.matchedClientId || doc.createNewClientConfirmed === "true";
              return (
                <li key={actionKey}>
                  <button
                    type="button"
                    disabled={isBusy || alreadyLinked}
                    onClick={async () => {
                      setBusyAction(actionKey);
                      try {
                        if (!alreadyLinked && onConfirmCreateNew) {
                          onConfirmCreateNew();
                          // Brief pause to let the state propagate before triggering apply
                          await new Promise((r) => setTimeout(r, 300));
                        }
                        await onApproveAndApply(editedFields ?? {});
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    className={`${baseClass} text-indigo-700 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800 dark:hover:bg-indigo-900/40 disabled:opacity-50`}
                  >
                    {isBusy ? (
                      <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                    ) : (
                      <CheckCircle2 size={15} className="text-indigo-500 shrink-0" />
                    )}
                    <span className="flex-1">
                      {alreadyLinked ? "Klient nastaven — spustit zápis do CRM" : a.label}
                    </span>
                    <ArrowRight size={14} className="text-indigo-400 shrink-0" />
                  </button>
                </li>
              );
            }

            if (
              onExecuteDraftAction &&
              (a.type === "create_task" ||
                a.type === "create_service_task" ||
                a.type === "create_service_review_task" ||
                a.type === "create_task_followup" ||
                a.type === "create_manual_review_task" ||
                a.type === "schedule_consultation" ||
                a.type === "create_opportunity" ||
                a.type === "create_or_update_pipeline_deal")
            ) {
              return (
                <li key={actionKey}>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyAction(actionKey);
                      try {
                        await onExecuteDraftAction(a);
                        markExecuted(actionKey);
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    className={`${baseClass} text-indigo-700 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800 dark:hover:bg-indigo-900/40 disabled:opacity-50`}
                  >
                    {isBusy ? (
                      <span className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                    ) : (
                      <CheckCircle2 size={15} className="text-indigo-500 shrink-0" />
                    )}
                    <span className="flex-1">{a.label}</span>
                    <ArrowRight size={14} className="text-indigo-400 shrink-0" />
                  </button>
                </li>
              );
            }

            if (a.type === "attach_to_existing_client" || a.type === "link_client") {
              const resolved = !!doc.matchedClientId;
              if (resolved) {
                return (
                  <li key={actionKey}>
                    <div className={`${baseClass} text-emerald-800 bg-emerald-50/70 border-emerald-200 cursor-default`}>
                      <Check size={15} className="text-emerald-600 shrink-0" />
                      <span className="flex-1">
                        {a.type === "attach_to_existing_client"
                          ? "Klient připojen k této revizi"
                          : "Klient propojen s revizí"}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                        Hotovo
                      </span>
                    </div>
                  </li>
                );
              }
              const mode = effectiveStatus;
              const rowCls =
                mode === "recommended"
                  ? `${baseClass} text-amber-900 bg-amber-50/50 border-amber-200 hover:bg-amber-100/80`
                  : mode === "cannot_auto"
                    ? `${baseClass} text-slate-800 bg-slate-50/70 border-slate-200 hover:bg-slate-100`
                    : `${baseClass} text-indigo-800 bg-indigo-50/60 border-indigo-200 hover:bg-indigo-100/80`;
              const IconEl = mode === "recommended" ? Lightbulb : mode === "cannot_auto" ? ExternalLink : CheckCircle2;
              const badge =
                mode === "recommended" ? "Doporučení" : mode === "cannot_auto" ? "Ruční akce" : "Dostupné";
              return (
                <li key={actionKey}>
                  <button
                    type="button"
                    disabled={!onSelectClient}
                    onClick={() => openAttachModal(actionKey)}
                    className={`${rowCls} disabled:opacity-50`}
                  >
                    <IconEl size={15} className="shrink-0 opacity-90" />
                    <span className="flex-1">{a.label}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded shrink-0">
                      {badge}
                    </span>
                  </button>
                  {a.statusNote ? (
                    <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-1 ml-10 leading-snug">
                      {a.statusNote}
                    </p>
                  ) : null}
                </li>
              );
            }

            if (effectiveStatus === "recommended") {
              const recHref = resolveActionHref(a);
              return (
                <li key={actionKey}>
                  {recHref ? (
                    <Link href={recHref} className={`${baseClass} text-amber-800 bg-amber-50/40 border-amber-200 hover:bg-amber-100`}>
                      <Lightbulb size={15} className="text-amber-500 shrink-0" />
                      <span className="flex-1">{a.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Doporučení</span>
                    </Link>
                  ) : (
                    <div className={`${baseClass} text-amber-800 bg-amber-50/40 border-amber-200 cursor-default`}>
                      <Lightbulb size={15} className="text-amber-500 shrink-0" />
                      <span className="flex-1">{a.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">Doporučení</span>
                    </div>
                  )}
                  {a.statusNote && (
                    <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-1 ml-10 leading-snug">{a.statusNote}</p>
                  )}
                </li>
              );
            }

            if (effectiveStatus === "cannot_auto") {
              const caHref = resolveActionHref(a);
              return (
                <li key={actionKey}>
                  {caHref ? (
                    <Link href={caHref} className={`${baseClass} text-slate-700 bg-slate-50/60 border-slate-200 hover:bg-slate-100`}>
                      <ExternalLink size={15} className="text-slate-500 shrink-0" />
                      <span className="flex-1">{a.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">Ruční akce</span>
                    </Link>
                  ) : (
                    <div className={`${baseClass} text-slate-700 bg-slate-50/60 border-slate-200 cursor-default`}>
                      <ExternalLink size={15} className="text-slate-500 shrink-0" />
                      <span className="flex-1">{a.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">Ruční akce</span>
                    </div>
                  )}
                  {a.statusNote && (
                    <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-1 ml-10 leading-snug">{a.statusNote}</p>
                  )}
                </li>
              );
            }

            const href = resolveActionHref(a);
            if (href) {
              return (
                <li key={actionKey}>
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
                key={actionKey}
                className={`${baseClass} text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)]/50 border-[color:var(--wp-surface-card-border)] cursor-default`}
                title="Provede se automaticky při zápisu do CRM"
              >
                <ArrowRight size={15} className="text-indigo-400 shrink-0" />
                <span className="flex-1">{a.label}</span>
                <span className="text-[10px] text-[color:var(--wp-text-tertiary)] font-normal shrink-0">při zápisu do CRM</span>
              </li>
            );
          })}
        </ul>
      )}
      <ReviewAttachClientDialog
        open={attachOpen}
        onClose={() => {
          setAttachOpen(false);
          setAttachMarkKey(null);
        }}
        candidates={doc.clientMatchCandidates ?? []}
        onConfirm={async (clientId) => {
          if (!onSelectClient) {
            throw new Error("Výběr klienta není k dispozici.");
          }
          await onSelectClient(clientId);
          if (attachMarkKey) markExecuted(attachMarkKey);
        }}
      />
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
    good: "Dobrá — údaje by měly být spolehlivé",
    fair: "Průměrná — doporučujeme zkontrolovat klíčové údaje",
    poor: "Nízká — údaje je potřeba ručně ověřit oproti originálu",
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
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
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
        {field.displayStatus === "Chybí" && !field.value && (
          <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400 normal-case shrink-0">
            chybí
          </span>
        )}
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

      {/* 4H: AI original value hint when advisor edited the field */}
      {hasBeenEdited && field.originalAiValue && field.originalAiValue !== editedValue && (
        <div className="mt-1.5 ml-1 flex items-center gap-1.5 text-[10px] text-[color:var(--wp-text-tertiary)]">
          <RotateCcw size={10} className="shrink-0 text-blue-400" />
          <span>AI navrhlo: <span className="font-semibold">{field.originalAiValue}</span></span>
        </div>
      )}

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

      {/* Evidence status + source — from Fáze 5/6 evidence model */}
      <div className="mt-1 ml-1 flex items-center gap-2 flex-wrap min-h-[14px]">
        {field.displayStatus && (
          <span
            className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md leading-none ${
              field.displayStatus === "Nalezeno"
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                : field.displayStatus === "Odvozeno"
                ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            }`}
          >
            {field.displayStatus}
          </span>
        )}
        {field.displaySource && field.displaySource.trim() && (
          <span className="text-[10px] text-[color:var(--wp-text-tertiary)] leading-none truncate max-w-[160px]">
            {field.displaySource}
          </span>
        )}
        {!field.displayStatus && !field.displaySource && field.page && (
          <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">Strana {field.page}</span>
        )}
        {field.displayStatus && field.page && (
          <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">· s. {field.page}</span>
        )}
      </div>

      {field.sourceType && field.sourceType !== "ai" ? (
        <div className="mt-0.5 ml-1 text-[10px] text-[color:var(--wp-text-tertiary)] flex items-center gap-2">
          <span>Zdroj: {field.sourceType}</span>
        </div>
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

/* ─── Document Finality Warning ─────────────────────────────────── */

function DocumentFinalityWarning({ doc }: { doc: ExtractionDocument }) {
  const publishHints = doc.canonicalFields?.publishHints;
  const classifierJson = doc.extractionTrace?.aiClassifierJson as Record<string, string> | undefined;
  const docType = classifierJson?.documentType?.toLowerCase?.() ?? doc.documentType?.toLowerCase?.() ?? "";

  const isFinalContract =
    publishHints?.contractPublishable === true &&
    !publishHints?.sensitiveAttachmentOnly &&
    !publishHints?.needsSplit &&
    !publishHints?.reviewOnly &&
    (docType === "contract" || docType.includes("contract"));

  if (isFinalContract) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-800">
          Dokument není označen jako finální smlouva
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Ověřte typ dokumentu podle originálu. Pokud se jedná o finální smlouvu, upravte klasifikaci.
        </p>
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
  onExecuteDraftAction?: (action: DraftAction) => void | Promise<void>;
  /** Fáze 11: Per-field pending confirmation */
  onConfirmPendingField?: (fieldKey: string, scope: "contact" | "contract" | "payment") => Promise<void>;
  /** Fáze 1 fix: propagate create/apply callbacks for WorkActionsCard */
  onConfirmCreateNew?: () => void;
  onApproveAndApply?: (editedFields: Record<string, string>, options?: { overrideGateReasons?: string[]; overrideReason?: string }) => void | Promise<void>;
  onSelectClient?: (clientId: string) => void | Promise<void>;
  editedFields?: Record<string, string>;
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
  onExecuteDraftAction,
  onConfirmPendingField,
  onConfirmCreateNew,
  onApproveAndApply,
  onSelectClient,
  editedFields,
}: LeftPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showCrmMappingProposal = !doc.canonicalFields;

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

          {/* 4C: AdvisorOverviewCard – structured AI review summary with payment sync preview */}
          {doc.advisorReview ? (
            <div data-section="advisor">
              <AdvisorOverviewCard doc={doc} />
            </div>
          ) : null}

          {/* Phase 2+3: Canonical fields panel — persons, risks, health, investment, payment, bundle, publish hints */}
          {doc.canonicalFields && (
            <div data-section="canonical">
              <CanonicalFieldsPanel canonicalFields={doc.canonicalFields} />
            </div>
          )}

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
            {showCrmMappingProposal ? <CrmMappingProposalCard doc={doc} /> : null}
            <EnforcementResultCard doc={doc} onConfirmPendingField={onConfirmPendingField} />
            <WorkActionsCard
              doc={doc}
              onExecuteDraftAction={onExecuteDraftAction}
              onConfirmCreateNew={onConfirmCreateNew}
              onApproveAndApply={onApproveAndApply}
              onSelectClient={onSelectClient}
              editedFields={editedFields}
            />
            <DocumentFinalityWarning doc={doc} />
          </div>
        </div>
      </div>
    </div>
  );
}
