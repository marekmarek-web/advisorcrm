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
    birthDate: "",
    personalId: "",
    street: "",
    city: "",
    zip: "",
    tags: "",
    lifecycleStage: "",
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
        else
          setForm({
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? "",
            phone: c.phone ?? "",
            title: c.title ?? "",
            referralSource: c.referralSource ?? "",
            referralContactId: c.referralContactId ?? "",
            birthDate: c.birthDate ?? "",
            personalId: c.personalId ?? "",
            street: c.street ?? "",
            city: c.city ?? "",
            zip: c.zip ?? "",
            tags: c.tags?.join(", ") ?? "",
            lifecycleStage: c.lifecycleStage ?? "",
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
          list
            .filter((c) => c.id !== id)
            .map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))
        )
      )
      .catch(() => {});
  }, [id]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitErr("");
    setLoading(true);
    try {
      const parsedTags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await updateContact(id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        title: form.title.trim() || undefined,
        referralSource: form.referralSource.trim() || undefined,
        referralContactId: form.referralContactId || undefined,
        birthDate: form.birthDate || undefined,
        personalId: form.personalId.trim() || undefined,
        street: form.street.trim() || undefined,
        city: form.city.trim() || undefined,
        zip: form.zip.trim() || undefined,
        tags: parsedTags.length ? parsedTags : undefined,
        lifecycleStage: form.lifecycleStage || undefined,
        priority: form.priority || undefined,
        serviceCycleMonths: form.serviceCycleMonths || undefined,
        lastServiceDate: form.lastServiceDate || undefined,
        nextServiceDue: form.nextServiceDue || undefined,
      });
      router.push(`/portal/contacts/${id}`);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  if (loadErr) {
    return (
      <div className="p-4 space-y-4">
        <p className="text-red-500 text-sm">{loadErr}</p>
        <Link href="/portal/contacts" className="text-sm font-medium text-monday-blue hover:underline">
          ← Zpět na kontakty
        </Link>
      </div>
    );
  }

  const inputCls = "w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:ring-1 focus:ring-monday-blue";

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-lg font-semibold text-monday-text">Upravit kontakt</h1>
      <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-lg border border-monday-border bg-monday-surface p-6">
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Jméno *</label>
          <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Příjmení *</label>
          <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">E-mail</label>
          <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Telefon</label>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Titul</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Doporučil / zdroj</label>
          <input value={form.referralSource} onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} placeholder="např. web, doporučení" className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Datum narození</label>
          <input type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Rodné číslo / osobní ID</label>
          <input value={form.personalId} onChange={(e) => setForm((f) => ({ ...f, personalId: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Ulice</label>
          <input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Město</label>
            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">PSČ</label>
            <input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Štítky (oddělené čárkou)</label>
          <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="např. VIP, rodina" className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Fáze životního cyklu</label>
          <select value={form.lifecycleStage} onChange={(e) => setForm((f) => ({ ...f, lifecycleStage: e.target.value }))} className={inputCls}>
            <option value="">—</option>
            <option value="lead">Lead</option>
            <option value="prospect">Prospect</option>
            <option value="client">Klient</option>
            <option value="former_client">Bývalý klient</option>
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Priorita</label>
          <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={inputCls}>
            <option value="">—</option>
            <option value="low">Nízká</option>
            <option value="normal">Běžná</option>
            <option value="high">Vysoká</option>
            <option value="urgent">Urgentní</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Servisní cyklus (měsíce)</label>
          <select value={form.serviceCycleMonths} onChange={(e) => setForm((f) => ({ ...f, serviceCycleMonths: e.target.value }))} className={inputCls}>
            <option value="">—</option>
            <option value="3">3</option>
            <option value="6">6</option>
            <option value="12">12</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Poslední servis</label>
          <input type="date" value={form.lastServiceDate} onChange={(e) => setForm((f) => ({ ...f, lastServiceDate: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Příští servis</label>
          <input type="date" value={form.nextServiceDue} onChange={(e) => setForm((f) => ({ ...f, nextServiceDue: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Doporučen od (kontakt)</label>
          <select value={form.referralContactId} onChange={(e) => setForm((f) => ({ ...f, referralContactId: e.target.value }))} className={inputCls}>
            <option value="">— žádný</option>
            {contactOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        {submitErr && <p className="text-sm text-red-500">{submitErr}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue disabled:opacity-50">
            {loading ? "Ukládám…" : "Uložit"}
          </button>
          <Link href={`/portal/contacts/${id}`} className="rounded-[6px] px-4 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover">
            Zrušit
          </Link>
        </div>
      </form>
    </div>
  );
}
