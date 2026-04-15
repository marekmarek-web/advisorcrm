"use client";

/**
 * Phase 2+3 canonical fields panel for the AI Review UI.
 * Renders participants, insured risks, health questionnaire warnings,
 * investment data, payment data, packet bundle info, and publish hints.
 * Never shows raw JSON or debug output.
 */

import React from "react";
import {
  Users,
  Shield,
  Heart,
  TrendingUp,
  CreditCard,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Stethoscope,
  Lock,
  IdCard,
  BookOpen,
} from "lucide-react";
import type { ExtractionDocument } from "@/lib/ai-review/types";
import { normalizeDateForAdvisorDisplay, normalizePaymentFrequency } from "@/lib/ai/canonical-date-normalize";
import { humanizeReviewReasonLine, labelDocumentType } from "@/lib/ai-review/czech-labels";
import { labelFundCategory, labelFvSourceType } from "@/lib/ai-review/label-dictionary";

type CanonicalFields = NonNullable<ExtractionDocument["canonicalFields"]>;

const PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  policyholder: "Pojistník",
  insured: "Pojištěný",
  legal_representative: "Zákonný zástupce",
  beneficiary: "Obmyšlený / oprávněná osoba",
  child: "Dítě / pojištěné dítě",
  child_insured: "Pojištěné dítě",
  co_applicant: "Spoludlužník",
  borrower: "Dlužník",
  guarantor: "Ručitel",
  other: "Ostatní",
};

function roleLabel(role: string | undefined): string {
  if (!role) return "Osoba";
  return PARTICIPANT_ROLE_LABELS[role] ?? "Role osoby — upřesněte podle dokumentu";
}

function formatAmount(v: string | number | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v.replace(/\s/g, "").replace(",", ".")) : v;
  if (!Number.isNaN(n)) return n.toLocaleString("cs-CZ") + " Kč";
  return String(v);
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  badge,
  badgeVariant = "neutral",
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  badge?: string | number;
  badgeVariant?: "neutral" | "warning" | "error" | "ok";
}) {
  const badgeClasses = {
    neutral: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-600",
    ok: "bg-emerald-50 text-emerald-700",
  }[badgeVariant];

  return (
    <div className="mb-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
        <Icon size={14} className="text-[color:var(--wp-text-secondary)] shrink-0" />
        <span className="text-xs font-semibold text-[color:var(--wp-text-primary)] uppercase tracking-wide">
          {title}
        </span>
        {badge != null && (
          <span className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded-full ${badgeClasses}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="px-4 py-3 text-sm text-[color:var(--wp-text-primary)] space-y-1.5">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 min-h-[20px]">
      <span className="text-xs text-[color:var(--wp-text-secondary)] shrink-0 w-36">{label}</span>
      <span className="text-xs text-right text-[color:var(--wp-text-primary)] break-words max-w-[200px]">
        {value ?? "—"}
      </span>
    </div>
  );
}

// ─── PacketMeta section ───────────────────────────────────────────────────────

function PacketMetaSection({ pm }: { pm: NonNullable<CanonicalFields["packetMeta"]> }) {
  const candidates = pm.subdocumentCandidates ?? [];
  const primaryType = pm.primarySubdocumentType?.trim()
    ? labelDocumentType(pm.primarySubdocumentType)
    : "—";
  return (
    <Section
      icon={Layers}
      title="Více dokumentů v jednom souboru"
      badge="Více sekcí"
      badgeVariant="warning"
    >
      <Row label="Hlavní typ dokumentu" value={primaryType} />
      {pm.isBundle && (
        <Row
          label="Rozpoznané sekce"
          value={candidates.length > 0 ? candidates.map((c) => c.label).join(", ") : "—"}
        />
      )}
      {pm.hasSensitiveAttachment && (
        <div className="flex items-start gap-2 mt-1 text-xs rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-800">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Obsahuje citlivou přílohu (zdravotní dotazník, AML). Příloha nesmí být publikována jako smlouva.</span>
        </div>
      )}
      {(pm.packetWarnings ?? []).map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-xs rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-800 mt-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{humanizeReviewReasonLine(w)}</span>
        </div>
      ))}
    </Section>
  );
}

// ─── PublishHints section ─────────────────────────────────────────────────────

function PublishHintsSection({ ph }: { ph: NonNullable<CanonicalFields["publishHints"]> }) {
  const isOk = ph.contractPublishable && !ph.sensitiveAttachmentOnly && !ph.needsSplit;
  return (
    <Section
      icon={ph.contractPublishable ? CheckCircle2 : Lock}
      title="Publikovatelnost"
      badgeVariant={isOk ? "ok" : "error"}
      badge={ph.contractPublishable ? "Publikovatelné" : "Vyžaduje kontrolu"}
    >
      {ph.contractPublishable ? (
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 size={12} />
          <span>Smlouva je připravena k zápisu do CRM.</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          <XCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            {ph.sensitiveAttachmentOnly
              ? "Dokument je citlivá příloha — nelze publikovat jako finální smlouvu."
              : ph.needsSplit
                ? "Dokument vyžaduje rozdělení před zápisem (více sekcí v jednom souboru)."
                : `Dokument není publikovatelný${ph.reasons?.length ? `: ${ph.reasons.map((x) => humanizeReviewReasonLine(x)).join(", ")}` : "."}`}
          </span>
        </div>
      )}
      {ph.needsManualValidation && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Vyžaduje ruční ověření před zápisem do CRM.</span>
        </div>
      )}
    </Section>
  );
}

