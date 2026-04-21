"use client";

import { useRef, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/calculators/life/formatters";
import type { LifeState } from "@/lib/calculators/life/life.types";
import type { LifeResult } from "@/lib/calculators/life/life.types";
import { useToast } from "@/app/components/Toast";

export type LifeModalType = "general" | "proposal" | "check";

export interface LifeContactModalProps {
  open: boolean;
  onClose: () => void;
  type: LifeModalType;
  state: LifeState;
  result: LifeResult;
  onSubmitSuccess?: () => void;
}

const FORMSUBMIT_URL = "https://formsubmit.co/ajax/kontakt@marek-marek.cz";

const TITLES: Record<LifeModalType, string> = {
  general: "Mám zájem o nabídku",
  proposal: "Získejte nezávazný návrh",
  check: "Kontrola smlouvy",
};

const SUBTITLES: Record<LifeModalType, string> = {
  general: "Nechte mi kontakt, ozvu se vám.",
  proposal: "Na základě vašich údajů připravím návrh.",
  check:
    "Nahrajte své životní pojištění a nechte si jej nezávazně zkontrolovat.",
};

const SUBMIT_LABELS: Record<LifeModalType, string> = {
  general: "Odeslat poptávku",
  proposal: "Odeslat formulář",
  check: "Odeslat ke kontrole",
};

export function LifeContactModal({
  open,
  onClose,
  type,
  state,
  result,
  onSubmitSuccess,
}: LifeContactModalProps) {
  const toast = useToast();
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      backdropRef.current?.classList.remove("opacity-0");
      contentRef.current?.classList.remove("opacity-0", "scale-95");
      contentRef.current?.classList.add("scale-100");
    }, 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) setFileName(null);
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

    const submitBtn = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
    const originalText = submitBtn?.textContent ?? "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Odesílám...";
    }

    const formData = new FormData(form);
    formData.set("_subject", `Nový lead: ${TITLES[type]}`);
    formData.set("_captcha", "false");
    formData.set("Vstup_Vek", String(state.age));
    formData.set("Vstup_Prijem", String(state.netIncome));
    formData.set("Vstup_Vydaje", String(state.expenses));
    formData.set("Vstup_Zavazky", String(state.liabilities));
    formData.set("Vstup_Rezervy", String(state.reserves));
    formData.set("Vstup_Deti", String(state.children));
    formData.set("Vstup_Manzelstvi", state.hasSpouse ? "Ano" : "Ne");
    formData.set("Vystup_Smrt_Kryti", formatCurrency(result.deathCoverage));
    formData.set("Vystup_Invalidita_Kryti", formatCurrency(result.capitalD3));
    formData.set("Vystup_PN_Den", formatCurrency(result.pnDailyNeed));
    formData.set("Vystup_TN_Zaklad", formatCurrency(result.tnBase));

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
          ? (data as { errors: Array<{ message: string }> }).errors
              .map((e) => e.message)
              .join(", ")
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? null);
  };

  if (!open) return null;

  const isCheck = type === "check";

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
          aria-labelledby="life-modal-title"
        >
          <div className="flex shrink-0 items-start gap-3 bg-[color:var(--wp-surface-muted)] border-b border-[color:var(--wp-surface-card-border)] px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 id="life-modal-title" className="text-[17px] font-black leading-tight text-[#0a0f29]">
                {TITLES[type]}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-[color:var(--wp-text-secondary)]">{SUBTITLES[type]}</p>
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
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
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
                  Telefon{" "}
                  <span className="text-[color:var(--wp-text-tertiary)] font-normal">
                    (nepovinné)
                  </span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="+420 777 ..."
                  className="w-full pl-10 pr-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>

              {isCheck && (
                <div>
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-1">
                    Nahrát soubor{" "}
                    <span className="text-[color:var(--wp-text-tertiary)] font-normal">
                      (nepovinné)
                    </span>
                  </label>
                  <label className="border-2 border-dashed border-[color:var(--wp-border-strong)] rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-[color:var(--wp-surface-muted)] hover:border-indigo-300 transition-all group">
                    <input
                      type="file"
                      name="attachment"
                      className="hidden"
                      accept=".pdf,.jpg,.png,.doc,.docx"
                      onChange={handleFileChange}
                    />
                    <svg
                      className="w-8 h-8 text-[color:var(--wp-text-tertiary)] group-hover:text-indigo-500 mb-2 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <span
                      className={`text-xs ${fileName ? "text-indigo-500 font-medium" : "text-[color:var(--wp-text-secondary)]"}`}
                    >
                      {fileName ?? "Klikněte pro nahrání smlouvy"}
                    </span>
                  </label>
                </div>
              )}

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-[#0a0f29] text-white font-bold py-4 rounded-xl shadow-lg hover:bg-[#050814] transition-all flex items-center justify-center gap-2 min-h-[48px]"
                >
                  {SUBMIT_LABELS[type]}
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
