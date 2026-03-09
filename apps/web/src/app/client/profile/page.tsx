"use client";

import { useEffect, useState, useTransition } from "react";
import { getContact } from "@/app/actions/contacts";
import { clientUpdateProfile } from "@/app/actions/contacts";

type ProfileData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
};

export default function ClientProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [form, setForm] = useState<Pick<ProfileData, "email" | "phone" | "street" | "city" | "zip">>({
    email: "",
    phone: "",
    street: "",
    city: "",
    zip: "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const res = await fetch("/api/client/profile");
      if (!res.ok) return;
      const data: ProfileData = await res.json();
      setProfile(data);
      setForm({
        email: data.email || "",
        phone: data.phone || "",
        street: data.street || "",
        city: data.city || "",
        zip: data.zip || "",
      });
    } catch {}
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await clientUpdateProfile(form);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chyba při ukládání");
      }
    });
  }

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <p className="text-monday-text-muted text-sm">Načítám profil…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-monday-text">Můj profil</h1>

      <div className="rounded-xl border border-monday-border bg-monday-surface p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-monday-text-muted mb-1">Jméno</label>
            <input
              type="text"
              value={profile.firstName}
              disabled
              className="w-full rounded-[6px] border border-monday-border bg-monday-bg px-3 py-2 text-sm text-monday-text-muted"
            />
          </div>
          <div>
            <label className="block text-xs text-monday-text-muted mb-1">Příjmení</label>
            <input
              type="text"
              value={profile.lastName}
              disabled
              className="w-full rounded-[6px] border border-monday-border bg-monday-bg px-3 py-2 text-sm text-monday-text-muted"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-monday-text-muted mb-1">E-mail</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:border-monday-blue"
          />
        </div>

        <div>
          <label className="block text-xs text-monday-text-muted mb-1">Telefon</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:border-monday-blue"
          />
        </div>

        <div>
          <label className="block text-xs text-monday-text-muted mb-1">Ulice</label>
          <input
            type="text"
            value={form.street}
            onChange={(e) => setForm({ ...form, street: e.target.value })}
            className="w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:border-monday-blue"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-monday-text-muted mb-1">Město</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:border-monday-blue"
            />
          </div>
          <div>
            <label className="block text-xs text-monday-text-muted mb-1">PSČ</label>
            <input
              type="text"
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
              className="w-full rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:border-monday-blue"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Ukládám…" : "Uložit změny"}
          </button>
          {saved && <span className="text-sm text-green-600">Uloženo.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
