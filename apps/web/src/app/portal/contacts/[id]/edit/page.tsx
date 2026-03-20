"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getContact, getContactsList, updateContact, uploadContactAvatar, deleteContact } from "@/app/actions/contacts";
import { getHouseholdForContact, getHouseholdsList, setContactHousehold } from "@/app/actions/households";
import { ArrowLeft, Flag, User, Home, RefreshCw } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { useKeyboardAware } from "@/lib/ui/useKeyboardAware";
import { AddressAutocomplete, type AddressComponents } from "@/app/components/weplan/AddressAutocomplete";

export default function EditContactPage() {
  const router = useRouter();
  const { keyboardInset } = useKeyboardAware();
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
  const [addressSearch, setAddressSearch] = useState("");
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

  const inputCls = "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 min-h-[44px]";

  return (
    <div className="min-h-0 flex flex-col">
      {/* Topbar: zpět, nadpis, CTA – sticky na mobilu */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/portal/contacts/${id}`}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 min-h-[44px] items-center"
          >
            <ArrowLeft size={18} /> Zpět na profil
          </Link>
          <h1 className="text-lg font-black text-slate-900 truncate">Upravit kontakt</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/contacts/${id}`}
            className="rounded-xl px-4 py-2.5 text-sm font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 min-h-[44px] flex items-center"
          >
            Zrušit
          </Link>
          <button
            type="submit"
            form="edit-contact-form"
            disabled={loading}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 min-h-[44px] shadow-sm"
          >
            {loading ? "Ukládám…" : "Uložit změny"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8" style={{ paddingBottom: `calc(var(--safe-area-bottom) + ${keyboardInset}px)` }}>
        <form id="edit-contact-form" onSubmit={onSubmit} className="max-w-2xl mx-auto space-y-8">
          {submitErr && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3" role="alert">
              {submitErr}
            </p>
          )}

          {/* Karta: Základní údaje */}
          <section className="rounded-[24px] border border-slate-100 bg-white p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-6">Základní údaje</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Profilová fotka</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 text-2xl font-bold shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (form.firstName?.[0] ?? "") + (form.lastName?.[0] ?? "")
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 min-h-[44px] w-fit">
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
                          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 min-h-[44px]"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Jméno *</label>
                  <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Příjmení *</label>
                  <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Titul</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Datum narození</label>
                  <input type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Rodné číslo / osobní ID</label>
                  <input value={form.personalId} onChange={(e) => setForm((f) => ({ ...f, personalId: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Karta: Kontaktní údaje */}
          <section className="rounded-[24px] border border-slate-100 bg-white p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-6">Kontaktní údaje</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">E-mail</label>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Telefon</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Vyhledat adresu</label>
                <AddressAutocomplete
                  value={addressSearch}
                  onChange={setAddressSearch}
                  onSelectAddress={(c: AddressComponents) => {
                    const streetPart = [c.street, c.houseNumber].filter(Boolean).join(" ");
                    setForm((prev) => ({
                      ...prev,
                      street: streetPart || prev.street,
                      city: c.city ?? prev.city,
                      zip: c.postalCode ?? prev.zip,
                    }));
                    setAddressSearch("");
                  }}
                  placeholder="Začněte psát adresu…"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Ulice</label>
                <input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Město</label>
                  <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">PSČ</label>
                  <input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Karta: Segmentace a vazby */}
          <section className="rounded-[24px] border border-slate-100 bg-white p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-6">Segmentace a vazby</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Štítky (oddělené čárkou)</label>
                <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="např. VIP, rodina" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Fáze životního cyklu</label>
                <CustomDropdown
                  value={form.lifecycleStage}
                  onChange={(id) => setForm((f) => ({ ...f, lifecycleStage: id }))}
                  options={[
                    { id: "", label: "—" },
                    { id: "lead", label: "Lead" },
                    { id: "prospect", label: "Prospect" },
                    { id: "client", label: "Klient" },
                    { id: "former_client", label: "Bývalý klient" },
                  ]}
                  placeholder="—"
                  icon={User}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Priorita</label>
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
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Doporučil / zdroj</label>
                <input value={form.referralSource} onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} placeholder="např. web, doporučení" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Doporučen od (kontakt)</label>
                <CustomDropdown
                  value={form.referralContactId}
                  onChange={(id) => setForm((f) => ({ ...f, referralContactId: id }))}
                  options={[{ id: "", label: "— žádný" }, ...contactOptions]}
                  placeholder="— žádný"
                  icon={User}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Domácnost</label>
                <CustomDropdown
                  value={form.householdId}
                  onChange={(id) => setForm((f) => ({ ...f, householdId: id }))}
                  options={[{ id: "", label: "— žádná" }, ...householdOptions.map((h) => ({ id: h.id, label: h.name }))]}
                  placeholder="— žádná"
                  icon={Home}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Servisní cyklus (měsíce)</label>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Poslední servis</label>
                  <input type="date" value={form.lastServiceDate} onChange={(e) => setForm((f) => ({ ...f, lastServiceDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Příští servis</label>
                  <input type="date" value={form.nextServiceDue} onChange={(e) => setForm((f) => ({ ...f, nextServiceDue: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Nebezpečná zóna */}
          <section className="rounded-[24px] border border-red-200 bg-red-50/50 p-6 md:p-8">
            <h2 className="text-lg font-black text-red-700 mb-2">Nebezpečná zóna</h2>
            <p className="text-sm text-slate-600 mb-5">
              Smazání kontaktu je nevratné. Smažou se i vazby v domácnostech a související data dle nastavení systému.
            </p>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-xl px-5 py-2.5 text-sm font-bold border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 min-h-[44px]"
            >
              {deleting ? "Mažu…" : "Smazat kontakt navždy"}
            </button>
          </section>
        </form>
      </div>
    </div>
  );
}
