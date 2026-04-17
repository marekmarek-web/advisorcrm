"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";

type QrPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  payment: {
    partnerName: string;
    productName: string | null;
    accountNumber: string;
    amountLabel: string;
    variableSymbol: string | null;
    specificSymbol?: string | null;
    constantSymbol?: string | null;
    note: string | null;
  } | null;
};

function sanitizeAccount(account: string): string {
  return account.replace(/\s+/g, "");
}

function sanitizeAmount(amountLabel: string): number | null {
  const normalized = amountLabel.replace(/[^\d,.]/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isCzechOrGeneralIban(account: string): boolean {
  const c = account.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(c) && c.length >= 15;
}

/**
 * Převede české domácí číslo účtu (formát [prefix-]číslo/kódbanky) na IBAN.
 * SPAYD standard (ČNB/CBA) vyžaduje IBAN v poli ACC: — jinak bankovní
 * aplikace QR odmítnou jako neplatný.
 */
function czechDomesticToIban(account: string): string | null {
  const m = account.replace(/\s+/g, "").match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
  if (!m) return null;
  const prefix = (m[1] ?? "0").padStart(6, "0");
  const number = m[2].padStart(10, "0");
  const bankCode = m[3];
  const bban = `${bankCode}${prefix}${number}`;
  // Mod97 check: bban + "CZ" (→ 1235) + "00"
  const checkInput = `${bban}123500`;
  const mod = BigInt(checkInput) % 97n;
  const checkDigits = String(98n - mod).padStart(2, "0");
  return `CZ${checkDigits}${bban}`;
}

function accountToIban(accountNumber: string): string {
  const raw = sanitizeAccount(accountNumber);
  if (isCzechOrGeneralIban(raw)) return raw;
  return czechDomesticToIban(raw) ?? raw;
}

function createSpaydPayload(
  accountNumber: string,
  amountLabel: string,
  variableSymbol: string | null,
  specificSymbol: string | null | undefined,
  constantSymbol: string | null | undefined,
  note: string | null,
): string | null {
  const iban = accountToIban(accountNumber);
  // Pokud se převod nezdařil a stále nemáme IBAN, payload nebude platný
  if (!isCzechOrGeneralIban(iban)) return null;

  const amount = sanitizeAmount(amountLabel);
  const parts = [`SPD*1.0*ACC:${iban}`];
  if (amount) {
    parts.push(`AM:${amount.toFixed(2)}`);
    parts.push("CC:CZK");
  }
  if (variableSymbol?.trim()) parts.push(`X-VS:${variableSymbol.trim()}`);
  if (specificSymbol?.trim()) parts.push(`X-SS:${specificSymbol.trim()}`);
  if (constantSymbol?.trim()) parts.push(`X-KS:${constantSymbol.trim()}`);
  if (note?.trim()) parts.push(`MSG:${note.trim().slice(0, 60)}`);
  return parts.join("*");
}

export function QrPaymentModal({ open, onClose, payment }: QrPaymentModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const spaydPayload = useMemo(() => {
    if (!payment) return "";
    return createSpaydPayload(
      payment.accountNumber,
      payment.amountLabel,
      payment.variableSymbol,
      payment.specificSymbol,
      payment.constantSymbol,
      payment.note,
    );
  }, [payment]);

  useEffect(() => {
    if (!open || !spaydPayload) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(spaydPayload, {
      width: 280,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [open, spaydPayload]);

  if (!open || !payment) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/55 backdrop-blur-sm p-0 sm:p-4 flex items-end sm:items-center justify-center client-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[28px] sm:rounded-[30px] border border-slate-100 border-b-0 sm:border-b bg-white shadow-2xl overflow-hidden client-scale-in max-h-[min(92dvh,640px)] sm:max-h-none flex flex-col pb-[max(0.75rem,var(--safe-area-bottom))] sm:pb-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-900">QR Platba</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-800 grid place-items-center touch-manipulation"
            aria-label="Zavřít QR modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 sm:space-y-5 text-center overflow-y-auto">
          <div>
            <p className="text-sm font-bold text-slate-900">{payment.partnerName}</p>
            {payment.productName && (
              <p className="text-xs text-slate-500 font-medium mt-1">{payment.productName}</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR platba"
                className="mx-auto w-[240px] h-[240px] rounded-xl bg-white"
              />
            ) : (
              <div className="mx-auto w-[240px] h-[240px] rounded-xl bg-white border border-slate-200 flex items-center justify-center text-sm text-slate-500">
                QR kód nelze vygenerovat
              </div>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-left space-y-1">
            <p className="text-xs text-slate-500 font-bold">
              Účet: <span className="text-slate-800 font-black">{payment.accountNumber}</span>
            </p>
            <p className="text-xs text-slate-500 font-bold">
              Částka: <span className="text-slate-800 font-black">{payment.amountLabel}</span>
            </p>
            {payment.variableSymbol && (
              <p className="text-xs text-slate-500 font-bold">
                VS: <span className="text-slate-800 font-black">{payment.variableSymbol}</span>
              </p>
            )}
            {payment.specificSymbol && (
              <p className="text-xs text-slate-500 font-bold">
                SS: <span className="text-slate-800 font-black">{payment.specificSymbol}</span>
              </p>
            )}
            {payment.constantSymbol && (
              <p className="text-xs text-slate-500 font-bold">
                KS: <span className="text-slate-800 font-black">{payment.constantSymbol}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
