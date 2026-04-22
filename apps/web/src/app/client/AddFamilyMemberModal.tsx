"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { addHouseholdMemberFromClient } from "@/app/actions/households";
import { HOUSEHOLD_ROLES } from "@/lib/households/roles";

type AddFamilyMemberModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function AddFamilyMemberModal({
  open,
  onClose,
  onSuccess,
}: AddFamilyMemberModalProps) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState("partner");
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resetAndClose() {
    setRole("partner");
    setFullName("");
    setBirthDate("");
    setError(null);
    onClose();
  }

  function submitForm() {
    if (!fullName.trim()) {
      setError("Vyplňte jméno člena domácnosti.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addHouseholdMemberFromClient({
        role,
        fullName,
        birthDate: birthDate || null,
      }).catch((submitError) => {
        return {
          success: false as const,
          error:
            submitError instanceof Error
              ? submitError.message
              : "Přidání člena domácnosti se nezdařilo.",
        };
      });

      if (!result || (result as { success?: boolean }).success === false) {
        setError((result as { error?: string }).error || "Přidání člena domácnosti se nezdařilo.");
        return;
      }

      onSuccess?.();
      resetAndClose();
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[75] bg-slate-900/55 backdrop-blur-sm p-4 sm:p-6 flex items-center justify-center client-fade-in"
      onClick={resetAndClose}
    >
      <div
        className="w-full max-w-[520px] bg-white rounded-[30px] border border-[color:var(--wp-surface-card-border)] shadow-2xl overflow-hidden client-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 sm:px-8 py-5 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/70 flex items-center justify-between">
          <h2 className="text-xl font-black text-[color:var(--wp-text)]">Přidat člena domácnosti</h2>
          <button
            onClick={resetAndClose}
            className="p-2 rounded-full border border-[color:var(--wp-surface-card-border)] bg-white text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
            aria-label="Zavřít modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
              Vztah
            </label>
            <CustomDropdown
              value={role}
              onChange={setRole}
              options={HOUSEHOLD_ROLES.map((r) => ({ id: r.value, label: r.label }))}
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
              Jméno a příjmení
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Např. Eva Nováková"
              className="w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
              Datum narození
            </label>
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              className="w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 sm:px-8 py-5 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/70 flex justify-between gap-3">
          <button
            onClick={resetAndClose}
            className="px-6 py-2.5 bg-white border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors min-h-[44px]"
          >
            Zrušit
          </button>
          <button
            onClick={submitForm}
            disabled={isPending}
            className="px-8 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-900/20 transition-all active:scale-95 disabled:opacity-50 min-h-[44px]"
          >
            {isPending ? "Ukládám..." : "Přidat"}
          </button>
        </div>
      </div>
    </div>
  );
}
