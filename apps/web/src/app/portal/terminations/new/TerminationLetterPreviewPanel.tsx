"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getTerminationLetterPreview, saveTerminationGeneratedDocumentAction } from "@/app/actions/terminations";
import { terminationDeliveryChannelLabel } from "@/lib/terminations/client";
import type { TerminationLetterBuildResult } from "@/lib/terminations/termination-letter-types";
import {
  openTerminationLetterPrintWindow,
  plainTextToLetterHtml,
} from "@/lib/terminations/termination-letter-html";
import { formatIsoDateForUiCs } from "@/lib/forms/cz-date";

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
  showPrintButton = true,
  suppressValidityBanner = false,
  layout = "default",
  /** advisor = jen finální HTML náhled + tisk; full = text/HTML záložky a souhrnný blok. */
  surface = "full",
  onBuildResult,
  wizardLetterDraft,
  onWizardLetterDraftChange,
  letterServerSyncKey,
}: {
  requestId: string;
  /** Uložení do CRM dokumentů (vyžaduje documents:write). */
  showPersistButtons?: boolean;
  /** Tisk / uložení jako PDF přes dialog prohlížeče. */
  showPrintButton?: boolean;
  /** Skrýt žlutý seznam validityReasons uvnitř panelu (hlášky se pak posílají přes onBuildResult). */
  suppressValidityBanner?: boolean;
  /** Režim dokončení wizardu: jen čistý dopis v kartě (bez badge, watermarku, souhrnu). */
  layout?: "default" | "wizardFinish";
  surface?: "advisor" | "full";
  /** Callback po úspěšném načtení výsledku buildu (pro banner nad wizardem). */
  onBuildResult?: (data: TerminationLetterBuildResult) => void;
  /** Wizard: řízený text dopisu z rodiče (editovatelný výstup před PDF). */
  wizardLetterDraft?: string;
  onWizardLetterDraftChange?: (plain: string) => void;
  /**
   * Změna klíčových polí (režim, data, instituce, číslo smlouvy, …) → znovu načíst náhled ze serveru (merge s draftem).
   * Bez toho při stejném requestId zůstane zastaralý dopis po návratu z předchozích kroků.
   */
  letterServerSyncKey?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TerminationLetterBuildResult | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("text");
  const [persistMsg, setPersistMsg] = useState<string | null>(null);
  const [persistPending, startPersist] = useTransition();
  const [letterDraft, setLetterDraft] = useState("");
  const [letterSaved, setLetterSaved] = useState("");
  const [coverDraft, setCoverDraft] = useState("");
  const [coverSaved, setCoverSaved] = useState("");
  const [editSaveMsg, setEditSaveMsg] = useState<string | null>(null);
  const onBuildResultRef = useRef(onBuildResult);
  onBuildResultRef.current = onBuildResult;

  const syncKey = letterServerSyncKey ?? "";

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset před async fetch náhledu */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void getTerminationLetterPreview(requestId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setData(res.data);
      onBuildResultRef.current?.(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [requestId, syncKey]);

  useEffect(() => {
    if (!data || loading) return;
    const lp = data.letterPlainText ?? "";
    const cp = data.coveringLetterPlainText ?? "";
    if (layout === "wizardFinish" && onWizardLetterDraftChange) {
      const incoming = lp.trim();
      const current = (wizardLetterDraft ?? "").trim();
      if (incoming !== current) {
        onWizardLetterDraftChange(lp);
      }
      setLetterSaved(lp);
    } else {
      setLetterDraft(lp);
      setLetterSaved(lp);
    }
    setCoverDraft(cp);
    setCoverSaved(cp);
    setEditSaveMsg(null);
  }, [data, loading, requestId, layout, onWizardLetterDraftChange, syncKey]); // eslint-disable-line react-hooks/exhaustive-deps -- wizardLetterDraft jen při seedu při změně `data`

  if (loading) {
    return (
      <div
        className={
          layout === "wizardFinish"
            ? "rounded-[26px] border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500"
            : "rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] p-4 text-sm text-[color:var(--wp-text-secondary)]"
        }
      >
        Načítám náhled dokumentu…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className={
          layout === "wizardFinish"
            ? "rounded-[26px] border border-red-200 bg-red-50 p-6 text-sm text-red-800"
            : "rounded-[var(--wp-radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        }
      >
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
  const eff = formatIsoDateForUiCs(vm.computedEffectiveDate ?? vm.requestedEffectiveDate ?? null);
  const subEff = formatIsoDateForUiCs(vm.requestedSubmissionDate ?? null);
  const attachmentsUi =
    vm.attachments.length > 0 ? vm.attachmentsSummaryText : "Bez příloh";

  const hasLetterPreview = Boolean(letterPlainText || letterHtml);
  const hasCoverPreview = Boolean(coveringLetterPlainText || coveringLetterHtml);
  const advisorSurface = surface === "advisor";
  const showTabSwitch = !advisorSurface && (hasLetterPreview || hasCoverPreview);

  const letterDirty = letterDraft !== letterSaved;
  const coverDirty = coverDraft !== coverSaved;

  function printCurrentPreview() {
    const fromSavedPlain = (): string | null => {
      if (hasLetterPreview && letterSaved.trim()) return plainTextToLetterHtml(letterSaved);
      if (hasCoverPreview && coverSaved.trim()) return plainTextToLetterHtml(coverSaved);
      return null;
    };
    let html: string | null = fromSavedPlain();
    if (!html) {
      html = letterHtml ?? coveringLetterHtml ?? null;
    }
    if (!html) return;
    openTerminationLetterPrintWindow(html, "Náhled výpovědi");
  }

  if (layout === "wizardFinish") {
    const controlled = Boolean(onWizardLetterDraftChange);
    const letterBody =
      (controlled ? wizardLetterDraft?.trim() : letterSaved.trim()) || (letterPlainText ?? "").trim();
    const coverT = coverSaved.trim() || (coveringLetterPlainText ?? "").trim();
    const canPrint =
      Boolean(letterBody) ||
      Boolean(officialForm) ||
      Boolean(coverT && hasCoverPreview) ||
      Boolean(coveringLetterHtml);

    function printWizardLetter() {
      const t = letterBody;
      if (!t) return;
      openTerminationLetterPrintWindow(plainTextToLetterHtml(t), "Výpověď – tisk");
    }

    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        {officialForm ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p className="text-base font-bold text-slate-950">{officialForm.title}</p>
            <p className="whitespace-pre-wrap">{officialForm.body}</p>
            <ul className="list-disc space-y-1 pl-5">
              {officialForm.instructionLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Text dopisu (upravte přímo)
            </label>
            <textarea
              value={controlled ? (wizardLetterDraft ?? "") : letterDraft}
              onChange={(e) => {
                if (controlled) {
                  onWizardLetterDraftChange?.(e.target.value);
                } else {
                  setLetterDraft(e.target.value);
                  setLetterSaved(e.target.value);
                }
              }}
              spellCheck={false}
              placeholder="Načítám nebo doplňte text výpovědi…"
              className="min-h-[min(520px,70vh)] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-900 whitespace-pre-wrap outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </>
        )}
        {showPrintButton ? (
          <button
            type="button"
            onClick={() => (officialForm ? printCurrentPreview() : printWizardLetter())}
            disabled={!canPrint}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Rychlý náhled tisku
          </button>
        ) : null}
      </div>
    );
  }

  const showPersistUi = showPersistButtons && !advisorSurface;

  return (
    <div className="space-y-4 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)]/40 p-4">
      {!advisorSurface ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeClasses(badge)}`}
          >
            {badgeLabel(badge)}
          </span>
          <span className="text-xs text-[color:var(--wp-text-secondary)]">{publishLabel(publishState)}</span>
        </div>
      ) : null}

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

      {!advisorSurface ? (
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
        {vm.requestedSubmissionDate?.trim() ? (
          <p>
            <span className="font-semibold text-[color:var(--wp-text)]">Datum podání:</span> {subEff}
          </p>
        ) : null}
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Datum účinnosti (zobrazení):</span>{" "}
          {eff}
        </p>
        <p>
          <span className="font-semibold text-[color:var(--wp-text)]">Kanál odeslání:</span>{" "}
          {terminationDeliveryChannelLabel(vm.deliveryChannel)}
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
      ) : null}

      {!suppressValidityBanner && validityReasons.length > 0 ? (
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

      {showPersistUi ? (
        <div className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-3 space-y-2">
          <p className="text-xs font-semibold text-[color:var(--wp-text-muted)]">Uložit do dokumentů (CRM)</p>
          <div className="flex flex-wrap gap-2">
            {letterSaved?.trim() ? (
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
            {coverSaved?.trim() ? (
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
          {!letterSaved?.trim() && !coverSaved?.trim() ? (
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

      {showTabSwitch || showPrintButton || hasLetterPreview || hasCoverPreview ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {showTabSwitch ? (
              <>
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
              </>
            ) : null}
            {showPrintButton ? (
              <button
                type="button"
                onClick={() => printCurrentPreview()}
                disabled={!letterSaved.trim() && !letterHtml && !coverSaved.trim() && !coveringLetterHtml}
                className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-3 py-1.5 text-xs font-semibold min-h-[36px] disabled:opacity-40"
              >
                Tisk / PDF
              </button>
            ) : null}
          </div>
          {!advisorSurface && (hasLetterPreview || hasCoverPreview) ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!letterDirty && !coverDirty}
                onClick={() => {
                  setLetterSaved(letterDraft);
                  setCoverSaved(coverDraft);
                  setEditSaveMsg("Úpravy uloženy v náhledu (tisk / PDF / HTML).");
                }}
                className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-3 py-2 text-xs font-semibold text-white min-h-[40px] disabled:opacity-40"
              >
                Uložit úpravy
              </button>
              {editSaveMsg ? (
                <span className="text-xs text-[color:var(--wp-text-secondary)]" role="status">
                  {editSaveMsg}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasCoverPreview ? (
        <div>
          <p className="text-xs font-semibold text-[color:var(--wp-text-muted)] mb-2">Průvodní dopis</p>
          {advisorSurface ? (
            <div
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(520px,60vh)] overflow-y-auto [&_.termination-letter-html_p]:mb-3"
              dangerouslySetInnerHTML={{
                __html: coveringLetterHtml ?? plainTextToLetterHtml(coverSaved),
              }}
            />
          ) : null}
          {!advisorSurface && previewTab === "text" && coveringLetterPlainText ? (
            <textarea
              value={coverDraft}
              onChange={(e) => {
                setCoverDraft(e.target.value);
                setEditSaveMsg(null);
              }}
              spellCheck={false}
              className="min-h-[min(520px,60vh)] w-full resize-y rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] font-mono"
            />
          ) : null}
          {!advisorSurface && previewTab === "html" && coveringLetterPlainText ? (
            <div
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(520px,60vh)] overflow-y-auto [&_.termination-letter-html_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: plainTextToLetterHtml(coverSaved) }}
            />
          ) : null}
        </div>
      ) : null}

      {hasLetterPreview ? (
        <div>
          {!advisorSurface ? (
            <p className="text-xs font-semibold text-[color:var(--wp-text-muted)] mb-2">Náhled dopisu</p>
          ) : (
            <p className="text-xs font-semibold text-[color:var(--wp-text-muted)] mb-2">Dopis</p>
          )}
          {advisorSurface ? (
            <div
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(720px,80vh)] overflow-y-auto [&_.termination-letter-html_p]:mb-3"
              dangerouslySetInnerHTML={{
                __html: letterHtml ?? plainTextToLetterHtml(letterSaved),
              }}
            />
          ) : null}
          {!advisorSurface && previewTab === "text" && letterPlainText ? (
            <textarea
              value={letterDraft}
              onChange={(e) => {
                setLetterDraft(e.target.value);
                setEditSaveMsg(null);
              }}
              spellCheck={false}
              className="min-h-[min(520px,60vh)] w-full resize-y rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] font-mono"
            />
          ) : null}
          {!advisorSurface && previewTab === "html" && letterPlainText ? (
            <div
              className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 text-sm text-[color:var(--wp-text)] max-h-[min(520px,60vh)] overflow-y-auto [&_.termination-letter-html_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: plainTextToLetterHtml(letterSaved) }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
