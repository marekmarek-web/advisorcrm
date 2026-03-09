"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getContact, getContactsList, updateContact } from "@/app/actions/contacts";

export default function EditContactPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    title: "",
    referralSource: "",
    referralContactId: "",
    priority: "",
    serviceCycleMonths: "",
    lastServiceDate: "",
    nextServiceDue: "",
  });
  const [contactOptions, setContactOptions] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    getContact(id)
      .then((c) => {
        if (!c) setLoadErr("Kontakt nenalezen.");
        else setForm({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email ?? "",
          phone: c.phone ?? "",
          title: c.title ?? "",
          referralSource: c.referralSource ?? "",
          referralContactId: c.referralContactId ?? "",
          priority: c.priority ?? "",
          serviceCycleMonths: c.serviceCycleMonths ?? "",
          lastServiceDate: c.lastServiceDate ?? "",
          nextServiceDue: c.nextServiceDue ?? "",
        });
      })
      .catch(() => setLoadErr("Chyba načtení."));
  }, [id]);

  useEffect(() => {
    getContactsList()
      .then((list) =>
        setContactOptions(
          list.filter((c) => c.id !== id).map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))
        )
      )
      .catch(() => {});
  }, [id]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitErr("");
    setLoading(true);
    try {
      await updateContact(id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        title: form.title.trim() || undefined,
        referralSource: form.referralSource.trim() || undefined,
        referralContactId: form.referralContactId || undefined,
        priority: form.priority || undefined,
        serviceCycleMonths: form.serviceCycleMonths || undefined,
        lastServiceDate: form.lastServiceDate || undefined,
        nextServiceDue: form.nextServiceDue || undefined,
      });
      router.push(`/dashboard/contacts/${id}`);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  if (loadErr) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{loadErr}</p>
        <Link href="/dashboard/contacts" className="text-sm font-medium" style={{ color: "var(--brand-main)" }}>
          ← Zpět na kontakty
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        Upravit kontakt
      </h1>
      <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-xl border border-[var(--brand-border)] bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Jméno *</label>
          <input
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            name="firstName"
            required
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Příjmení *</label>
          <input
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            name="lastName"
            required
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">E-mail</label>
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            name="email"
            type="email"
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Telefon</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            name="phone"
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Titul</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            name="title"
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Doporučil / zdroj</label>
          <input
            value={form.referralSource}
            onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))}
            name="referralSource"
            placeholder="např. web, doporučení"
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Priorita</label>
          <select
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            name="priority"
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          >
            <option value="">—</option>
            <option value="low">Nízká</option>
            <option value="normal">Běžná</option>
            <option value="high">Vysoká</option>
            <option value="urgent">Urgentní</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Servisní cyklus (měsíce)</label>
          <select
            value={form.serviceCycleMonths}
            onChange={(e) => setForm((f) => ({ ...f, serviceCycleMonths: e.target.value }))}
            name="serviceCycleMonths"
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          >
            <option value="">—</option>
            <option value="3">3</option>
            <option value="6">6</option>
            <option value="12">12</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Poslední servis (datum)</label>
          <input
            type="date"
            value={form.lastServiceDate}
            onChange={(e) => setForm((f) => ({ ...f, lastServiceDate: e.target.value }))}
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Příští servis (datum)</label>
          <input
            type="date"
            value={form.nextServiceDue}
            onChange={(e) => setForm((f) => ({ ...f, nextServiceDue: e.target.value }))}
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Doporučen od (kontakt)</label>
          <select
            value={form.referralContactId}
            onChange={(e) => setForm((f) => ({ ...f, referralContactId: e.target.value }))}
            name="referralContactId"
            className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2"
          >
            <option value="">— žádný</option>
            {contactOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {submitErr && <p className="text-sm text-red-600">{submitErr}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-main)" }}
          >
            {loading ? "Ukládám…" : "Uložit"}
          </button>
          <Link href={`/dashboard/contacts/${id}`} className="rounded-lg px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50">
            Zrušit
          </Link>
        </div>
      </form>
    </div>
  );
}
