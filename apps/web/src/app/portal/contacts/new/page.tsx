"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createContact, getContactsList } from "@/app/actions/contacts";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { User, Flag } from "lucide-react";

export default function NewContactPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      const id = await createContact({
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
      });
      if (id) router.push(`/portal/contacts/${id}`);
      else setError("Vytvoření se nepovedlo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:ring-1 focus:ring-monday-blue";

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-lg font-semibold text-monday-text">Nový kontakt</h1>
      <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-lg border border-monday-border bg-monday-surface p-6">
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Jméno *</label>
          <input name="firstName" required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Příjmení *</label>
          <input name="lastName" required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">E-mail</label>
          <input name="email" type="email" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Telefon</label>
          <input name="phone" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Titul</label>
          <input name="title" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Doporučil / zdroj</label>
          <input name="referralSource" placeholder="např. web, doporučení" className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Datum narození</label>
          <input name="birthDate" type="date" className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Rodné číslo / osobní ID</label>
          <input name="personalId" className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Ulice</label>
          <input name="street" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Město</label>
            <input name="city" className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">PSČ</label>
            <input name="zip" className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Štítky (oddělené čárkou)</label>
          <input name="tags" placeholder="např. VIP, rodina" className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Fáze životního cyklu</label>
          <CustomDropdown
            value={lifecycleStage}
            onChange={setLifecycleStage}
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
          <label className="block text-[13px] font-semibold text-monday-text-muted mb-1">Priorita</label>
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
          <label className="block text-xs font-semibold text-monday-text-muted mb-1">Doporučen od (kontakt)</label>
          <CustomDropdown
            value={referralContactId}
            onChange={setReferralContactId}
            options={[{ id: "", label: "— žádný" }, ...contactOptions]}
            placeholder="— žádný"
            icon={User}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue disabled:opacity-50">
            {loading ? "Ukládám…" : "Uložit"}
          </button>
          <Link href="/portal/contacts" className="rounded-[6px] px-4 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover">
            Zrušit
          </Link>
        </div>
      </form>
    </div>
  );
}
