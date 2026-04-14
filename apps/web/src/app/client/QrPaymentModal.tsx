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

function createSpaydPayload(
  accountNumber: string,
  amountLabel: string,
  variableSymbol: string | null,
  specificSymbol: string | null | undefined,
  constantSymbol: string | null | undefined,
  note: string | null,
) {
  const amount = sanitizeAmount(amountLabel);
  const parts = [`SPD*1.0*ACC:${sanitizeAccount(accountNumber)}`];
  if (amount) parts.push(`AM:${amount.toFixed(2)}`);
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
    if (!open || !spaydPayload) return;
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
      className="fixed inset-0 z-[70] bg-slate-900/55 backdrop-blur-sm p-4 flex items-center justify-center client-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[30px] border border-slate-100 bg-white shadow-2xl overflow-hidden client-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-900">QR Platba</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-800"
            aria-label="Zavřít QR modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5 text-center">
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
