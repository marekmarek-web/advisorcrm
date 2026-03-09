"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createContact, getContactsList } from "@/app/actions/contacts";

export default function NewContactPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactOptions, setContactOptions] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    getContactsList()
      .then((list) => setContactOptions(list.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const id = await createContact({
        firstName: (fd.get("firstName") as string) || "",
        lastName: (fd.get("lastName") as string) || "",
        email: (fd.get("email") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        title: (fd.get("title") as string) || undefined,
        referralSource: (fd.get("referralSource") as string) || undefined,
        referralContactId: (fd.get("referralContactId") as string) || undefined,
        priority: (fd.get("priority") as string) || undefined,
      });
      if (id) router.push(`/dashboard/contacts/${id}`);
      else setError("Vytvoření se nepovedlo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        Nový kontakt
      </h1>
      <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-xl border border-[var(--brand-border)] bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Jméno *</label>
          <input name="firstName" required className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2" placeholder="Jan" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Příjmení *</label>
          <input name="lastName" required className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2" placeholder="Novák" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">E-mail</label>
          <input name="email" type="email" className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2" placeholder="jan@example.cz" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Telefon</label>
          <input name="phone" className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2" placeholder="+420 …" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Titul</label>
          <input name="title" className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2" placeholder="Ing." />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Doporučil / zdroj</label>
          <input name="referralSource" className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2" placeholder="např. web, doporučení" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Priorita</label>
          <select name="priority" className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2">
            <option value="">—</option>
            <option value="low">Nízká</option>
            <option value="normal">Běžná</option>
            <option value="high">Vysoká</option>
            <option value="urgent">Urgentní</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Doporučen od (kontakt)</label>
          <select name="referralContactId" className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2">
            <option value="">— žádný</option>
            {contactOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-main)" }}
          >
            {loading ? "Ukládám…" : "Uložit"}
          </button>
          <Link href="/dashboard/contacts" className="rounded-lg px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50">
            Zrušit
          </Link>
        </div>
      </form>
    </div>
  );
}
