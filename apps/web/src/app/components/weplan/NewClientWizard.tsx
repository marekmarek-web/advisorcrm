"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createContact, getContactsList } from "@/app/actions/contacts";
import { BaseModal } from "@/app/components/BaseModal";

type Step = 0 | 1 | 2;

const LIFECYCLE_OPTIONS = [
  { value: "", label: "—" },
  { value: "lead", label: "Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "client", label: "Klient" },
  { value: "former_client", label: "Bývalý klient" },
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

  useEffect(() => {
    if (open) {
      getContactsList()
        .then((list) =>
          setContacts(list.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` })))
        )
        .catch(() => {});
    }
  }, [open]);

  function reset() {
    setStep(0);
    setError("");
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
        handleClose();
        if (onCreated) onCreated(id);
        else router.push(`/portal/contacts/${id}`);
      } else {
        setError("Vytvoření se nepovedlo.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba při vytváření.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

  const steps = [
    { label: "Základní údaje", icon: "👤" },
    { label: "Adresa & kontakt", icon: "📍" },
    { label: "Dokončení", icon: "✅" },
  ];

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  return (
    <BaseModal open={open} onClose={handleClose} title="Nový klient" maxWidth="lg">
      {/* Steps indicator */}
      <div className="flex items-center gap-1 px-4 pt-2 pb-3 border-b border-slate-200">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i <= step ? "bg-monday-blue text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span className={`text-[11px] truncate ${i <= step ? "text-slate-800" : "text-slate-400"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${i < step ? "bg-monday-blue/30" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 py-5 space-y-4">
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Jméno *</label>
                  <input value={form.firstName} onChange={set("firstName")} className={inputCls} autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Příjmení *</label>
                  <input value={form.lastName} onChange={set("lastName")} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">E-mail</label>
                <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Telefon</label>
                <input value={form.phone} onChange={set("phone")} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Datum narození</label>
                <input type="date" value={form.birthDate} onChange={set("birthDate")} className={inputCls} />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Ulice</label>
                <input value={form.street} onChange={set("street")} className={inputCls} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Město</label>
                  <input value={form.city} onChange={set("city")} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">PSČ</label>
                  <input value={form.zip} onChange={set("zip")} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Rodné číslo</label>
                <input value={form.personalId} onChange={set("personalId")} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Doporučil / zdroj</label>
                <input value={form.referralSource} onChange={set("referralSource")} placeholder="web, doporučení…" className={inputCls} />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Fáze</label>
                <select value={form.lifecycleStage} onChange={set("lifecycleStage")} className={inputCls}>
                  {LIFECYCLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Priorita</label>
                <select value={form.priority} onChange={set("priority")} className={inputCls}>
                  <option value="">—</option>
                  <option value="low">Nízká</option>
                  <option value="normal">Běžná</option>
                  <option value="high">Vysoká</option>
                  <option value="urgent">Urgentní</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Štítky (oddělené čárkou)</label>
                <input value={form.tags} onChange={set("tags")} placeholder="VIP, rodina…" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Doporučen od</label>
                <select value={form.referralContactId} onChange={set("referralContactId")} className={inputCls}>
                  <option value="">— žádný</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              {/* Summary */}
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1 border border-slate-100">
                <p className="font-semibold text-slate-700">Shrnutí</p>
                <p className="text-slate-600">{form.firstName} {form.lastName}</p>
                {form.email && <p className="text-slate-500">{form.email}</p>}
                {form.phone && <p className="text-slate-500">{form.phone}</p>}
                {form.city && <p className="text-slate-500">{[form.street, form.city, form.zip].filter(Boolean).join(", ")}</p>}
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={step > 0 ? () => setStep((s) => (s - 1) as Step) : handleClose}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-monday-row-hover rounded-[6px]"
        >
          {step > 0 ? "← Zpět" : "Zrušit"}
        </button>
        <div className="flex gap-2">
          {step < 2 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 0 && (!form.firstName.trim() || !form.lastName.trim())) {
                  setError("Jméno a příjmení jsou povinné.");
                  return;
                }
                setError("");
                setStep((s) => (s + 1) as Step);
              }}
              className="px-5 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 rounded-[6px]"
            >
              Další →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-green-600 hover:opacity-90 rounded-[6px] disabled:opacity-50"
            >
              {saving ? "Ukládám…" : "Vytvořit klienta"}
            </button>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
