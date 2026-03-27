"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createContact, getContactsList } from "@/app/actions/contacts";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { Flag, User } from "lucide-react";

export default function NewContactPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralContactIdFromUrl = searchParams.get("referralContactId") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactOptions, setContactOptions] = useState<{ id: string; label: string }[]>([]);
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
        referralContactId: referralContactId || undefined,
        priority: priority || undefined,
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
      <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Jméno *</label>
          <input name="firstName" required className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]" placeholder="Jan" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Příjmení *</label>
          <input name="lastName" required className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]" placeholder="Novák" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">E-mail</label>
          <input name="email" type="email" className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]" placeholder="jan@example.cz" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Telefon</label>
          <input name="phone" className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]" placeholder="+420 …" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Titul</label>
          <input name="title" className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]" placeholder="Ing." />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Doporučil / zdroj</label>
          <input name="referralSource" className="w-full rounded-lg border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-3 py-2 text-[color:var(--wp-input-text)]" placeholder="např. web, doporučení" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Priorita</label>
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
          <label className="mb-1 block text-sm font-semibold text-[color:var(--wp-text-secondary)]">Doporučen od (kontakt)</label>
          <CustomDropdown
            value={referralContactId}
            onChange={setReferralContactId}
            options={[{ id: "", label: "— žádný" }, ...contactOptions]}
            placeholder="— žádný"
            icon={User}
          />
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
          <Link href="/dashboard/contacts" className="rounded-lg border border-[color:var(--wp-border-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]">
            Zrušit
          </Link>
        </div>
      </form>
    </div>
  );
}
