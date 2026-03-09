"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CallsReportRow } from "@/app/actions/events";
import { extractContactsFromText, type ExtractedContact } from "@/app/actions/ai-extract";
import { createContact } from "@/app/actions/contacts";
import { useToast } from "@/app/components/Toast";
import { EmptyState } from "@/app/components/EmptyState";
import { TypingDots } from "@/app/components/TypingDots";

function formatDateTime(d: Date) {
  return new Date(d).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ColdContactsClient({
  initialCalls,
  showAiImport,
}: {
  initialCalls: CallsReportRow[];
  showAiImport: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [importText, setImportText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedContact[]>([]);
  const [creating, setCreating] = useState(false);
  const [leadSourceLabel, setLeadSourceLabel] = useState("zivefirmy.cz");

  async function handleExtract() {
    if (!importText.trim()) return;
    setExtracting(true);
    setExtracted([]);
    try {
      const list = await extractContactsFromText(importText.trim());
      setExtracted(list);
      if (list.length === 0) toast.showToast("AI nenašlo žádné kontakty.", "error");
      else toast.showToast(`Nalezeno ${list.length} kontaktů. Zkontrolujte a vytvořte.`);
    } catch (e) {
      toast.showToast(e instanceof Error ? e.message : "Extrakce se nezdařila", "error");
    } finally {
      setExtracting(false);
    }
  }

  async function handleCreateContacts() {
    if (extracted.length === 0) return;
    setCreating(true);
    try {
      for (const c of extracted) {
        const firstName = c.firstName?.trim() || c.companyName?.trim() || "—";
        const lastName = c.lastName?.trim() || "";
        await createContact({
          firstName,
          lastName,
          email: c.email?.trim() || undefined,
          phone: c.phone?.trim() || undefined,
          leadSource: leadSourceLabel.trim() || "import",
          leadSourceUrl: undefined,
        });
      }
      toast.showToast(`Vytvořeno ${extracted.length} kontaktů`);
      setExtracted([]);
      setImportText("");
      router.refresh();
    } catch (e) {
      toast.showToast(e instanceof Error ? e.message : "Vytvoření se nezdařilo", "error");
    } finally {
      setCreating(false);
    }
  }

  function removeExtracted(index: number) {
    setExtracted((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-8">
      {/* Přehled telefonátů */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Přehled telefonátů</h2>
        <p className="text-slate-500 text-sm mb-3">
          Události typu „Telefonát“ – kolik komu bylo zavoláno a kdy.
        </p>
        {initialCalls.length === 0 ? (
          <EmptyState
            icon="📞"
            title="Zatím žádné telefonáty"
            description="Telefonáty evidujte v kalendáři jako aktivitu typu Telefonát."
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Datum a čas</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Kontakt</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Název</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Zdroj leadu</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCalls.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTime(r.startAt)}</td>
                      <td className="px-4 py-2.5">
                        {r.contactId ? (
                          <Link href={`/portal/contacts/${r.contactId}`} className="text-blue-600 font-medium hover:underline">
                            {r.contactName ?? "—"}
                          </Link>
                        ) : (
                          <span className="text-slate-500">{r.contactName ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{r.title}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.leadSource ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Import ze zdroje / AI – Gemini-style CTA */}
      {showAiImport && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Import ze zdroje</h2>
          <p className="text-slate-500 text-sm mb-4">
            Vložte text (např. ze zivefirmy.cz). AI z něj vytáhne kontakty – zkontrolujte a vytvořte.
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 focus-within:border-monday-blue focus-within:ring-1 focus-within:ring-monday-blue/20 transition-all">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Vložte nebo napište text s kontakty (firmy, jména, telefony, e-maily)…"
              rows={4}
              className="w-full rounded-xl bg-transparent px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none"
            />
            <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-1">
              <button
                type="button"
                onClick={handleExtract}
                disabled={extracting || !importText.trim()}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {extracting ? <TypingDots className="text-white" /> : null}
                {extracting ? "Roztříďuji…" : "Roztřídit pomocí AI"}
              </button>
              <input
                type="text"
                value={leadSourceLabel}
                onChange={(e) => setLeadSourceLabel(e.target.value)}
                placeholder="Zdroj (např. zivefirmy.cz)"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-48 bg-white"
              />
            </div>
          </div>
          <p className="text-amber-700 text-xs mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Data z externích zdrojů kontrolujte. WePlan neručí za správnost AI extrakce.
          </p>

          {extracted.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-slate-700 mb-2">Náhled ({extracted.length} kontaktů)</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Firma / Jméno</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">IČO</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Telefon</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">E-mail</th>
                      <th className="w-16 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {extracted.map((c, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-3 py-2">
                          {c.companyName && <span className="font-medium">{c.companyName}</span>}
                          {(c.firstName || c.lastName) && (
                            <span className="text-slate-600">
                              {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                            </span>
                          )}
                          {!c.companyName && !c.firstName && !c.lastName && "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{c.ico ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{c.phone ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{c.email ?? "—"}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeExtracted(i)}
                            className="text-red-600 text-xs hover:underline"
                          >
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={handleCreateContacts}
                disabled={creating || extracted.length === 0}
                className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {creating ? "Vytvářím…" : `Vytvořit kontakty (${extracted.length})`}
              </button>
            </div>
          )}
        </section>
      )}

      {!showAiImport && (
        <p className="text-slate-500 text-sm">
          Pro „Roztřídit pomocí AI“ nastavte v Nastavení nebo v .env proměnnou <code className="bg-slate-100 px-1 rounded">OPENAI_API_KEY</code>.
        </p>
      )}
    </div>
  );
}
