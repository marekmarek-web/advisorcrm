"use client";

import { useRef, useEffect } from "react";
import { formatCurrency } from "@/lib/calculators/pension/formatters";
import type { PensionState } from "@/lib/calculators/pension/pension.types";
import type { PensionResult } from "@/lib/calculators/pension/pension.types";

import { useToast } from "@/app/components/Toast";

const FORMSUBMIT_URL = "https://formsubmit.co/ajax/kontakt@marek-marek.cz";

export interface PensionContactModalProps {
  open: boolean;
  onClose: () => void;
  state: PensionState;
  result: PensionResult;
  onSubmitSuccess?: () => void;
}

export function PensionContactModal({
  open,
  onClose,
  state,
  result,
  onSubmitSuccess,
}: PensionContactModalProps) {
  const toast = useToast();
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      backdropRef.current?.classList.remove("opacity-0");
      contentRef.current?.classList.remove("opacity-0", "scale-95");
      contentRef.current?.classList.add("scale-100");
    }, 10);
    return () => clearTimeout(t);
  }, [open]);

  const handleClose = () => {
    backdropRef.current?.classList.add("opacity-0");
    contentRef.current?.classList.remove("scale-100");
    contentRef.current?.classList.add("opacity-0", "scale-95");
    setTimeout(onClose, 300);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const originalText = submitBtn?.textContent ?? "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Odesílám...";
    }

    const formData = new FormData(form);
    formData.set("_subject", "Nový lead: Penzijní kalkulačka – Chci tento plán nastavit");
    formData.set("_captcha", "false");
    formData.set("Vstup_Vek", String(state.age));
    formData.set("Vstup_VekOdchodu", String(state.retireAge));
    formData.set("Vstup_Mzda", String(state.salary));
    formData.set("Vstup_Renta", String(state.rent));
    formData.set("Vstup_Scenar", state.scenario);
    formData.set("Vystup_OdhadDuchodu", formatCurrency(result.estimatedPension));
    formData.set("Vystup_ChybiMesicne", formatCurrency(result.monthlyGap));
    formData.set("Vystup_NutnoInvestovat", formatCurrency(Math.round(result.monthlyInvestment)));
    formData.set("Vystup_CilovyMajetek", String((result.targetCapital / 1_000_000).toFixed(1)));

    try {
      const res = await fetch(FORMSUBMIT_URL, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        if (submitBtn) {
          submitBtn.classList.remove("bg-[#0a0f29]", "hover:bg-[#050814]");
          submitBtn.classList.add("bg-green-600", "hover:bg-green-700");
          submitBtn.textContent = "Odesláno úspěšně";
        }
        setTimeout(() => {
          handleClose();
          form.reset();
          onSubmitSuccess?.();
          if (submitBtn) {
            setTimeout(() => {
              submitBtn.disabled = false;
              submitBtn.classList.add("bg-[#0a0f29]", "hover:bg-[#050814]");
              submitBtn.classList.remove("bg-green-600", "hover:bg-green-700");
              submitBtn.textContent = originalText;
            }, 500);
          }
        }, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = Array.isArray((data as { errors?: Array<{ message: string }> }).errors)
          ? (data as { errors: Array<{ message: string }> }).errors.map((e) => e.message).join(", ")
          : "Chyba při odesílání.";
        toast.showToast(msg, "error");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Zkusit znovu";
        }
      }
    } catch {
      toast.showToast("Odeslání se nepodařilo. Zkuste to znovu.", "error");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Zkusit znovu";
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-[#0a0f29]/80 backdrop-blur-sm transition-opacity opacity-0"
        onClick={handleClose}
        aria-hidden
      />
      <div className="absolute inset-0 flex items-end sm:items-center justify-center p-2 sm:p-4 pointer-events-none">
        <div
          ref={contentRef}
          className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl w-full max-w-md transform scale-95 opacity-0 transition-all duration-300 pointer-events-auto relative overflow-hidden max-h-[85vh] flex flex-col"
          role="dialog"
          aria-modal
          aria-labelledby="pension-modal-title"
        >
          <div className="flex shrink-0 items-start gap-3 bg-[color:var(--wp-surface-muted)] border-b border-[color:var(--wp-surface-card-border)] px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 id="pension-modal-title" className="text-[17px] font-black leading-tight text-[#0a0f29]">
                Chci tento plán nastavit
              </h3>
              <p className="mt-0.5 text-xs font-medium text-[color:var(--wp-text-secondary)]">
                Nechte mi kontakt, ozvu se vám a probereme další postup.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Zavřít"
              className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-card)] hover:text-[#0a0f29]"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-1">
                  Jméno a příjmení <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Jan Novák"
                  className="w-full pl-10 pr-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-1">
                  Váš e-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="vas@email.cz"
                  className="w-full pl-10 pr-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-1">
                  Telefon <span className="text-[color:var(--wp-text-tertiary)] font-normal">(nepovinné)</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="+420 777 ..."
                  className="w-full pl-10 pr-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-[#0a0f29] text-white font-bold py-4 rounded-xl shadow-lg hover:bg-[#050814] transition-all flex items-center justify-center gap-2 min-h-[48px]"
                >
                  Odeslat poptávku
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </button>
                <p className="text-[10px] text-[color:var(--wp-text-tertiary)] text-center mt-3">
                  Odesláním souhlasíte se zpracováním osobních údajů.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
