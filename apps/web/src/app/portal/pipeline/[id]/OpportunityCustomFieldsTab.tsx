"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { updateOpportunity } from "@/app/actions/pipeline";
import type { OpportunityDetail } from "@/app/actions/pipeline";

const SECTIONS: {
  key: string;
  label: string;
  fields: { key: string; label: string; type: "text" | "number" | "date" | "checkbox" }[];
}[] = [
  {
    key: "obecne",
    label: "Obecné",
    fields: [
      { key: "producent", label: "Producent", type: "text" },
      { key: "cislo_smlouvy", label: "Číslo smlouvy", type: "text" },
      { key: "cislo_nabidky", label: "Číslo nabídky", type: "text" },
      { key: "pocatek", label: "Počátek", type: "date" },
      { key: "pojistne", label: "Pojištění", type: "text" },
      { key: "frekvence", label: "Frekvence", type: "text" },
    ],
  },
  {
    key: "pojisteni_osob",
    label: "Pojištění osob",
    fields: [
      { key: "produkt", label: "Produkt", type: "text" },
      { key: "konec_pojisteni", label: "Konec pojištění", type: "date" },
      { key: "danove_uznatelne", label: "Daňově uznatelné", type: "checkbox" },
    ],
  },
  {
    key: "hypoteky",
    label: "Hypotéky",
    fields: [
      { key: "vyse_uveru", label: "Výše úvěru", type: "text" },
      { key: "hodnota_zastavy", label: "Hodnota zástavy", type: "text" },
    ],
  },
  {
    key: "provize",
    label: "Provize",
    fields: [
      { key: "prvni_provize", label: "1. Provize", type: "text" },
      { key: "vyplaceno", label: "Vyplaceno", type: "text" },
      { key: "dalsi_provize", label: "Další provize", type: "text" },
    ],
  },
  {
    key: "investice",
    label: "Investice",
    fields: [
      { key: "jednorazove", label: "Jednorázové", type: "text" },
      { key: "pravidelne", label: "Pravidelné", type: "text" },
      { key: "vstupni_poplatek", label: "Vstupní popl.", type: "text" },
    ],
  },
  {
    key: "pojisteni_majetku",
    label: "Pojištění majetku a nemovitosti",
    fields: [
      { key: "pc_nemovitost", label: "PČ nemovitost", type: "text" },
      { key: "pc_domacnost", label: "PČ domácnost", type: "text" },
      { key: "pc_odpovednost", label: "PČ odpovědnost", type: "text" },
      { key: "pripojisteni", label: "Připojištění", type: "text" },
    ],
  },
];

export function OpportunityCustomFieldsTab({
  opportunity,
}: {
  opportunity: OpportunityDetail;
  onUpdate?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const cf = opportunity.customFields ?? {};
  useEffect(() => {
    const next: Record<string, unknown> = {};
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const v = cf[field.key];
        next[field.key] = v ?? (field.type === "checkbox" ? false : "");
      }
    }
    setValues(next);
  }, [opportunity.id, opportunity.customFields]);

  const setOne = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateOpportunity(opportunity.id, { customFields: values });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chyba při ukládání");
    } finally {
      setSaving(false);
    }
  }, [opportunity.id, values, router]);

  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => (
        <div
          key={section.key}
          className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5 sm:p-6"
        >
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 pb-3 border-b border-slate-50">
            {section.label}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map((field) => (
              <div key={field.key}>
                {field.type === "checkbox" ? (
                  <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!values[field.key]}
                      onChange={(e) => setOne(field.key, e.target.checked)}
                      className="rounded border-slate-300 size-5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">{field.label}</span>
                  </label>
                ) : (
                  <>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      value={String(values[field.key] ?? "")}
                      onChange={(e) =>
                        setOne(
                          field.key,
                          field.type === "number" ? e.target.valueAsNumber : e.target.value,
                        )
                      }
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-8 py-3.5 bg-aidv-create hover:bg-aidv-create-hover text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-indigo-900/20 transition-all disabled:opacity-50"
      >
        <Save size={16} aria-hidden />
        {saving ? "Ukládám…" : "Uložit vlastní pole"}
      </button>
    </div>
  );
}
