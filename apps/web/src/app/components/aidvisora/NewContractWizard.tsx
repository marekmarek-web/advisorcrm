"use client";

import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { getContractSegments, createContract } from "@/app/actions/contracts";
import { updateDocument } from "@/app/actions/documents";
import { ProductPicker } from "@/app/components/aidvisora/ProductPicker";
import type { ProductPickerValue } from "@/app/components/aidvisora/ProductPicker";
import { ContractParametersFields } from "@/app/components/aidvisora/ContractParametersFields";
import { segmentLabel } from "@/app/lib/segment-labels";
import { DocumentUploadZone } from "@/app/components/upload/DocumentUploadZone";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
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
import {
  initialContractFormState,
  resetContractFormForNewSegment,
  buildContractReviewRows,
  validateContractFormForSubmit,
  normalizeContractFormForSave,
} from "@/lib/contracts/contract-form-payload";
import type { ContractFormState } from "@/lib/contracts/contract-form-payload";

const WIZARD_STEPS = [
  { label: "Typ smlouvy" },
  { label: "Parametry" },
  { label: "Dokument" },
  { label: "Shrnutí" },
];

export function NewContractWizard({
  open,
  contactId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  contactId: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [segments, setSegments] = useState<string[]>([]);
  const [form, setForm] = useState<ContractFormState>(() => initialContractFormState());
  const [pickerValue, setPickerValue] = useState<ProductPickerValue>({
    partnerId: "",
    productId: "",
  });
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [uploadedDocumentName, setUploadedDocumentName] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getContractSegments().then(setSegments).catch(() => []);
    }
  }, [open]);

  function reset() {
    setStep(0);
    setError("");
    setIsSuccess(false);
    setForm(initialContractFormState());
    setPickerValue({ partnerId: "", productId: "" });
    setUploadedDocumentId(null);
    setUploadedDocumentName(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    const validation = validateContractFormForSubmit(form);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setSaving(true);
    setError("");
    const payload = normalizeContractFormForSave(form);
    try {
      const result = await createContract(contactId, payload);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (uploadedDocumentId) {
        await updateDocument(uploadedDocumentId, { contractId: result.id, visibleToClient: false }).catch(() => {});
      }
      setIsSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Smlouvu se nepodařilo uložit. Zkontrolujte údaje a zkuste to znovu."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const reviewRows = buildContractReviewRows(form, uploadedDocumentName);

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      title="Nová smlouva"
      focusContentKey={isSuccess ? undefined : step}
    >
      <WizardHeader title="Nová smlouva" onClose={handleClose} />
      {!isSuccess && (
        <WizardStepper steps={WIZARD_STEPS} currentStep={step + 1} />
      )}
      <WizardBody withSlide={!isSuccess}>
        {isSuccess ? (
          <WizardSuccess
            headline="Smlouva přidána"
            description="Smlouva byla úspěšně uložena ke kontaktu. Můžete ji najít v sekci Produkty / Smlouvy."
            primaryLabel="Hotovo"
            onPrimary={handleClose}
            secondaryLabel="Zpět na přehled"
            onSecondary={handleClose}
          />
        ) : (
          <>
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <label className={wizardLabelClass}>Segment</label>
                  <CustomDropdown
                    value={form.segment}
                    onChange={(seg) => {
                      setForm((f) => resetContractFormForNewSegment(f, seg));
                      setPickerValue({ partnerId: "", productId: "" });
                      setUploadedDocumentId(null);
                      setUploadedDocumentName(null);
                    }}
                    options={segments.map((s) => ({ id: s, label: segmentLabel(s) }))}
                    placeholder="Segment"
                    icon={FileText}
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Partner / Produkt</label>
                  <ProductPicker
                    segment={form.segment}
                    value={pickerValue}
                    onChange={(v) => {
                      setPickerValue(v);
                      setForm((f) => ({
                        ...f,
                        partnerId: v.partnerId,
                        productId: v.productId,
                        partnerName: v.partnerName ?? f.partnerName,
                        productName: v.productName ?? f.productName,
                      }));
                    }}
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Partner (text)</label>
                  <input
                    value={form.partnerName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, partnerName: e.target.value }))
                    }
                    placeholder="název partnera"
                    className={wizardInputClass}
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Produkt (text)</label>
                  <input
                    value={form.productName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, productName: e.target.value }))
                    }
                    placeholder="název produktu"
                    className={wizardInputClass}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <ContractParametersFields
                form={form}
                setForm={setForm}
                classes={{ label: wizardLabelClass, input: wizardInputClass }}
              />
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <label className={wizardLabelClass}>Nahrát smlouvu (PDF)</label>
                  <DocumentUploadZone
                    key={`${contactId}-${form.segment}-upload`}
                    contactId={contactId}
                    submitButtonLabel="Nahrát dokument"
                    chooseButtonLabel="Vybrat smlouvu (PDF / foto)"
                    onUploaded={(doc) => {
                      setUploadedDocumentId(doc.id);
                      setUploadedDocumentName(doc.name);
                    }}
                  />
                  {uploadedDocumentName && (
                    <p className="text-sm text-slate-500 mt-2">Nahráno: {uploadedDocumentName}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Volitelné. Smlouvu lze doplnit později.</p>
                </div>
              </div>
            )}

            {step === 3 && (
              <WizardReview
                title="Zkontrolujte údaje"
                subtitle="Smlouva bude uložena ke kontaktu."
                icon={FileText}
                rows={reviewRows}
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
          onPrimary={
            step === 3
              ? handleSubmit
              : () => {
                  setError("");
                  if (step === 0) {
                    const v = validateContractFormForSubmit(form);
                    if (!v.ok) {
                      setError(v.message);
                      return;
                    }
                  }
                  setStep((s) => s + 1);
                }
          }
          primaryLabel={step === 3 ? "Vytvořit smlouvu" : "Další"}
          primaryLoading={saving}
          isFirstStep={step === 0}
          isLastStep={step === 3}
        />
      )}
    </WizardShell>
  );
}
