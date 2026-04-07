"use client";

import { useEffect, useState, useTransition } from "react";
import { getTerminationLetterPreview, saveTerminationGeneratedDocumentAction } from "@/app/actions/terminations";
import type { TerminationLetterBuildResult } from "@/lib/terminations/termination-letter-types";

function badgeClasses(badge: TerminationLetterBuildResult["badge"]): string {
  switch (badge) {
    case "free_form":
      return "bg-emerald-100 text-emerald-950 border-emerald-200";
    case "official_form":
      return "bg-indigo-100 text-indigo-950 border-indigo-200";
    case "review_required":
      return "bg-amber-100 text-amber-950 border-amber-200";
    default:
      return "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] border-[color:var(--wp-border)]";
  }
}

function badgeLabel(badge: TerminationLetterBuildResult["badge"]): string {
  switch (badge) {
    case "free_form":
      return "Volná forma";
    case "official_form":
      return "Oficiální formulář";
    case "review_required":
      return "Vyžaduje kontrolu";
    default:
      return badge;
  }
}

function channelLabel(ch: TerminationLetterBuildResult["viewModel"]["deliveryChannel"]): string {
  switch (ch) {
    case "post":
      return "Pošta / písemně";
    case "email":
      return "E-mail";
    case "databox":
      return "Datová schránka";
    case "portal":
      return "Portál pojišťovny";
    case "form":
      return "Formulář pojišťovny";
    default:
      return ch;
  }
}

function publishLabel(state: TerminationLetterBuildResult["publishState"]): string {
  switch (state) {
    case "ready_to_send":
      return "Lze považovat za připravené k odeslání (po kontrole poradce).";
    case "draft_only":
      return "Pouze koncept – není finální k odeslání.";
    case "review_required":
      return "Vyžaduje kontrolu před odesláním.";
    default:
      return state;
  }
}

type PreviewTab = "text" | "html";

