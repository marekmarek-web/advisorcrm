"use client";

import { useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { PaymentFromImageDraft } from "@/app/actions/ai-payment-from-image";
import type { ManualPaymentSetupInput } from "@/app/actions/manual-payment-setup";

const SEGMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "other", label: "Jiné" },
  { value: "ZP", label: "Životní pojištění" },
  { value: "MAJ", label: "Majetkové pojištění" },
  { value: "ODP", label: "Odpovědnostní pojištění" },
  { value: "AUTO_PR", label: "Auto — povinné ručení" },
  { value: "AUTO_HAV", label: "Auto — havarijní" },
  { value: "CEST", label: "Cestovní pojištění" },
  { value: "FIRMA_POJ", label: "Pojištění firmy" },
  { value: "INV", label: "Investice" },
  { value: "DIP", label: "DIP" },
  { value: "DPS", label: "Penzijní spoření" },
  { value: "HYPO", label: "Hypotéka" },
  { value: "UVER", label: "Úvěr" },
];

export type PaymentDraftEditState = Omit<PaymentFromImageDraft, "missingFields" | "confidence" | "needsHumanReview">;

interface Props {
  draft: PaymentFromImageDraft;
  contactId: string | null;
  saving: boolean;
  onConfirm: (input: ManualPaymentSetupInput) => void;
  onCancel: () => void;
}

