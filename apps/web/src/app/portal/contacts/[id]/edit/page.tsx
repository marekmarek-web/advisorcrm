"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getContact, getContactsList, updateContact, uploadContactAvatar, deleteContact } from "@/app/actions/contacts";
import { getHouseholdForContact, getHouseholdsList, setContactHousehold } from "@/app/actions/households";
import { ArrowLeft } from "lucide-react";

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
    householdId: "",
  });
  const [contactOptions, setContactOptions] = useState<{ id: string; label: string }[]>([]);
  const [householdOptions, setHouseholdOptions] = useState<{ id: string; name: string }[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getContact(id)
      .then((c) => {
        if (!c) setLoadErr("Kontakt nenalezen.");
        else {
          setAvatarUrl(c.avatarUrl ?? null);
          setForm((prev) => ({
            ...prev,
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
          }));
        }
      })
      .catch(() => setLoadErr("Chyba načtení."));
  }, [id]);

  useEffect(() => {
    getHouseholdForContact(id).then((h) => {
      if (h) setForm((prev) => ({ ...prev, householdId: h.id }));
    }).catch(() => {});
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

  useEffect(() => {
    getHouseholdsList()
      .then((list) => setHouseholdOptions(list.map((h) => ({ id: h.id, name: h.name }))))
      .catch(() => {});
  }, []);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const url = await uploadContactAvatar(id, fd);
      if (url) setAvatarUrl(url);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Nahrání se nezdařilo");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

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
      await setContactHousehold(id, form.householdId || null);
      router.push(`/portal/contacts/${id}`);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Opravdu smazat tohoto kontakt navždy? Tuto akci nelze vrátit zpět.")) return;
    setDeleting(true);
    try {
      await deleteContact(id);
      router.push("/portal/contacts");
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Smazání se nezdařilo");
    } finally {
      setDeleting(false);
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

  const inputCls = "w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:ring-1 focus:ring-monday-blue min-h-[44px]";

  return (
    <div className="min-h-0 flex flex-col">
      {/* Topbar: zpět, nadpis, CTA – sticky na mobilu */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 sm:gap-4 p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/portal/contacts/${id}`}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] items-center"
          >
            <ArrowLeft size={18} /> Zpět na profil
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 truncate">Upravit kontakt</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/contacts/${id}`}
            className="rounded-[6px] px-4 py-2.5 text-sm font-semibold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 min-h-[44px] flex items-center"
          >
            Zrušit
          </Link>
          <button
            type="submit"
            form="edit-contact-form"
            disabled={loading}
            className="rounded-[6px] px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 min-h-[44px]"
          >
            {loading ? "Ukládám…" : "Uložit změny"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6">
        <form id="edit-contact-form" onSubmit={onSubmit} className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
          {submitErr && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2" role="alert">
              {submitErr}
            </p>
          )}

          {/* Karta: Základní údaje */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Základní údaje</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Profilová fotka</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 text-2xl font-bold shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (form.firstName?.[0] ?? "") + (form.lastName?.[0] ?? "")
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-[6px] border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px] w-fit">
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={onAvatarChange} disabled={avatarUploading} />
                        {avatarUploading ? "Nahrávám…" : "Nahrát fotku"}
                      </label>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            setAvatarError(null);
                            try {
                              await updateContact(id, {
                                firstName: form.firstName,
                                lastName: form.lastName,
                                avatarUrl: null,
                              });
                              setAvatarUrl(null);
                            } catch (e) {
                              setAvatarError(e instanceof Error ? e.message : "Odstranění fotky se nezdařilo");
                            }
                          }}
                          className="px-3 py-2 rounded-[6px] border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 min-h-[44px]"
                        >
                          Odstranit fotku
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">JPEG, PNG, WebP nebo GIF, max 3 MB</p>
                    {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Jméno *</label>
                  <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Příjmení *</label>
                  <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Titul</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Datum narození</label>
                  <input type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Rodné číslo / osobní ID</label>
                  <input value={form.personalId} onChange={(e) => setForm((f) => ({ ...f, personalId: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Karta: Kontaktní údaje */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Kontaktní údaje</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">E-mail</label>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Telefon</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Ulice</label>
                <input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Město</label>
                  <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">PSČ</label>
                  <input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Karta: Segmentace a vazby */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Segmentace a vazby</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Štítky (oddělené čárkou)</label>
                <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="např. VIP, rodina" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Fáze životního cyklu</label>
                <select value={form.lifecycleStage} onChange={(e) => setForm((f) => ({ ...f, lifecycleStage: e.target.value }))} className={inputCls}>
                  <option value="">—</option>
                  <option value="lead">Lead</option>
                  <option value="prospect">Prospect</option>
                  <option value="client">Klient</option>
                  <option value="former_client">Bývalý klient</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Priorita</label>
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={inputCls}>
                  <option value="">—</option>
                  <option value="low">Nízká</option>
                  <option value="normal">Běžná</option>
                  <option value="high">Vysoká</option>
                  <option value="urgent">Urgentní</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Doporučil / zdroj</label>
                <input value={form.referralSource} onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} placeholder="např. web, doporučení" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Doporučen od (kontakt)</label>
                <select value={form.referralContactId} onChange={(e) => setForm((f) => ({ ...f, referralContactId: e.target.value }))} className={inputCls}>
                  <option value="">— žádný</option>
                  {contactOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Domácnost</label>
                <select value={form.householdId} onChange={(e) => setForm((f) => ({ ...f, householdId: e.target.value }))} className={inputCls}>
                  <option value="">— žádná</option>
                  {householdOptions.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Servisní cyklus (měsíce)</label>
                <select value={form.serviceCycleMonths} onChange={(e) => setForm((f) => ({ ...f, serviceCycleMonths: e.target.value }))} className={inputCls}>
                  <option value="">—</option>
                  <option value="3">3</option>
                  <option value="6">6</option>
                  <option value="12">12</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Poslední servis</label>
                  <input type="date" value={form.lastServiceDate} onChange={(e) => setForm((f) => ({ ...f, lastServiceDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Příští servis</label>
                  <input type="date" value={form.nextServiceDue} onChange={(e) => setForm((f) => ({ ...f, nextServiceDue: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Nebezpečná zóna */}
          <section className="rounded-xl border border-red-200 bg-red-50/50 p-5 md:p-6">
            <h2 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-2">Nebezpečná zóna</h2>
            <p className="text-sm text-slate-600 mb-4">
              Smazání kontaktu je nevratné. Smažou se i vazby v domácnostech a související data dle nastavení systému.
            </p>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-[6px] px-4 py-2.5 text-sm font-semibold border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 min-h-[44px]"
            >
              {deleting ? "Mažu…" : "Smazat kontakt navždy"}
            </button>
          </section>
        </form>
      </div>
    </div>
  );
}
