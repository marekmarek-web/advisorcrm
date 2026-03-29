"use client";

import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import {
  getContractSegments,
  createContract,
} from "@/app/actions/contracts";
import { updateDocument } from "@/app/actions/documents";
import { ProductPicker } from "@/app/components/aidvisora/ProductPicker";
import type { ProductPickerValue } from "@/app/components/aidvisora/ProductPicker";
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
import type { WizardReviewRow } from "@/app/components/wizard";

const WIZARD_STEPS = [
  { label: "Typ smlouvy" },
  { label: "Parametry" },
  { label: "Dokument" },
  { label: "Shrnutí" },
];

const initialForm = {
  segment: "ZP",
  partnerId: "",
  productId: "",
  partnerName: "",
  productName: "",
  premiumAmount: "",
  premiumAnnual: "",
  contractNumber: "",
  startDate: "",
  anniversaryDate: "",
  note: "",
};

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
  const [form, setForm] = useState(initialForm);
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
    setForm(initialForm);
    setPickerValue({ partnerId: "", productId: "" });
    setUploadedDocumentId(null);
    setUploadedDocumentName(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    const segment = form.segment?.trim();
    if (!segment || !segments.includes(segment)) {
      setError("Vyberte segment smlouvy.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        segment: form.segment,
        partnerId: form.partnerId || undefined,
        productId: form.productId || undefined,
        partnerName: form.partnerName || undefined,
        productName: form.productName || undefined,
        premiumAmount: form.premiumAmount || undefined,
        premiumAnnual: form.premiumAnnual || undefined,
        contractNumber: form.contractNumber || undefined,
        startDate: form.startDate || undefined,
        anniversaryDate: form.anniversaryDate || undefined,
        note: form.note || undefined,
      };
      const contractId = await createContract(contactId, payload);
      if (contractId && uploadedDocumentId) {
        await updateDocument(uploadedDocumentId, { contractId, visibleToClient: false }).catch(() => {});
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

  function setFormKey<K extends keyof typeof form>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  if (!open) return null;

  const reviewRows: WizardReviewRow[] = [
    { label: "Segment", value: segmentLabel(form.segment) },
    {
      label: "Partner / Produkt",
      value: [form.partnerName, form.productName].filter(Boolean).join(" – ") || "—",
    },
    ...(form.premiumAmount
      ? [{ label: "Pojistné (měs.)", value: `${form.premiumAmount} Kč` }]
      : []),
    ...(form.premiumAnnual
      ? [{ label: "Pojistné (roční)", value: `${form.premiumAnnual} Kč` }]
      : []),
    ...(form.contractNumber
      ? [{ label: "Číslo smlouvy", value: form.contractNumber }]
      : []),
    ...(form.startDate ? [{ label: "Od", value: form.startDate }] : []),
    ...(form.anniversaryDate
      ? [{ label: "Výročí", value: form.anniversaryDate }]
      : []),
    ...(form.note ? [{ label: "Poznámka", value: form.note }] : []),
    {
      label: "Soubor",
      value: uploadedDocumentName || "—",
    },
  ];

  return (
    <WizardShell open={open} onClose={handleClose} title="Nová smlouva">
      <WizardHeader title="Nová smlouva" onClose={handleClose} />
      {!isSuccess && (
        <WizardStepper steps={WIZARD_STEPS} currentStep={step + 1} />
      )}
      <WizardBody withSlide={!isSuccess} focusFirstFieldKey={isSuccess ? undefined : step}>
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
                      setForm((f) => ({
                        ...f,
                        segment: seg,
                        partnerId: "",
                        productId: "",
                        partnerName: "",
                        productName: "",
                      }));
                      setPickerValue({ partnerId: "", productId: "" });
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
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={wizardLabelClass}>Pojistné (měsíční) Kč</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.premiumAmount}
                      onChange={setFormKey("premiumAmount")}
                      placeholder="Kč"
                      className={wizardInputClass}
                    />
                  </div>
                  <div>
                    <label className={wizardLabelClass}>Pojistné (roční) Kč</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.premiumAnnual}
                      onChange={setFormKey("premiumAnnual")}
                      placeholder="Kč"
                      className={wizardInputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={wizardLabelClass}>Číslo smlouvy</label>
                  <input
                    value={form.contractNumber}
                    onChange={setFormKey("contractNumber")}
                    placeholder="např. 12345678"
                    className={wizardInputClass}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={wizardLabelClass}>Od</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={setFormKey("startDate")}
                      className={wizardInputClass}
                    />
                  </div>
                  <div>
                    <label className={wizardLabelClass}>Výročí</label>
                    <input
                      type="date"
                      value={form.anniversaryDate}
                      onChange={setFormKey("anniversaryDate")}
                      className={wizardInputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={wizardLabelClass}>Poznámka</label>
                  <input
                    value={form.note}
                    onChange={setFormKey("note")}
                    className={wizardInputClass}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <label className={wizardLabelClass}>Nahrát smlouvu (PDF)</label>
                  <DocumentUploadZone
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
          onPrimary={step === 3 ? handleSubmit : () => setStep((s) => s + 1)}
          primaryLabel={step === 3 ? "Vytvořit smlouvu" : "Další"}
          primaryLoading={saving}
          isFirstStep={step === 0}
          isLastStep={step === 3}
        />
      )}
    </WizardShell>
  );
}