// ─── Participants section ─────────────────────────────────────────────────────

function ParticipantsSection({ participants }: { participants: NonNullable<CanonicalFields["participants"]> }) {
  if (participants.length === 0) return null;
  return (
    <Section icon={Users} title="Osoby" badge={participants.length}>
      {participants.map((p, i) => (
        <div key={i} className="py-1 border-b border-[color:var(--wp-surface-card-border)] last:border-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{p.fullName ?? "—"}</span>
            <span className="text-xs text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded-full">
              {roleLabel(p.role)}
            </span>
          </div>
          {p.birthDate && (
            <span className="text-xs text-[color:var(--wp-text-secondary)]">
              nar. {normalizeDateForAdvisorDisplay(p.birthDate)}
            </span>
          )}
          {p.occupation && (
            <span className="text-xs text-[color:var(--wp-text-secondary)] ml-2">· {p.occupation}</span>
          )}
        </div>
      ))}
    </Section>
  );
}

// ─── InsuredRisks section ─────────────────────────────────────────────────────

function InsuredRisksSection({ risks }: { risks: NonNullable<CanonicalFields["insuredRisks"]> }) {
  if (risks.length === 0) return null;
  return (
    <Section icon={Shield} title="Pojištěná rizika" badge={risks.length}>
      {risks.map((r, i) => (
        <div key={i} className="py-1 border-b border-[color:var(--wp-surface-card-border)] last:border-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{r.riskLabel ?? r.riskType ?? "—"}</span>
            {r.insuredAmount != null && (
              <span className="text-xs text-[color:var(--wp-text-secondary)]">
                {formatAmount(r.insuredAmount)}
              </span>
            )}
          </div>
          {r.linkedParticipant && (
            <span className="text-xs text-[color:var(--wp-text-secondary)]">
              Pojištěný: {r.linkedParticipant}
            </span>
          )}
          {r.termEnd && (
            <span className="text-xs text-[color:var(--wp-text-secondary)] ml-1">
              do {normalizeDateForAdvisorDisplay(r.termEnd)}
            </span>
          )}
          {r.premium != null && (
            <span className="text-xs text-[color:var(--wp-text-secondary)] ml-2">
              · pojistné {formatAmount(r.premium)}
            </span>
          )}
        </div>
      ))}
    </Section>
  );
}

// ─── HealthQuestionnaires section ─────────────────────────────────────────────

function HealthSection({ hqs }: { hqs: NonNullable<CanonicalFields["healthQuestionnaires"]> }) {
  const present = hqs.filter((q) => q.questionnairePresent);
  if (present.length === 0) return null;
  return (
    <Section icon={Stethoscope} title="Zdravotní dotazníky" badge={present.length} badgeVariant="warning">
      <div className="flex items-start gap-2 text-xs rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-800">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        <span>
          Dokument obsahuje zdravotní dotazník — citlivá data. Tato sekce nesmí být sdílena jako součást smlouvy.
        </span>
      </div>
      {present.map((q, i) => (
        q.sectionSummary ? (
          <div key={i} className="text-xs text-[color:var(--wp-text-secondary)] mt-1">
            {q.linkedParticipant && <span className="font-medium">{q.linkedParticipant}: </span>}
            {q.sectionSummary}
          </div>
        ) : null
      ))}
    </Section>
  );
}

// ─── InvestmentData section ───────────────────────────────────────────────────

function InvestmentSection({ inv }: { inv: NonNullable<CanonicalFields["investmentData"]> }) {
  return (
    <Section icon={TrendingUp} title="Investice">
      {inv.isModeledData && (
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-1">
          <Info size={12} />
          <span>Modelovaná data — nejedná se o smluvní hodnoty.</span>
        </div>
      )}
      {inv.strategy && <Row label="Strategie" value={inv.strategy} />}
      {(inv.funds ?? []).length > 0 && (
        <Row
          label="Fondy"
          value={inv.funds!.map((f) =>
            f.allocation != null ? `${f.name} (${f.allocation}%)` : f.name
          ).join(", ")}
        />
      )}
    </Section>
  );
}

// ─── PaymentData section ──────────────────────────────────────────────────────

