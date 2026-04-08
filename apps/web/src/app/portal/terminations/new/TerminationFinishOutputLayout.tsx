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
  deliveryChannelHint?: string | null;
};

type Props = {
  requestId: string;
  leftPanel: LeftPanelData;
  onBuildResult?: (data: TerminationLetterBuildResult) => void;
  showPersistButtons?: boolean;
  letterPlainTextDraft: string;
  onLetterPlainTextDraftChange: (plain: string) => void;
};

export function TerminationFinishOutputLayout({
  requestId,
  leftPanel,
  onBuildResult,
  showPersistButtons = true,
  letterPlainTextDraft,
  onLetterPlainTextDraftChange,
}: Props) {
  const deliveryLabel = leftPanel.deliveryChannelHint
    ? terminationDeliveryChannelLabel(leftPanel.deliveryChannelHint)
    : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      {/* Header */}
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-950">Dokončit výstup</div>
            <div className="mt-1 text-sm text-slate-500">
              Upravte text výpovědi v poli vpravo. „Náhled tisk / PDF“ ověří vzhled; úplné uložení je tlačítkem „Export
              do PDF“ dole.
            </div>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Náhled dokumentu
          </div>
        </div>
      </div>

      {/* Grid: left info + right letter preview */}
      <div className="grid gap-6 p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left column */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Klient</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{leftPanel.clientName || "—"}</div>
            {leftPanel.clientSubline ? (
              <div className="mt-1 text-xs text-slate-500">{leftPanel.clientSubline}</div>
            ) : null}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Instituce</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{leftPanel.insurerName || "—"}</div>
            {leftPanel.insurerAddress ? (
              <div className="mt-1 text-xs leading-5 text-slate-500">{leftPanel.insurerAddress}</div>
            ) : null}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Souhrn</div>
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-medium">Číslo smlouvy:</span> {leftPanel.contractNumber || "—"}
              </div>
              <div>
                <span className="font-medium">Typ ukončení:</span> {leftPanel.terminationModeLabel || "—"}
              </div>
              <div>
                <span className="font-medium">Datum účinnosti:</span> {leftPanel.effectiveDateLabel || "—"}
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
                <span>Export do PDF uloží žádost a otevře tisk / uložení jako PDF</span>
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
          <TerminationLetterPreviewPanel
            requestId={requestId}
            layout="wizardFinish"
            suppressValidityBanner
            onBuildResult={onBuildResult}
            showPersistButtons={showPersistButtons}
            wizardLetterDraft={letterPlainTextDraft}
            onWizardLetterDraftChange={onLetterPlainTextDraftChange}
          />
        </div>
      </div>
    </div>
  );
}
