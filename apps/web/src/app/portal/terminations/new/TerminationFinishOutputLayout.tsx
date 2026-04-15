"use client";

import { FileSignature, Mail, Printer } from "lucide-react";
import { TerminationLetterPreviewPanel } from "./TerminationLetterPreviewPanel";
import type { TerminationLetterBuildResult } from "@/lib/terminations/termination-letter-types";
import { terminationDeliveryChannelLabel } from "@/lib/terminations/client";

type LeftPanelData = {
  clientName: string | null;
  clientSubline?: string | null;
  insurerName: string | null;
  insurerAddress?: string | null;
  contractNumber: string | null;
  terminationModeLabel: string | null;
  effectiveDateLabel: string | null;
  /** Režim do 2 měsíců – datum podání výpovědi. */
  submissionDateLabel?: string | null;
  deliveryChannelHint?: string | null;
};

type Props = {
  requestId: string;
  leftPanel: LeftPanelData;
  onBuildResult?: (data: TerminationLetterBuildResult) => void;
  showPersistButtons?: boolean;
  letterPlainTextDraft: string;
  onLetterPlainTextDraftChange: (plain: string) => void;
  /** ISO yyyy-mm-dd; prázdné = při generování dnešní datum. */
  letterHeaderDateIso: string;
  onLetterHeaderDateIsoChange: (iso: string) => void;
  /** Změna údajů vstupujících do dopisu → znovu načíst náhled ze serveru. */
  letterServerSyncKey: string;
};

export function TerminationFinishOutputLayout({
  requestId,
  leftPanel,
  onBuildResult,
  showPersistButtons = true,
  letterPlainTextDraft,
  onLetterPlainTextDraftChange,
  letterHeaderDateIso,
  onLetterHeaderDateIsoChange,
  letterServerSyncKey,
}: Props) {
  const deliveryLabel = leftPanel.deliveryChannelHint
    ? terminationDeliveryChannelLabel(leftPanel.deliveryChannelHint)
    : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-[color:var(--wp-surface-card-border)] dark:bg-[color:var(--wp-surface-card)] dark:shadow-black/25">
      {/* Header */}
      <div className="border-b border-slate-100 px-4 py-4 dark:border-[color:var(--wp-surface-card-border)] sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-950 dark:text-[color:var(--wp-text)]">Dokončit výstup</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-[color:var(--wp-text-secondary)]">
              Upravte text výpovědi v editoru. Tlačítkem &bdquo;Dokončit žádost&ldquo; uložíte žádost; &bdquo;Exportovat PDF&ldquo; vytiskne dokument.
            </div>
          </div>
          <div className="shrink-0 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-300">
            Náhled dokumentu
          </div>
        </div>
      </div>

      {/* Grid: left info + right letter preview */}
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left column */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-[color:var(--wp-surface-muted)]">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[color:var(--wp-text-tertiary)]">
              Klient
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-[color:var(--wp-text)]">
              {leftPanel.clientName || "\u2014"}
            </div>
            {leftPanel.clientSubline ? (
              <div className="mt-1 text-xs text-slate-500 dark:text-[color:var(--wp-text-secondary)]">
                {leftPanel.clientSubline}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-[color:var(--wp-surface-muted)]">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[color:var(--wp-text-tertiary)]">
              Instituce
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-[color:var(--wp-text)]">
              {leftPanel.insurerName || "\u2014"}
            </div>
            {leftPanel.insurerAddress ? (
              <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-[color:var(--wp-text-secondary)]">
                {leftPanel.insurerAddress}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-[color:var(--wp-surface-muted)]">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[color:var(--wp-text-tertiary)]">
              Souhrn
            </div>
            <div className="mt-2 space-y-2 text-sm text-slate-700 dark:text-[color:var(--wp-text-secondary)]">
              <div>
                <span className="font-medium">Číslo smlouvy:</span> {leftPanel.contractNumber || "\u2014"}
              </div>
              <div>
                <span className="font-medium">Typ ukončení:</span> {leftPanel.terminationModeLabel || "\u2014"}
              </div>
              {leftPanel.submissionDateLabel ? (
                <div>
                  <span className="font-medium">Datum podání:</span> {leftPanel.submissionDateLabel}
                </div>
              ) : null}
              <div>
                <span className="font-medium">Datum účinnosti / podle pravidel:</span>{" "}
                {leftPanel.effectiveDateLabel || "\u2014"}
              </div>
              {deliveryLabel ? (
                <div>
                  <span className="font-medium">Kanál:</span> {deliveryLabel}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <div className="text-sm font-semibold">Jak postupovat dál</div>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <div className="flex gap-3">
                <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <span>Zkontrolujte dopis v náhledu vpravo</span>
              </div>
              <div className="flex gap-3">
                <Printer className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <span>Export PDF vytiskne aktuální náhled; dokončení žádosti je samostatné tlačítko</span>
              </div>
              <div className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <span>Po dokončení bude žádost přesunuta ke kontrole nebo k odeslání</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: letter preview */}
        <div className="min-w-0">
          <div className="mb-4">
            <label
              htmlFor="termination-letter-header-date"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-[color:var(--wp-text-tertiary)]"
            >
              Datum v záhlaví dopisu
            </label>
            <input
              id="termination-letter-header-date"
              type="date"
              value={letterHeaderDateIso}
              onChange={(e) => onLetterHeaderDateIsoChange(e.target.value)}
              className="h-11 w-full max-w-xs rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100 dark:border-[color:var(--wp-input-border)] dark:bg-[color:var(--wp-input-bg)] dark:text-[color:var(--wp-text)] dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-[color:var(--wp-text-secondary)]">
              Volitelné – prázdné pole = dnešní datum; po výběru se první řádek dopisu přepíše.
            </p>
          </div>
          <TerminationLetterPreviewPanel
            requestId={requestId}
            layout="wizardFinish"
            suppressValidityBanner
            onBuildResult={onBuildResult}
            showPersistButtons={showPersistButtons}
            wizardLetterDraft={letterPlainTextDraft}
            onWizardLetterDraftChange={onLetterPlainTextDraftChange}
            letterServerSyncKey={letterServerSyncKey}
          />
        </div>
      </div>
    </div>
  );
}
