"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchContactDocumentsBundle } from "@/app/dashboard/contacts/contact-documents-bundle";
import { getContractSegments, updateContract } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";
import { ProductPicker } from "@/app/components/aidvisora/ProductPicker";
import type { ProductPickerValue } from "@/app/components/aidvisora/ProductPicker";
import { segmentLabel } from "@/app/lib/segment-labels";
import { NewContractWizard } from "@/app/components/aidvisora/NewContractWizard";
import { DocumentUploadZone } from "@/app/components/upload/DocumentUploadZone";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { ContractParametersFields } from "@/app/components/aidvisora/ContractParametersFields";
import { FileText, Building2, Package, Settings2 } from "lucide-react";
import {
  initialContractFormState,
  resetContractFormForNewSegment,
  validateContractFormForSubmit,
} from "@/lib/contracts/contract-form-payload";
import type { ContractFormState } from "@/lib/contracts/contract-form-payload";
import { segmentUsesAnnualPremiumPrimaryInput } from "@/lib/contracts/contract-segment-wizard-config";
import { annualPremiumFromMonthlyInput } from "@/lib/contracts/annual-premium-from-monthly";
import { WizardShell, WizardHeader, WizardBody } from "@/app/components/wizard";

function SectionDivider({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon size={14} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
      <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)] uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-px bg-[color:var(--wp-border)]" />
    </div>
  );
}

