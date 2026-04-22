"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getContactEditPageData, updateContact, uploadContactAvatar, archiveContact, getContactDependencyCounts, permanentlyDeleteContacts } from "@/app/actions/contacts";
import { setContactHousehold } from "@/app/actions/households";
import { ArrowLeft, Flag, User, Home, RefreshCw } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { useKeyboardAware } from "@/lib/ui/useKeyboardAware";
import { toAvatarDisplayUrl } from "@/lib/storage/avatar-proxy";
import dynamic from "next/dynamic";
import type { AddressComponents } from "@/app/components/aidvisora/AddressAutocomplete";

const AddressAutocomplete = dynamic(
  () => import("@/app/components/aidvisora/AddressAutocomplete").then((m) => m.AddressAutocomplete),
  { ssr: false, loading: () => <div className="h-11 rounded-xl bg-[color:var(--wp-surface-muted)] animate-pulse" aria-hidden /> }
);

export default function EditContactPage() {
  const router = useRouter();
  const { keyboardInset } = useKeyboardAware();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
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
    idCardNumber: "",
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
    preferredSalutation: "",
    preferredGreetingName: "",
    greetingStyle: "",
    birthGreetingOptOut: false,
  });
  const [contactOptions, setContactOptions] = useState<{ id: string; label: string }[]>([]);
  const [householdOptions, setHouseholdOptions] = useState<{ id: string; name: string }[]>([]);
  const [addressSearch, setAddressSearch] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [permanentDeleting, setPermanentDeleting] = useState(false);
  const [canPermanentlyDelete, setCanPermanentlyDelete] = useState(false);
  const [depCounts, setDepCounts] = useState<{ contracts: number; opportunities: number; documents: number; tasks: number; analyses: number } | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [addressSectionOpen, setAddressSectionOpen] = useState(false);

  useEffect(() => {
    setPageLoading(true);
    setLoadErr("");
    getContactEditPageData(id)
      .then((bundle) => {
        const c = bundle.contact;
        if (!c) setLoadErr("Kontakt nenalezen.");
        else {
          setCanPermanentlyDelete(bundle.canPermanentlyDelete);
          setAvatarUrl(c.avatarUrl ?? null);
          setContactOptions(bundle.referralPicker);
          setHouseholdOptions(bundle.householdOptions);
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
            idCardNumber: c.idCardNumber ?? "",
            street: c.street ?? "",
            city: c.city ?? "",
            zip: c.zip ?? "",
            tags: c.tags?.join(", ") ?? "",
            lifecycleStage: c.lifecycleStage ?? "",
            priority: c.priority ?? "",
            serviceCycleMonths: c.serviceCycleMonths ?? "",
            lastServiceDate: c.lastServiceDate ?? "",
            nextServiceDue: c.nextServiceDue ?? "",
            householdId: bundle.householdId ?? "",
            preferredSalutation: c.preferredSalutation ?? "",
            preferredGreetingName: c.preferredGreetingName ?? "",
            greetingStyle: c.greetingStyle ?? "",
            birthGreetingOptOut: c.birthGreetingOptOut === true,
          }));
        }
      })
      .catch(() => setLoadErr("Chyba načtení."))
      .finally(() => setPageLoading(false));
  }, [id]);

  useEffect(() => {
    if (pageLoading || loadErr) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) setAddressSectionOpen(true);
    };
    if (typeof window === "undefined") return;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(run, 800);
    }
    return () => {
      cancelled = true;
      if (idleId != null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [pageLoading, loadErr]);

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
        idCardNumber: form.idCardNumber.trim() || undefined,
        street: form.street.trim() || undefined,
        city: form.city.trim() || undefined,
        zip: form.zip.trim() || undefined,
        tags: parsedTags.length ? parsedTags : undefined,
        lifecycleStage: form.lifecycleStage || undefined,
        priority: form.priority || undefined,
        serviceCycleMonths: form.serviceCycleMonths || undefined,
        lastServiceDate: form.lastServiceDate || undefined,
        nextServiceDue: form.nextServiceDue || undefined,
        preferredSalutation: form.preferredSalutation.trim() || null,
        preferredGreetingName: form.preferredGreetingName.trim() || null,
        greetingStyle: form.greetingStyle.trim() || null,
        birthGreetingOptOut: form.birthGreetingOptOut,
      });
      await setContactHousehold(id, form.householdId || null);
      router.push(`/portal/contacts/${id}`);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function onArchiveClick() {
    setShowArchiveDialog(false);
    setShowPermanentDeleteDialog(false);
    setDepCounts(null);
    try {
      const counts = await getContactDependencyCounts(id);
      setDepCounts(counts);
      setShowArchiveDialog(true);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Nepodařilo se načíst závislosti.");
    }
  }

  async function onPermanentDeleteClick() {
    setShowPermanentDeleteDialog(false);
    setShowArchiveDialog(false);
    setDepCounts(null);
    try {
      const counts = await getContactDependencyCounts(id);
      setDepCounts(counts);
      setShowPermanentDeleteDialog(true);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Nepodařilo se načíst závislosti.");
    }
  }

  async function onArchiveConfirm() {
    setDeleting(true);
    try {
      await archiveContact(id);
      router.push("/portal/contacts");
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Archivace se nezdařila");
    } finally {
      setDeleting(false);
      setShowArchiveDialog(false);
    }
  }

  async function onPermanentDeleteConfirm() {
    setPermanentDeleting(true);
    try {
      await permanentlyDeleteContacts([id]);
      router.push("/portal/contacts");
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Smazání se nezdařilo");
    } finally {
      setPermanentDeleting(false);
      setShowPermanentDeleteDialog(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="min-h-0 flex flex-col p-6 sm:p-8">
        <div className="max-w-2xl mx-auto w-full space-y-6 animate-pulse">
          <div className="h-10 bg-[color:var(--wp-surface-muted)] rounded-xl w-2/3" />
          <div className="h-48 bg-[color:var(--wp-surface-muted)] rounded-[var(--wp-radius-card)]" />
          <div className="h-56 bg-[color:var(--wp-surface-muted)] rounded-[var(--wp-radius-card)]" />
          <div className="h-64 bg-[color:var(--wp-surface-muted)] rounded-[var(--wp-radius-card)]" />
        </div>
      </div>
    );
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

  const inputCls = "w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 px-4 py-3 text-sm text-[color:var(--wp-text)] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 min-h-[44px]";

  return (
    <div className="min-h-0 flex flex-col">
      {/* Topbar: zpět, nadpis, CTA – sticky na mobilu */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 py-4 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/portal/contacts/${id}`}
            className="flex items-center gap-1.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] min-h-[44px] items-center"
          >
            <ArrowLeft size={18} /> Zpět na profil
          </Link>
          <h1 className="text-lg font-black text-[color:var(--wp-text)] truncate">Upravit kontakt</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/contacts/${id}`}
            className="rounded-xl px-4 py-2.5 text-sm font-bold border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] flex items-center"
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
          <section className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-black text-[color:var(--wp-text)] mb-6">Základní údaje</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Profilová fotka</label>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative w-24 h-24 rounded-2xl bg-[color:var(--wp-surface-muted)] overflow-hidden flex items-center justify-center text-[color:var(--wp-text-tertiary)] text-2xl font-bold shrink-0">
                    {(() => {
                      const avatarDisplay = toAvatarDisplayUrl(avatarUrl);
                      return avatarDisplay ? (
                        <Image src={avatarDisplay} alt="" fill sizes="96px" className="object-cover" unoptimized />
                      ) : (
                        (form.firstName?.[0] ?? "") + (form.lastName?.[0] ?? "")
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] w-fit">
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
                          className="px-4 py-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
                        >
                          Odstranit fotku
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[color:var(--wp-text-secondary)]">JPEG, PNG, WebP nebo GIF, max 3 MB</p>
                    {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Jméno *</label>
                  <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Příjmení *</label>
                  <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Titul</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Datum narození</label>
                  <input type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Rodné číslo / osobní ID</label>
                  <input value={form.personalId} onChange={(e) => setForm((f) => ({ ...f, personalId: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Číslo občanského průkazu</label>
                <input
                  value={form.idCardNumber}
                  onChange={(e) => setForm((f) => ({ ...f, idCardNumber: e.target.value }))}
                  className={inputCls}
                  placeholder="např. číslo karty"
                  autoComplete="off"
                />
              </div>
              <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 p-4 space-y-4">
                <h3 className="text-sm font-black text-[color:var(--wp-text)]">Oslovení a narozeninová přání</h3>
                <p className="text-xs text-[color:var(--wp-text-secondary)]">
                  Ručně zadejte oslovení (bez automatického skloňování). Např. „pane Nováku,“ do prvního pole a „pane Nováku“ do předmětu e-mailu.
                </p>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
                    Oslovení v těle e-mailu (za „Dobrý den, “)
                  </label>
                  <input
                    value={form.preferredSalutation}
                    onChange={(e) => setForm((f) => ({ ...f, preferredSalutation: e.target.value }))}
                    className={inputCls}
                    placeholder="např. pane Nováku,"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
                    Zkratka do předmětu (volitelné)
                  </label>
                  <input
                    value={form.preferredGreetingName}
                    onChange={(e) => setForm((f) => ({ ...f, preferredGreetingName: e.target.value }))}
                    className={inputCls}
                    placeholder="např. pane Nováku"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Styl oslovení</label>
                  <select
                    value={form.greetingStyle}
                    onChange={(e) => setForm((f) => ({ ...f, greetingStyle: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">(výchozí)</option>
                    <option value="formal">Formální</option>
                    <option value="informal">Neformální</option>
                  </select>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.birthGreetingOptOut}
                    onChange={(e) => setForm((f) => ({ ...f, birthGreetingOptOut: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-[color:var(--wp-border)]"
                  />
                  <span className="text-sm font-medium text-[color:var(--wp-text)]">
                    Neposílat narozeninová blahopřání tomuto klientovi
                  </span>
                </label>
              </div>
            </div>
          </section>

          {/* Karta: Kontaktní údaje */}
          <section className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-black text-[color:var(--wp-text)] mb-6">Kontaktní údaje</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">E-mail</label>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Telefon</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
              </div>
              {addressSectionOpen ? (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Vyhledat adresu</label>
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
              ) : (
                <p className="text-xs text-[color:var(--wp-text-tertiary)]">Načítám nástroj pro adresy…</p>
              )}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Ulice</label>
                <input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Město</label>
                  <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">PSČ</label>
                  <input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Karta: Segmentace a vazby */}
          <section className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-black text-[color:var(--wp-text)] mb-6">Segmentace a vazby</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Štítky (oddělené čárkou)</label>
                <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="např. VIP, rodina" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Fáze životního cyklu</label>
                <CustomDropdown
                  value={form.lifecycleStage}
                  onChange={(id) => setForm((f) => ({ ...f, lifecycleStage: id }))}
                  options={[
                    { id: "", label: "—" },
                    { id: "lead", label: "Úvodní kontakt" },
                    { id: "prospect", label: "Zájemce" },
                    { id: "client", label: "Klient" },
                    { id: "former_client", label: "Bývalý klient" },
                  ]}
                  placeholder="—"
                  icon={User}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Priorita</label>
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
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Doporučil / zdroj</label>
                <input value={form.referralSource} onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} placeholder="např. web, doporučení" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Doporučen od (kontakt)</label>
                <CustomDropdown
                  value={form.referralContactId}
                  onChange={(id) => setForm((f) => ({ ...f, referralContactId: id }))}
                  options={[{ id: "", label: "— žádný" }, ...contactOptions]}
                  placeholder="— žádný"
                  icon={User}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Domácnost</label>
                <CustomDropdown
                  value={form.householdId}
                  onChange={(id) => setForm((f) => ({ ...f, householdId: id }))}
                  options={[{ id: "", label: "— žádná" }, ...householdOptions.map((h) => ({ id: h.id, label: h.name }))]}
                  placeholder="— žádná"
                  icon={Home}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Servisní cyklus (měsíce)</label>
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
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Poslední servis</label>
                  <input type="date" value={form.lastServiceDate} onChange={(e) => setForm((f) => ({ ...f, lastServiceDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Příští servis</label>
                  <input type="date" value={form.nextServiceDue} onChange={(e) => setForm((f) => ({ ...f, nextServiceDue: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </section>

          {/* Archivace a trvalé smazání */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="rounded-[var(--wp-radius-card)] border border-amber-200 bg-amber-50/50 p-6 md:p-8">
              <h2 className="text-lg font-black text-amber-800 mb-2">Archivace kontaktu</h2>
              <p className="text-sm text-[color:var(--wp-text-secondary)] mb-5">
                Archivovaný kontakt zmizí ze seznamu, ale data (smlouvy, obchody, dokumenty, analýzy) zůstanou zachována a kontakt lze kdykoli obnovit.
              </p>
              <button
                type="button"
                onClick={onArchiveClick}
                disabled={deleting || permanentDeleting}
                className="rounded-xl px-5 py-2.5 text-sm font-bold border border-amber-300 text-amber-800 bg-[color:var(--wp-surface-card)] hover:bg-amber-50 disabled:opacity-50 min-h-[44px]"
              >
                {deleting ? "Archivuji…" : "Archivovat kontakt"}
              </button>
            </section>
            {canPermanentlyDelete && (
              <section className="rounded-[var(--wp-radius-card)] border border-red-200 bg-red-50/50 p-6 md:p-8">
                <h2 className="text-lg font-black text-red-800 mb-2">Trvale smazat kontakt</h2>
                <p className="text-sm text-[color:var(--wp-text-secondary)] mb-5">
                  Kontakt včetně navázaných záznamů (smlouvy, dokumenty, úkoly, analýzy a další) bude nenávratně odstraněn. Tuto akci nelze vrátit zpět.
                </p>
                <button
                  type="button"
                  onClick={onPermanentDeleteClick}
                  disabled={deleting || permanentDeleting}
                  className="rounded-xl px-5 py-2.5 text-sm font-bold border border-red-300 text-red-800 bg-[color:var(--wp-surface-card)] hover:bg-red-50 disabled:opacity-50 min-h-[44px]"
                >
                  {permanentDeleting ? "Mažu…" : "Trvale smazat kontakt"}
                </button>
              </section>
            )}
          </div>

          {showArchiveDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                <h3 className="text-lg font-black text-[color:var(--wp-text)]">Opravdu archivovat?</h3>
                {depCounts && (
                  <div className="text-sm text-[color:var(--wp-text-secondary)] space-y-1">
                    {depCounts.contracts > 0 && <p>Smlouvy: <strong>{depCounts.contracts}</strong></p>}
                    {depCounts.opportunities > 0 && <p>Obchody: <strong>{depCounts.opportunities}</strong></p>}
                    {depCounts.documents > 0 && <p>Dokumenty: <strong>{depCounts.documents}</strong></p>}
                    {depCounts.tasks > 0 && <p>Úkoly: <strong>{depCounts.tasks}</strong></p>}
                    {depCounts.analyses > 0 && <p>Finanční analýzy: <strong>{depCounts.analyses}</strong></p>}
                    <p className="pt-2 text-[color:var(--wp-text-secondary)]">Vše zůstane zachováno. Kontakt půjde kdykoli obnovit.</p>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowArchiveDialog(false)}
                    className="rounded-xl px-4 py-2.5 text-sm font-bold border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={onArchiveConfirm}
                    disabled={deleting}
                    className="rounded-xl px-5 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 min-h-[44px]"
                  >
                    {deleting ? "Archivuji…" : "Archivovat"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showPermanentDeleteDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-red-200">
                <h3 className="text-lg font-black text-red-800">Opravdu trvale smazat?</h3>
                <p className="text-sm text-[color:var(--wp-text-secondary)]">
                  Tímto nenávratně odstraníte kontakt a související záznamy. Archivace je bezpečnější volba, pokud data můžete potřebovat.
                </p>
                {depCounts && (
                  <div className="text-sm text-[color:var(--wp-text-secondary)] space-y-1">
                    {depCounts.contracts > 0 && <p>Smlouvy: <strong>{depCounts.contracts}</strong></p>}
                    {depCounts.opportunities > 0 && <p>Obchody: <strong>{depCounts.opportunities}</strong></p>}
                    {depCounts.documents > 0 && <p>Dokumenty: <strong>{depCounts.documents}</strong></p>}
                    {depCounts.tasks > 0 && <p>Úkoly: <strong>{depCounts.tasks}</strong></p>}
                    {depCounts.analyses > 0 && <p>Finanční analýzy: <strong>{depCounts.analyses}</strong></p>}
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPermanentDeleteDialog(false)}
                    className="rounded-xl px-4 py-2.5 text-sm font-bold border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={onPermanentDeleteConfirm}
                    disabled={permanentDeleting}
                    className="rounded-xl px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
                  >
                    {permanentDeleting ? "Mažu…" : "Trvale smazat"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
