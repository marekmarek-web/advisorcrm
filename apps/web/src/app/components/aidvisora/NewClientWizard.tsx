"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, Calendar, MapPin, Building, User, Flag } from "lucide-react";
import { createContact, getContactsList } from "@/app/actions/contacts";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import {
  WizardShell,
  WizardHeader,
  WizardStepper,
  WizardBody,
  WizardFooter,
  WizardReview,
  WizardSuccess,
  WizardTipBlock,
  WizardInputWithIcon,
  wizardLabelClass,
  wizardInputClass,
} from "@/app/components/wizard";
import { AddressAutocomplete } from "./AddressAutocomplete";

type Step = 0 | 1 | 2;

const LIFECYCLE_OPTIONS = [
  { value: "", label: "—" },
  { value: "lead", label: "Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "client", label: "Klient" },
  { value: "former_client", label: "Bývalý klient" },
];

const WIZARD_STEPS = [
  { label: "Základní údaje" },
  { label: "Adresa & kontakt" },
  { label: "Dokončení" },
];

export function NewClientWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; label: string }[]>([]);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    birthDate: "",
    personalId: "",
    street: "",
    city: "",
    zip: "",
    referralSource: "",
    referralContactId: "",
    tags: "",
    lifecycleStage: "",
    priority: "",
  });
  const [addressSearch, setAddressSearch] = useState("");

  useEffect(() => {
    if (open) {
      getContactsList()
        .then((list) =>
          setContacts(
            list.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))
          )
        )
        .catch(() => {});
    }
  }, [open]);

  function reset() {
    setStep(0);
    setError("");
    setIsSuccess(false);
    setCreatedId(null);
    setAddressSearch("");
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      birthDate: "",
      personalId: "",
      street: "",
      city: "",
      zip: "",
      referralSource: "",
      referralContactId: "",
      tags: "",
      lifecycleStage: "",
      priority: "",
    });
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Jméno a příjmení jsou povinné.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const parsedTags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const id = await createContact({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email || undefined,
        phone: form.phone || undefined,
        birthDate: form.birthDate || undefined,
        personalId: form.personalId || undefined,
        street: form.street || undefined,
        city: form.city || undefined,
        zip: form.zip || undefined,
        referralSource: form.referralSource || undefined,
        referralContactId: form.referralContactId || undefined,
        tags: parsedTags.length ? parsedTags : undefined,
        lifecycleStage: form.lifecycleStage || undefined,
        priority: form.priority || undefined,
      });
      if (id) {
        setCreatedId(id);
        setIsSuccess(true);
      } else {
        setError("Vytvoření se nepovedlo.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba při vytváření.");
    } finally {
      setSaving(false);
    }
  }

  function fieldOnChange(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function goNext() {
    if (step === 0 && (!form.firstName.trim() || !form.lastName.trim())) {
      setError("Jméno a příjmení jsou povinné.");
      return;
    }
    setError("");
    setStep((s) => Math.min(2, s + 1) as Step);
  }

  function openProfile() {
    if (createdId) {
      if (onCreated) onCreated(createdId);
      else router.push(`/portal/contacts/${createdId}`);
    }
    handleClose();
  }

  if (!open) return null;

  return (
    <WizardShell open={open} onClose={handleClose} title="Nový klient">
      <WizardHeader title="Nový klient" onClose={handleClose} />
      {!isSuccess && (
        <WizardStepper steps={WIZARD_STEPS} currentStep={step + 1} />
      )}
      <WizardBody withSlide={!isSuccess} focusFirstFieldKey={isSuccess ? undefined : step}>
        {isSuccess ? (
          <WizardSuccess
            headline="Klient úspěšně vytvořen!"
            description={`${form.firstName} ${form.lastName} byl přidán do vaší databáze a můžete s ním začít pracovat.`}
            primaryLabel="Otevřít profil klienta"
            onPrimary={openProfile}
            secondaryLabel="Zpět na přehled"
            onSecondary={handleClose}
          />
        ) : (
          <>
            {step === 0 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={wizardLabelClass}>Jméno *</label>
                    <input
                      value={form.firstName}
                      onChange={fieldOnChange("firstName")}
                      placeholder="Např. Jan"
                      className={wizardInputClass}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className={wizardLabelClass}>Příjmení *</label>
                    <input
                      value={form.lastName}
                      onChange={fieldOnChange("lastName")}
                      placeholder="Např. Novák"
                      className={wizardInputClass}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div>
                  <label className={wizardLabelClass}>E-mail</label>
                  <WizardInputWithIcon
                    type="email"
                    value={form.email}
                    onChange={fieldOnChange("email")}
                    placeholder="jan.novak@email.cz"
                    icon={Mail}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Telefon</label>
                  <WizardInputWithIcon
                    type="tel"
                    value={form.phone}
                    onChange={fieldOnChange("phone")}
                    placeholder="+420 777 123 456"
                    icon={Phone}
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Datum narození</label>
                  <WizardInputWithIcon
                    type="date"
                    value={form.birthDate}
                    onChange={fieldOnChange("birthDate")}
                    icon={Calendar}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className={wizardLabelClass}>Adresa (doplňování)</label>
                  <AddressAutocomplete
                    value={addressSearch}
                    onChange={setAddressSearch}
                    onSelectAddress={(c) => {
                      const streetPart = [c.street, c.houseNumber].filter(Boolean).join(" ");
                      setForm((prev) => ({
                        ...prev,
                        street: streetPart || prev.street,
                        city: c.city ?? prev.city,
                        zip: c.postalCode ?? prev.zip,
                      }));
                      setAddressSearch("");
                    }}
                    placeholder="Začněte psát adresu, vyberte z návrhů…"
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Ulice a číslo popisné</label>
                  <WizardInputWithIcon
                    type="text"
                    value={form.street}
                    onChange={fieldOnChange("street")}
                    placeholder="Např. Václavské náměstí 1"
                    icon={MapPin}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="sm:col-span-2">
                    <label className={wizardLabelClass}>Město</label>
                    <WizardInputWithIcon
                      type="text"
                      value={form.city}
                      onChange={fieldOnChange("city")}
                      placeholder="Praha"
                      icon={Building}
                    />
                  </div>
                  <div>
                    <label className={wizardLabelClass}>PSČ</label>
                    <input
                      type="text"
                      value={form.zip}
                      onChange={fieldOnChange("zip")}
                      placeholder="110 00"
                      className={wizardInputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={wizardLabelClass}>Rodné číslo</label>
                  <input
                    value={form.personalId}
                    onChange={fieldOnChange("personalId")}
                    className={wizardInputClass}
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Doporučil / zdroj</label>
                  <input
                    value={form.referralSource}
                    onChange={fieldOnChange("referralSource")}
                    placeholder="web, doporučení…"
                    className={wizardInputClass}
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Fáze</label>
                  <CustomDropdown
                    value={form.lifecycleStage}
                    onChange={(id) => setForm((prev) => ({ ...prev, lifecycleStage: id }))}
                    options={LIFECYCLE_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
                    placeholder="—"
                    icon={User}
                    buttonClassName="!bg-[color:var(--wp-surface-muted)] !border-[color:var(--wp-surface-card-border)]"
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Priorita</label>
                  <CustomDropdown
                    value={form.priority}
                    onChange={(id) => setForm((prev) => ({ ...prev, priority: id }))}
                    options={[
                      { id: "", label: "—" },
                      { id: "low", label: "Nízká" },
                      { id: "normal", label: "Běžná" },
                      { id: "high", label: "Vysoká" },
                      { id: "urgent", label: "Urgentní" },
                    ]}
                    placeholder="—"
                    icon={Flag}
                    buttonClassName="!bg-[color:var(--wp-surface-muted)] !border-[color:var(--wp-surface-card-border)]"
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Štítky (oddělené čárkou)</label>
                  <input
                    value={form.tags}
                    onChange={fieldOnChange("tags")}
                    placeholder="VIP, rodina…"
                    className={wizardInputClass}
                  />
                </div>
                <div>
                  <label className={wizardLabelClass}>Doporučen od</label>
                  <CustomDropdown
                    value={form.referralContactId}
                    onChange={(id) => setForm((prev) => ({ ...prev, referralContactId: id }))}
                    options={[{ id: "", label: "— žádný" }, ...contacts.map((c) => ({ id: c.id, label: c.label }))]}
                    placeholder="— žádný"
                    icon={User}
                    buttonClassName="!bg-[color:var(--wp-surface-muted)] !border-[color:var(--wp-surface-card-border)]"
                  />
                </div>
                <WizardTipBlock>
                  Tip: Po uložení klienta můžete pomocí AI zkontrolovat jeho AML
                  profil a validitu údajů přímo z jeho klientské karty.
                </WizardTipBlock>
              </div>
            )}

            {step === 2 && (
              <WizardReview
                title="Zkontrolujte údaje"
                subtitle="Vše je připraveno k založení nového klienta do databáze."
                icon={User}
                rows={[
                  {
                    label: "Jméno a příjmení",
                    value: `${form.firstName || "—"} ${form.lastName || "—"}`.trim(),
                  },
                  {
                    label: "Kontakt",
                    value: [form.email, form.phone].filter(Boolean).join(", "),
                  },
                  {
                    label: "Adresa",
                    value: [form.street, form.city, form.zip]
                      .filter(Boolean)
                      .join(", "),
                  },
                ]}
              />
            )}

            {error && (
              <p className="mt-4 text-sm text-red-500">{error}</p>
            )}
          </>
        )}
      </WizardBody>
      {!isSuccess && (
        <WizardFooter
          onBack={() => setStep((s) => Math.max(0, s - 1) as Step)}
          onClose={handleClose}
          onPrimary={step === 2 ? handleSubmit : goNext}
          primaryLabel={step === 2 ? "Vytvořit klienta" : "Další"}
          primaryLoading={saving}
          isFirstStep={step === 0}
          isLastStep={step === 2}
        />
      )}
    </WizardShell>
  );
}