function PaymentDataSection({ pay }: { pay: NonNullable<CanonicalFields["paymentData"]> }) {
  const freq = pay.paymentFrequency ? normalizePaymentFrequency(pay.paymentFrequency) : "";
  const acc = pay.accountNumber || pay.bankAccount;
  const hasAny =
    pay.variableSymbol ||
    freq ||
    pay.iban ||
    acc ||
    pay.bankCode ||
    pay.paymentMethod;
  if (!hasAny) return null;
  const accountDisplay =
    pay.iban != null && pay.iban !== ""
      ? null
      : acc || pay.bankCode
        ? acc && pay.bankCode
          ? `${acc}/${pay.bankCode}`
          : acc || pay.bankCode
        : null;
  return (
    <Section icon={CreditCard} title="Platební údaje">
      {pay.variableSymbol && <Row label="Variabilní symbol" value={pay.variableSymbol} />}
      {freq && <Row label="Frekvence" value={freq} />}
      {pay.iban != null && pay.iban !== "" && <Row label="IBAN" value={pay.iban} />}
      {accountDisplay && <Row label="Účet příjemce" value={accountDisplay} />}
      {pay.paymentMethod && <Row label="Způsob platby" value={pay.paymentMethod} />}
    </Section>
  );
}

// ─── IdentityData section ─────────────────────────────────────────────────────

function IdentityDataSection({ id }: { id: NonNullable<CanonicalFields["identityData"]> }) {
  const hasAny = id.idCardNumber || id.idCardIssuedBy || id.idCardValidUntil || id.idCardIssuedAt || id.generalPractitioner;
  if (!hasAny) return null;
  return (
    <Section icon={IdCard} title="Doklad totožnosti">
      {id.idCardNumber && <Row label="Číslo dokladu / OP" value={id.idCardNumber} />}
      {id.idCardIssuedBy && <Row label="Doklad vydal" value={id.idCardIssuedBy} />}
      {id.idCardIssuedAt && (
        <Row label="Datum vydání" value={normalizeDateForAdvisorDisplay(id.idCardIssuedAt)} />
      )}
      {id.idCardValidUntil && (
        <Row label="Platnost do" value={normalizeDateForAdvisorDisplay(id.idCardValidUntil)} />
      )}
      {id.generalPractitioner && <Row label="Praktický lékař" value={id.generalPractitioner} />}
    </Section>
  );
}

// ─── FundResolution section ───────────────────────────────────────────────────

function FundResolutionSection({ fr }: { fr: NonNullable<CanonicalFields["fundResolution"]> }) {
  const hasAny = fr.resolvedFundId || fr.resolvedFundCategory || fr.fvSourceType;
  if (!hasAny) return null;
  return (
    <Section icon={BookOpen} title="Fond a budoucí hodnota">
      {fr.resolvedFundName && <Row label="Fond" value={fr.resolvedFundName} />}
      {fr.resolvedFundCategory && (
        <Row label="Kategorie fondu" value={labelFundCategory(fr.resolvedFundCategory)} />
      )}
      {fr.fvSourceType && (
        <Row label="Zdroj pro výpočet FV" value={labelFvSourceType(fr.fvSourceType)} />
      )}
    </Section>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function CanonicalFieldsPanel({ canonicalFields }: { canonicalFields: CanonicalFields }) {
  const { packetMeta, publishHints, participants, insuredRisks, healthQuestionnaires, investmentData, paymentData, identityData, fundResolution } = canonicalFields;

  const hasContent =
    packetMeta?.isBundle ||
    publishHints ||
    (participants?.length ?? 0) > 0 ||
    (insuredRisks?.length ?? 0) > 0 ||
    healthQuestionnaires?.some((q) => q.questionnairePresent) ||
    investmentData ||
    paymentData ||
    identityData ||
    fundResolution;

  if (!hasContent) return null;

  return (
    <div className="mt-4">
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-[color:var(--wp-text-secondary)]" />
          <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
            Kanonická extrakce
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--wp-text-secondary)] pl-5">
          Strukturovaný výpis z modelu (osoby, rizika, platby). Pole ve sloupcích vpravo u jednotlivých bloků jsou
          hodnoty připravené pro zápis do CRM — doplňují tento přehled, nejsou duplicitní výplň.
        </p>
      </div>

      {packetMeta?.isBundle && <PacketMetaSection pm={packetMeta} />}
      {publishHints && <PublishHintsSection ph={publishHints} />}
      {(participants?.length ?? 0) > 0 && <ParticipantsSection participants={participants!} />}
      {(insuredRisks?.length ?? 0) > 0 && <InsuredRisksSection risks={insuredRisks!} />}
      {healthQuestionnaires?.some((q) => q.questionnairePresent) && (
        <HealthSection hqs={healthQuestionnaires!} />
      )}
      {identityData && <IdentityDataSection id={identityData} />}
      {investmentData && <InvestmentSection inv={investmentData} />}
      {fundResolution && <FundResolutionSection fr={fundResolution} />}
      {paymentData && <PaymentDataSection pay={paymentData} />}
    </div>
  );
}