export function TerminationLetterPreviewPanel({
  requestId,
  showPersistButtons = true,
}: {
  requestId: string;
  /** Uložení do CRM dokumentů (vyžaduje documents:write). */
  showPersistButtons?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TerminationLetterBuildResult | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("text");
  const [persistMsg, setPersistMsg] = useState<string | null>(null);
  const [persistPending, startPersist] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getTerminationLetterPreview(requestId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (loading) {
    return (
      <div className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] p-4 text-sm text-[color:var(--wp-text-secondary)]">
        Načítám náhled dokumentu…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[var(--wp-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error ?? "Náhled se nepodařilo načíst."}
      </div>
    );
  }

  const {
    viewModel: vm,
    badge,
    publishState,
    letterPlainText,
    letterHtml,
    officialForm,
    coveringLetterPlainText,
    coveringLetterHtml,
    validityReasons,
    previewWatermark,
  } = data;
  const eff = vm.computedEffectiveDate ?? vm.requestedEffectiveDate ?? "—";
  const attachmentsUi =
    vm.attachments.length > 0 ? vm.attachmentsSummaryText : "Bez příloh";

  const hasLetterPreview = Boolean(letterPlainText || letterHtml);
  const hasCoverPreview = Boolean(coveringLetterPlainText || coveringLetterHtml);
  const showTabSwitch = hasLetterPreview || hasCoverPreview;

  return (
    <div className="space-y-4 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)]/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeClasses(badge)}`}
        >
          {badgeLabel(badge)}
        </span>
        <span className="text-xs text-[color:var(--wp-text-secondary)]">{publishLabel(publishState)}</span>
      </div>

      {previewWatermark ? (
        <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-[var(--wp-radius)] px-3 py-2">
          {previewWatermark}
        </p>
      ) : null}

      {vm.advisorNoteForReview?.trim() ? (
        <div className="rounded-[var(--wp-radius)] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
          <span className="font-semibold">Poznámka pro kontrolu: </span>
          {vm.advisorNoteForReview.trim()}
        </div>
      ) : null}

      <div className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-3 text-xs space-y-1.5 text-[color:var(--wp-text-secondary)]">
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Pojistník (dopis):</span>{" "}
          {vm.policyholderKind === "company"
            ? `${(vm.policyholderCompanyName ?? vm.policyholderName).trim() || "—"} (firma)`
            : vm.policyholderName.trim() || "—"}
        </p>
        {vm.policyholderKind === "company" && vm.policyholderAuthorizedPersonName?.trim() ? (
          <p>
            <span className="font-semibold text-[color:var(--wp-text)]">Oprávněná osoba:</span>{" "}
            {vm.policyholderAuthorizedPersonName.trim()}
            {vm.policyholderAuthorizedPersonRole?.trim()
              ? `, ${vm.policyholderAuthorizedPersonRole.trim()}`
              : ""}
          </p>
        ) : null}
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Pojišťovna:</span> {vm.insurerName}
        </p>
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Smlouva:</span> {vm.contractNumber}
        </p>
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Režim:</span> {vm.terminationModeLabel}
        </p>
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Datum účinnosti (zobrazení):</span>{" "}
          {eff}
        </p>
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Kanál odeslání:</span>{" "}
          {channelLabel(vm.deliveryChannel)}
        </p>
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Přílohy:</span> {attachmentsUi}
        </p>
        {vm.legalBasisShort ? (
          <p className="pt-1 border-t border-[color:var(--wp-border)] text-[10px] leading-snug">
            <span className="font-semibold">Interní právní poznámka:</span> {vm.legalBasisShort}
          </p>
        ) : null}
      </div>

      {validityReasons.length > 0 ? (
        <ul className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-[var(--wp-radius)] px-3 py-2 list-disc pl-5">
          {validityReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}

      {officialForm ? (
        <div className="rounded-[var(--wp-radius)] border border-indigo-200 bg-indigo-50/80 p-4 text-sm space-y-3 text-indigo-950">
          <p className="font-bold text-base">{officialForm.title}</p>
          <p className="whitespace-pre-wrap">{officialForm.body}</p>
          <ul className="list-disc pl-5 space-y-1">
            {officialForm.instructionLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-xs text-indigo-800/90">
            Doporučené akce: {officialForm.ctaHints.join(" · ")}
          </p>
        </div>
      ) : null}

      {showPersistButtons ? (
        <div className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-3 space-y-2">
          <p className="text-xs font-semibold text-[color:var(--wp-text-muted)]">Uložit do dokumentů (CRM)</p>
          <div className="flex flex-wrap gap-2">
            {letterPlainText?.trim() ? (
              <button
                type="button"
                disabled={persistPending}
                onClick={() => {
                  setPersistMsg(null);
                  startPersist(async () => {
                    const r = await saveTerminationGeneratedDocumentAction(requestId, "draft_letter");
                    setPersistMsg(r.ok ? `Dopis uložen (dokument ${r.documentId.slice(0, 8)}…).` : r.error);
                  });
                }}
                className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-xs font-semibold min-h-[40px] disabled:opacity-50"
              >
                Uložit hlavní dopis
              </button>
            ) : null}
            {coveringLetterPlainText?.trim() ? (
              <button
                type="button"
                disabled={persistPending}
                onClick={() => {
                  setPersistMsg(null);
                  startPersist(async () => {
                    const r = await saveTerminationGeneratedDocumentAction(requestId, "cover_letter");
                    setPersistMsg(r.ok ? `Průvodní dopis uložen (dokument ${r.documentId.slice(0, 8)}…).` : r.error);
                  });
                }}
                className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-xs font-semibold min-h-[40px] disabled:opacity-50"
              >
                Uložit průvodní dopis
              </button>
            ) : null}
          </div>
          {!letterPlainText?.trim() && !coveringLetterPlainText?.trim() ? (
            <p className="text-xs text-[color:var(--wp-text-secondary)]">
              Není co uložit jako textový soubor (zkontrolujte režim výpovědi).
            </p>
          ) : null}
          {persistMsg ? (
            <p
              className={`text-xs ${persistMsg.includes("uložen") ? "text-emerald-800" : "text-red-700"}`}
              role="status"
            >
              {persistMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      {showTabSwitch ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPreviewTab("text")}
            className={`rounded-[var(--wp-radius)] px-3 py-1.5 text-xs font-semibold min-h-[36px] ${
              previewTab === "text"
                ? "bg-[var(--wp-accent)] text-white"
                : "border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)]"
            }`}
          >
            Prostý text
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab("html")}
            className={`rounded-[var(--wp-radius)] px-3 py-1.5 text-xs font-semibold min-h-[36px] ${
              previewTab === "html"
                ? "bg-[var(--wp-accent)] text-white"
                : "border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)]"
            }`}
          >
            HTML náhled
          </button>
        </div>
      ) : null}

      {hasCoverPreview ? (
        <div>
          <p className="text-xs font-semibold text-[color:var(--wp-text-muted)] mb-2">Průvodní dopis</p>
          {previewTab === "text" && coveringLetterPlainText ? (
            <pre className="whitespace-pre-wrap rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(320px,40vh)] overflow-y-auto font-sans">
              {coveringLetterPlainText}
            </pre>
          ) : null}
          {previewTab === "html" && coveringLetterHtml ? (
            <div
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(320px,40vh)] overflow-y-auto [&_.termination-letter-html_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: coveringLetterHtml }}
            />
          ) : null}
        </div>
      ) : null}

      {hasLetterPreview ? (
        <div>
          <p className="text-xs font-semibold text-[color:var(--wp-text-muted)] mb-2">Náhled dopisu</p>
          {previewTab === "text" && letterPlainText ? (
            <pre className="whitespace-pre-wrap rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(480px,55vh)] overflow-y-auto font-sans">
              {letterPlainText}
            </pre>
          ) : null}
          {previewTab === "html" && letterHtml ? (
            <div
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(480px,55vh)] overflow-y-auto [&_.termination-letter-html_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: letterHtml }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
