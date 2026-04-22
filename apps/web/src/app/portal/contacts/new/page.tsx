"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createContact, getContactsList } from "@/app/actions/contacts";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { Button, ButtonLink } from "@/app/components/ui/primitives";
import { User, Flag } from "lucide-react";

export default function NewContactPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (k: string) => searchParams.get(k) ?? "";
  const referralContactIdFromUrl = searchParams.get("referralContactId") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactOptions, setContactOptions] = useState<{ id: string; label: string }[]>([]);
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [priority, setPriority] = useState("");
  const [referralContactId, setReferralContactId] = useState(referralContactIdFromUrl);

  useEffect(() => {
    getContactsList()
      .then((list) => setContactOptions(list.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const rawTags = (fd.get("tags") as string) || "";
      const parsedTags = rawTags.split(",").map((t) => t.trim()).filter(Boolean);
      const result = await createContact({
        firstName: (fd.get("firstName") as string) || "",
        lastName: (fd.get("lastName") as string) || "",
        email: (fd.get("email") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        title: (fd.get("title") as string) || undefined,
        referralSource: (fd.get("referralSource") as string) || undefined,
        birthDate: (fd.get("birthDate") as string) || undefined,
        personalId: (fd.get("personalId") as string) || undefined,
        street: (fd.get("street") as string) || undefined,
        city: (fd.get("city") as string) || undefined,
        zip: (fd.get("zip") as string) || undefined,
        tags: parsedTags.length ? parsedTags : undefined,
        lifecycleStage: lifecycleStage || undefined,
        priority: priority || undefined,
        referralContactId: referralContactId || undefined,
        notes: (fd.get("notes") as string) || undefined,
      });
      if (result.ok) router.push(`/portal/contacts/${result.id}`);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-3 text-sm text-[color:var(--wp-text)] focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300";
  const labelCls = "block text-xs font-semibold text-[color:var(--wp-text-secondary)] mb-1";

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl md:text-3xl font-black text-[color:var(--wp-text)]">Nový kontakt</h1>
      <form
        onSubmit={onSubmit}
        className="max-w-md space-y-4 rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 shadow-[var(--wp-shadow-card)]"
      >
        <div>
          <label className={labelCls}>Jméno *</label>
          <input name="firstName" required className={inputCls} defaultValue={q("firstName")} />
        </div>
        <div>
          <label className={labelCls}>Příjmení *</label>
          <input name="lastName" required className={inputCls} defaultValue={q("lastName")} />
        </div>
        <div>
          <label className={labelCls}>E-mail</label>
          <input name="email" type="email" className={inputCls} defaultValue={q("email")} />
        </div>
        <div>
          <label className={labelCls}>Telefon</label>
          <input name="phone" className={inputCls} defaultValue={q("phone")} />
        </div>
        <div>
          <label className={labelCls}>Titul</label>
          <input name="title" className={inputCls} defaultValue={q("title")} />
        </div>
        <div>
          <label className={labelCls}>Doporučil / zdroj</label>
          <input name="referralSource" placeholder="např. web, doporučení" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Datum narození</label>
          <input name="birthDate" type="date" className={inputCls} defaultValue={q("birthDate")} />
        </div>
        <div>
          <label className={labelCls}>Rodné číslo / osobní ID</label>
          <input name="personalId" className={inputCls} defaultValue={q("personalId")} />
        </div>
        <div>
          <label className={labelCls}>Ulice</label>
          <input name="street" className={inputCls} defaultValue={q("street")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Město</label>
            <input name="city" className={inputCls} defaultValue={q("city")} />
          </div>
          <div>
            <label className={labelCls}>PSČ</label>
            <input name="zip" className={inputCls} defaultValue={q("zip")} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Poznámky</label>
          <textarea name="notes" rows={4} className={inputCls} defaultValue={q("notes")} />
        </div>
        <div>
          <label className={labelCls}>Štítky (oddělené čárkou)</label>
          <input name="tags" placeholder="např. VIP, rodina" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Fáze životního cyklu</label>
          <CustomDropdown
            value={lifecycleStage}
            onChange={setLifecycleStage}
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
          <label className={labelCls}>Priorita</label>
          <CustomDropdown
            value={priority}
            onChange={setPriority}
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
          <label className={labelCls}>Doporučen od (kontakt)</label>
          <CustomDropdown
            value={referralContactId}
            onChange={setReferralContactId}
            options={[{ id: "", label: "— žádný" }, ...contactOptions]}
            placeholder="— žádný"
            icon={User}
          />
        </div>
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            {loading ? "Ukládám…" : "Uložit"}
          </Button>
          <ButtonLink href="/portal/contacts" variant="secondary" size="lg">
            Zrušit
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
