"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getContact, getContactsList, updateContact } from "@/app/actions/contacts";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { Flag, RefreshCw, User } from "lucide-react";

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
      <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Jméno *</label>
          <input
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            name="firstName"
            required
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Příjmení *</label>
          <input
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            name="lastName"
            required
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">E-mail</label>
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            name="email"
            type="email"
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Telefon</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            name="phone"
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Titul</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            name="title"
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Doporučil / zdroj</label>
          <input
            value={form.referralSource}
            onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))}
            name="referralSource"
            placeholder="např. web, doporučení"
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Priorita</label>
          <CustomDropdown
            value={form.priority}
            onChange={(id) => setForm((f) => ({ ...f, priority: id }))}
            options={[
              { id: "", label: "—" },
              { id: "low", label: "Nízká" },
              { id: "normal", label: "Běžná" },
              { id: "high", label: "Vysoká" },
              { id: "urgent", label: "Urgentní" },
            ]}
            placeholder="—"
            icon={Flag}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Servisní cyklus (měsíce)</label>
          <CustomDropdown
            value={form.serviceCycleMonths}
            onChange={(id) => setForm((f) => ({ ...f, serviceCycleMonths: id }))}
            options={[
              { id: "", label: "—" },
              { id: "3", label: "3" },
              { id: "6", label: "6" },
              { id: "12", label: "12" },
            ]}
            placeholder="—"
            icon={RefreshCw}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Poslední servis (datum)</label>
          <input
            type="date"
            value={form.lastServiceDate}
            onChange={(e) => setForm((f) => ({ ...f, lastServiceDate: e.target.value }))}
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Příští servis (datum)</label>
          <input
            type="date"
            value={form.nextServiceDue}
            onChange={(e) => setForm((f) => ({ ...f, nextServiceDue: e.target.value }))}
            className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Doporučen od (kontakt)</label>
          <CustomDropdown
            value={form.referralContactId}
            onChange={(id) => setForm((f) => ({ ...f, referralContactId: id }))}
            options={[{ id: "", label: "— žádný" }, ...contactOptions]}
            placeholder="— žádný"
            icon={User}
          />
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
          <Link href={`/dashboard/contacts/${id}`} className="rounded-lg border border-[color:var(--wp-border-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]">
            Zrušit
          </Link>
        </div>
      </form>
    </div>
  );
}
