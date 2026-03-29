"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import { createHousehold } from "@/app/actions/households";
import {
  WizardShell,
  WizardHeader,
  WizardStepper,
  WizardBody,
  WizardFooter,
  WizardReview,
  WizardSuccess,
  wizardLabelClass,
  wizardInputClass,
} from "@/app/components/wizard";

const WIZARD_STEPS = [{ label: "Název" }, { label: "Shrnutí" }];

export function NewHouseholdWizard({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: (id: string) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [name, setName] = useState("");

  function reset() {
    setStep(0);
    setError("");
    setIsSuccess(false);
    setCreatedId(null);
    setName("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Zadejte název domácnosti.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await createHousehold(trimmed);
      setCreatedId(id ?? null);
      setIsSuccess(true);
      onSuccess?.(id ?? "");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Domácnost se nepodařilo vytvořit."
      );
    } finally {
      setSaving(false);
    }
  }

  function openHousehold() {
    if (createdId) {
      onSuccess?.(createdId);
      router.push(`/portal/households/${createdId}`);
    }
    handleClose();
  }

  if (!open) return null;

  return (
    <WizardShell open={open} onClose={handleClose} title="Nová domácnost">
      <WizardHeader title="Nová domácnost" onClose={handleClose} />
      {!isSuccess && (
        <WizardStepper steps={WIZARD_STEPS} currentStep={step + 1} />
      )}
      <WizardBody withSlide={!isSuccess} focusFirstFieldKey={isSuccess ? undefined : step}>
        {isSuccess ? (
          <WizardSuccess
            headline="Domácnost vytvořena"
            description="Domácnost byla úspěšně přidána. Můžete do ní přidat členy z detailu."
            primaryLabel="Otevřít domácnost"
            onPrimary={openHousehold}
            secondaryLabel="Zpět na seznam"
            onSecondary={handleClose}
          />
        ) : (
          <>
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <label className={wizardLabelClass}>Název domácnosti *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Např. Rodina Novákovi"
                    className={wizardInputClass}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <WizardReview
                title="Zkontrolujte údaje"
                subtitle="Domácnost bude vytvořena s tímto názvem."
                icon={Home}
                rows={[{ label: "Název domácnosti", value: name.trim() || "—" }]}
              />
            )}

            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          </>
        )}
      </WizardBody>
      {!isSuccess && (
        <WizardFooter
          onBack={() => setStep((s) => Math.max(0, s - 1))}
          onClose={handleClose}
          onPrimary={step === 1 ? handleSubmit : () => setStep(1)}
          primaryLabel={step === 1 ? "Vytvořit domácnost" : "Další"}
          primaryLoading={saving}
          isFirstStep={step === 0}
          isLastStep={step === 1}
        />
      )}
    </WizardShell>
  );
}