export function ContactContractModals({ contactId }: { contactId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const bundleQK = queryKeys.contacts.documentsBundle(contactId);

  const {
    data: bundleData,
    isPending: loading,
  } = useQuery({
    queryKey: bundleQK,
    queryFn: () => fetchContactDocumentsBundle(contactId),
    staleTime: 45_000,
  });

  const { data: segments = [] } = useQuery({
    queryKey: queryKeys.contacts.contractSegments(),
    queryFn: getContractSegments,
    staleTime: 300_000,
  });

  const list = bundleData?.contracts ?? [];

  const invalidateContractsData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: bundleQK });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.contractDupPairs(contactId) });
  }, [queryClient, bundleQK, contactId]);

  const [editingId, setEditingId] = useState<string | null>(null);
  /** URL `add=1` je pravda; zavírání přes App Router je však asynchronní — bez tohoto zůstane modal otevřený, dokud nedorazí nová URL. */
  const urlWantsContractWizard = searchParams.get("add") === "1";
  const [wizardDismissedOptimistic, setWizardDismissedOptimistic] = useState(false);
  useEffect(() => {
    if (urlWantsContractWizard) setWizardDismissedOptimistic(false);
  }, [urlWantsContractWizard]);
  const wizardOpen = urlWantsContractWizard && !wizardDismissedOptimistic;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState<ContractFormState>(() => initialContractFormState());
  const [pickerValue, setPickerValue] = useState<ProductPickerValue>({ partnerId: "", productId: "" });
  const [visibleToClientEdit, setVisibleToClientEdit] = useState(true);
  const [portfolioStatusEdit, setPortfolioStatusEdit] = useState("active");

  const clearAddQueryParam = useCallback(() => {
    if (searchParams.get("add") !== "1") return;
    const p = new URLSearchParams(searchParams.toString());
    p.delete("add");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeEdit = useCallback(() => {
    setEditingId(null);
    setSubmitError(null);
  }, []);

  async function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSubmitError(null);
    const validation = validateContractFormForSubmit(form);
    if (!validation.ok) {
      setSubmitError(validation.message);
      return;
    }
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
      // F2: propagujeme explicitní frekvenci + derivovaný paymentType.
      // paymentType posíláme vždy (i pro pojistné segmenty), aby portfolio_attributes.paymentType
      // bylo zapsáno a KPI měsíčních investic se nespletlo s jednorázovkami.
      paymentType: form.paymentType ?? "regular",
      paymentFrequency: form.paymentFrequency ?? "monthly",
      visibleToClient: visibleToClientEdit,
      portfolioStatus: portfolioStatusEdit,
    };
    try {
      await updateContract(editingId, payload);
      setForm(initialContractFormState());
      setPickerValue({ partnerId: "", productId: "" });
      setEditingId(null);
      invalidateContractsData();
    } catch (err) {
      console.error("Chyba při ukládání smlouvy:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Smlouvu se nepodařilo uložit. Zkontrolujte vyplněné údaje a zkuste to znovu.";
      setSubmitError(message);
    }
  }

  const startEdit = useCallback((c: ContractRow) => {
    setEditingId(c.id);
    setVisibleToClientEdit(c.visibleToClient !== false);
    setPortfolioStatusEdit(c.portfolioStatus ?? "active");
    const premiumAmount = c.premiumAmount ?? "";
    let premiumAnnual = c.premiumAnnual ?? "";
    if (segmentUsesAnnualPremiumPrimaryInput(c.segment) && !premiumAnnual.trim() && premiumAmount.trim()) {
      premiumAnnual = annualPremiumFromMonthlyInput(premiumAmount);
    }
    // Derive paymentType:
    //   1) explicit `paymentType` in portfolioAttributes (preferred, zapisované
    //      v updateContract / createContract formuláři),
    //   2) fallback z paymentFrequency ("single"/"monthly"/"ročně"/…).
    // Výchozí hodnota je "regular" (měsíční) — jinak by se editační formulář
    // choval jako „nevyplněno" a UI by to mohlo reportovat jako jednorázovou.
    const attrs = (c.portfolioAttributes as Record<string, unknown> | null | undefined) ?? {};
    const rawPaymentType = typeof attrs.paymentType === "string" ? attrs.paymentType : "";
    const paymentFreq = String(attrs.paymentFrequency ?? attrs.paymentFrequencyLabel ?? "").toLowerCase();
    const paymentType: "one_time" | "regular" =
      rawPaymentType === "one_time" || rawPaymentType === "regular"
        ? (rawPaymentType as "one_time" | "regular")
        : /jednorázov|jednorazov|one.?time|lump.?sum|single/.test(paymentFreq)
          ? "one_time"
          : "regular";
    const paymentFrequency: "monthly" | "annual" | "quarterly" | "semiannual" | "one_time" =
      paymentType === "one_time"
        ? "one_time"
        : /čtvrtlet|ctvrtlet|quarterly/.test(paymentFreq)
          ? "quarterly"
          : /polo\s*let|semiannual|semi-annual/.test(paymentFreq)
            ? "semiannual"
            : /roč|annual|yearly/.test(paymentFreq)
              ? "annual"
              : "monthly";
    setForm({
      segment: c.segment,
      partnerId: c.partnerId ?? "",
      productId: c.productId ?? "",
      partnerName: c.partnerName ?? "",
      productName: c.productName ?? "",
      premiumAmount,
      premiumAnnual,
      contractNumber: c.contractNumber ?? "",
      startDate: c.startDate ?? "",
      anniversaryDate: c.anniversaryDate ?? "",
      note: c.note ?? "",
      paymentType,
      paymentFrequency,
      entryFee: typeof attrs.entryFee === "string" ? attrs.entryFee : "",
      loanPrincipal: typeof attrs.loanPrincipal === "string" ? attrs.loanPrincipal : "",
      participantContribution:
        typeof attrs.participantContribution === "string" ? attrs.participantContribution : "",
      hasPpi: typeof attrs.hasPpi === "boolean" ? attrs.hasPpi : null,
      productCategory: null,
    });
    setPickerValue({
      partnerId: c.partnerId ?? "",
      productId: c.productId ?? "",
      partnerName: c.partnerName ?? undefined,
      productName: c.productName ?? undefined,
    });
  }, []);

  /** Deep link: ?edit=<contractId> — otevře modal okamžitě ze cache, nečeká na loading */
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    // Open immediately if contract is in cache; if list is empty, wait for data
    const c = list.find((x) => x.id === editId);
    if (!c) return;
    startEdit(c);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("edit");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [searchParams, list, pathname, router, startEdit]);

  useEffect(() => {
    if (!editingId || loading) return;
    if (!list.some((c) => c.id === editingId)) {
      setEditingId(null);
      setSubmitError(null);
    }
  }, [editingId, list, loading]);

  return (
    <>
      <NewContractWizard
        open={wizardOpen}
        contactId={contactId}
        onClose={() => {
          setWizardDismissedOptimistic(true);
          clearAddQueryParam();
        }}
        onSuccess={() => invalidateContractsData()}
      />
      {editingId ? (
        <WizardShell
          open
          onClose={closeEdit}
          title="Upravit smlouvu"
          focusContentKey={editingId}
        >
          <WizardHeader title="Upravit smlouvu" onClose={closeEdit} />
          <WizardBody withSlide={false}>
            <form onSubmit={handleSubmitEdit} className="space-y-4">

              {/* Sekce: Segment */}
              <SectionDivider icon={FileText} label="Segment" />
              <CustomDropdown
                value={form.segment}
                onChange={(seg) => {
                  setForm((f) => resetContractFormForNewSegment(f, seg));
                  setPickerValue({ partnerId: "", productId: "" });
                }}
                options={segments.map((s) => ({ id: s, label: segmentLabel(s) }))}
                placeholder="Segment"
                icon={FileText}
              />

              {/* Sekce: Partner a produkt */}
              <SectionDivider icon={Building2} label="Partner a produkt" />
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
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                    Partner (instituce)
                  </label>
                  <input
                    value={form.partnerName}
                    onChange={(e) => setForm((f) => ({ ...f, partnerName: e.target.value }))}
                    placeholder="např. AMUNDI, Uniqa pojišťovna"
                    className="w-full rounded-lg border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                    Produkt / název
                  </label>
                  <input
                    value={form.productName}
                    onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                    placeholder="např. Pokyn k jednorázové investici, Život & radost"
                    className="w-full rounded-lg border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Sekce: Parametry smlouvy */}
              <SectionDivider icon={Package} label="Parametry smlouvy" />

              {/* F2: „Typ platby" (investice) nahrazeno segmented controlem Frekvence platby
                  uvnitř ContractParametersFields — podporuje monthly/annual/one_time. */}
              <ContractParametersFields
                form={form}
                setForm={setForm}
                classes={{
                  label: "block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1",
                  input: "w-full rounded-lg border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-sm text-[color:var(--wp-text)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 min-h-[44px]",
                }}
              />

              {/* Sekce: Nastavení */}
              <SectionDivider icon={Settings2} label="Nastavení" />
              <div className="rounded-xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] divide-y divide-[color:var(--wp-border)]">
                <label className="flex items-center gap-3 min-h-[48px] px-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleToClientEdit}
                    onChange={(e) => setVisibleToClientEdit(e.target.checked)}
                    className="h-5 w-5 rounded border-[color:var(--wp-border)] accent-indigo-600"
                  />
                  <span className="text-sm text-[color:var(--wp-text)]">Zobrazit v klientské zóně (Moje portfolio)</span>
                </label>
                <div className="px-4 py-3">
                  <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1.5">Stav v portfoliu</label>
                  <select
                    value={portfolioStatusEdit}
                    onChange={(e) => setPortfolioStatusEdit(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-sm text-[color:var(--wp-text)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 min-h-[44px]"
                  >
                    <option value="active">Aktivní</option>
                    <option value="ended">Ukončené</option>
                    <option value="pending_review">Čeká na kontrolu</option>
                    <option value="draft">Koncept</option>
                  </select>
                </div>
              </div>

              {/* Nahrát PDF */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--wp-text-muted)] mb-1.5">Nahrát smlouvu (PDF)</label>
                <DocumentUploadZone
                  key={`${contactId}-${form.segment}-${editingId}`}
                  contactId={contactId}
                  initialContractId={editingId}
                  submitButtonLabel="Nahrát smlouvu"
                  chooseButtonLabel="Vybrat smlouvu (PDF / foto)"
                  onUploaded={() => invalidateContractsData()}
                  className="p-0 border-0 bg-transparent"
                />
              </div>

              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
                  {submitError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 sm:flex-none rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors min-h-[44px]"
                >
                  Uložit změny
                </button>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 sm:flex-none rounded-xl px-5 py-2.5 text-sm font-semibold border border-[color:var(--wp-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors min-h-[44px]"
                >
                  Zrušit
                </button>
              </div>
            </form>
          </WizardBody>
        </WizardShell>
      ) : null}
    </>
  );
}