export function PaymentFromImageDraftPanel({ draft, contactId, saving, onConfirm, onCancel }: Props) {
  const [fields, setFields] = useState<PaymentDraftEditState>({
    providerName: draft.providerName,
    productName: draft.productName,
    segment: draft.segment,
    accountNumber: draft.accountNumber,
    iban: draft.iban,
    variableSymbol: draft.variableSymbol,
    constantSymbol: draft.constantSymbol,
    specificSymbol: draft.specificSymbol,
    amount: draft.amount,
    frequency: draft.frequency,
    firstPaymentDate: draft.firstPaymentDate,
    note: draft.note,
  });

  const set = <K extends keyof PaymentDraftEditState>(k: K, v: PaymentDraftEditState[K]) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const missingNow: string[] = [];
  if (!fields.providerName.trim()) missingNow.push("instituce");
  if (!fields.iban.trim() && !fields.accountNumber.trim()) missingNow.push("IBAN nebo číslo účtu");
  if (!fields.variableSymbol.trim()) missingNow.push("variabilní symbol");
  const canConfirm = missingNow.length === 0 && !!contactId;

  const handleConfirm = () => {
    if (!contactId || !canConfirm) return;
    const input: ManualPaymentSetupInput = {
      contactId,
      providerName: fields.providerName.trim(),
      productName: fields.productName.trim() || undefined,
      segment: fields.segment || "other",
      accountNumber: fields.accountNumber.trim(),
      iban: fields.iban.trim() || undefined,
      variableSymbol: fields.variableSymbol.trim(),
      constantSymbol: fields.constantSymbol.trim() || undefined,
      specificSymbol: fields.specificSymbol.trim() || undefined,
      amount: fields.amount.trim() || undefined,
      frequency: fields.frequency.trim() || undefined,
      firstPaymentDate: fields.firstPaymentDate.trim() || undefined,
      visibleToClient: false,
    };
    onConfirm(input);
  };

  const confidencePct = Math.round(draft.confidence * 100);

  return (
    <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-[color:var(--wp-text)]">Platební instrukce z obrázku</h3>
        <span className="text-[10px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-2 py-0.5 rounded-lg">
          Jistota: {confidencePct}&nbsp;%
        </span>
      </div>

      {/* Internal-only notice */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
        <Info size={13} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-800 leading-snug">
          Výstup je pouze informativní interní podklad pro poradce. Nejde o doporučení klientovi.
          Instrukce bude viditelná jen vám — klientovi ji zpřístupníte ručně po ověření.
        </p>
      </div>

      {draft.needsHumanReview && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">
          <AlertTriangle size={13} className="text-rose-600 shrink-0" />
          <p className="text-[11px] text-rose-800 font-bold">
            Vyžaduje kontrolu: AI si není jistá — ověřte hodnoty před uložením.
          </p>
        </div>
      )}

      {draft.missingFields.length > 0 && (
        <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-2">
          <p className="text-[11px] text-orange-800 font-bold mb-0.5">
            Chybějící nebo nerozpoznaná pole:
          </p>
          <p className="text-[11px] text-orange-700">{draft.missingFields.join(", ")}</p>
          <p className="text-[11px] text-orange-600 mt-0.5">Doplňte ručně — AI tato pole nedomýšlí.</p>
        </div>
      )}

      {!contactId && (
        <div className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2">
          <p className="text-[11px] text-slate-700 font-bold">Přejděte na detail klienta</p>
          <p className="text-[11px] text-slate-500">
            Platební instrukci nelze uložit bez vybraného klienta. Otevřete detail klienta a zkuste znovu.
          </p>
        </div>
      )}

      {/* Editable fields */}
      <div className="space-y-2">
        <FieldRow
          label="Instituce *"
          value={fields.providerName}
          onChange={(v) => set("providerName", v)}
          placeholder="Název banky / pojišťovny"
          highlight={!fields.providerName.trim()}
        />
        <FieldRow
          label="Produkt"
          value={fields.productName}
          onChange={(v) => set("productName", v)}
          placeholder="Název produktu"
        />
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-bold text-[color:var(--wp-text-secondary)]">Segment</label>
          <select
            value={fields.segment}
            onChange={(e) => set("segment", e.target.value)}
            className="w-full rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2.5 py-1.5 text-xs text-[color:var(--wp-text)] min-h-[36px]"
          >
            {SEGMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <FieldRow
          label="IBAN"
          value={fields.iban}
          onChange={(v) => set("iban", v)}
          placeholder="CZ…"
          highlight={!fields.iban.trim() && !fields.accountNumber.trim()}
        />
        <FieldRow
          label="Číslo účtu"
          value={fields.accountNumber}
          onChange={(v) => set("accountNumber", v)}
          placeholder="123456/0800"
          highlight={!fields.iban.trim() && !fields.accountNumber.trim()}
        />
        <FieldRow
          label="Variabilní symbol *"
          value={fields.variableSymbol}
          onChange={(v) => set("variableSymbol", v)}
          placeholder="VS"
          highlight={!fields.variableSymbol.trim()}
        />
        <FieldRow
          label="Konstantní symbol"
          value={fields.constantSymbol}
          onChange={(v) => set("constantSymbol", v)}
          placeholder="KS"
        />
        <FieldRow
          label="Specifický symbol"
          value={fields.specificSymbol}
          onChange={(v) => set("specificSymbol", v)}
          placeholder="SS"
        />
        <FieldRow
          label="Částka"
          value={fields.amount}
          onChange={(v) => set("amount", v)}
          placeholder="1500"
          type="text"
          inputMode="decimal"
        />
        <FieldRow
          label="Frekvence"
          value={fields.frequency}
          onChange={(v) => set("frequency", v)}
          placeholder="měsíčně"
        />
        <FieldRow
          label="Datum první platby"
          value={fields.firstPaymentDate}
          onChange={(v) => set("firstPaymentDate", v)}
          placeholder="01.01.2026"
        />
        {fields.note && (
          <div className="rounded-lg bg-[color:var(--wp-surface-muted)] px-2.5 py-1.5">
            <p className="text-[10px] text-[color:var(--wp-text-secondary)] font-bold mb-0.5">Poznámka AI:</p>
            <p className="text-[11px] text-[color:var(--wp-text-secondary)]">{fields.note}</p>
          </div>
        )}
      </div>

      {missingNow.length > 0 && (
        <p className="text-[11px] text-rose-600 font-bold">
          Doplňte povinná pole: {missingNow.join(", ")}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || saving}
          className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-black shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
              Ukládám…
            </>
          ) : (
            <>
              <CheckCircle2 size={16} className="shrink-0" aria-hidden />
              Vytvořit platební instrukce
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="min-h-[44px] px-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)] transition-colors disabled:opacity-40"
        >
          Zrušit
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  placeholder,
  highlight,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  highlight?: boolean;
  type?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className={`text-[11px] font-bold ${highlight ? "text-rose-600" : "text-[color:var(--wp-text-secondary)]"}`}>
        {label}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs text-[color:var(--wp-text)] min-h-[36px] outline-none focus:ring-2 focus:ring-indigo-100 ${
          highlight
            ? "border-rose-300 bg-rose-50 focus:border-rose-400"
            : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] focus:border-indigo-300"
        }`}
      />
    </div>
  );
}
