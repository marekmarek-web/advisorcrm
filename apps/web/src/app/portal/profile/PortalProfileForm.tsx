"use client";

import { useState } from "react";
import { updatePortalProfile } from "@/app/actions/auth";

export type PortalProfileInitial = {
  email: string;
  fullName: string | null;
  roleName: string;
  tenantName: string;
};

export function PortalProfileForm({ initial }: { initial: PortalProfileInitial }) {
  const [fullName, setFullName] = useState(initial.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updatePortalProfile(fullName);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
        <input
          type="email"
          value={initial.email}
          readOnly
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 text-sm"
          aria-readonly
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Jméno</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Vaše jméno"
          className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
        <input
          type="text"
          value={initial.roleName}
          readOnly
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 text-sm"
          aria-readonly
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Organizace</label>
        <input
          type="text"
          value={initial.tenantName}
          readOnly
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 text-sm"
          aria-readonly
        />
      </div>
      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          Uloženo.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Ukládám…" : "Uložit"}
        </button>
      </div>
    </form>
  );
}
