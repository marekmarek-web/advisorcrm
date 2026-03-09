"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getMindmap } from "@/app/actions/mindmap";
import type { MindmapState } from "@/app/actions/mindmap";
import { MindmapView } from "./MindmapView";
import { getContactsList } from "@/app/actions/contacts";
import { getHouseholdsList } from "@/app/actions/households";
import type { ContactRow } from "@/app/actions/contacts";
import type { HouseholdRow } from "@/app/actions/households";

export default function MindmapPage() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contactId");
  const householdId = searchParams.get("householdId");

  const [state, setState] = useState<MindmapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [households, setHouseholds] = useState<HouseholdRow[]>([]);

  useEffect(() => {
    if (contactId) {
      setLoading(true);
      setError(null);
      getMindmap("contact", contactId)
        .then(setState)
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Chyba načtení");
          setState(null);
        })
        .finally(() => setLoading(false));
    } else if (householdId) {
      setLoading(true);
      setError(null);
      getMindmap("household", householdId)
        .then(setState)
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Chyba načtení");
          setState(null);
        })
        .finally(() => setLoading(false));
    } else {
      setState(null);
      setLoading(false);
      getContactsList().then(setContacts).catch(() => {});
      getHouseholdsList().then(setHouseholds).catch(() => {});
    }
  }, [contactId, householdId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-[#f8fafc]">
        <p className="text-slate-500 font-medium">Načítám mapu…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-[#f8fafc] gap-4">
        <p className="text-rose-600 font-medium">{error}</p>
        <Link href="/portal/mindmap" className="text-indigo-600 hover:underline text-sm font-medium">
          Zpět na výběr
        </Link>
      </div>
    );
  }

  if (!contactId && !householdId) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Strategická mapa</h1>
          <p className="text-slate-600 mb-8">
            Vyberte klienta nebo domácnost pro zobrazení a úpravu strategické mapy.
          </p>
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Klienti</h2>
            <ul className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {contacts.length === 0 ? (
                <li className="px-6 py-4 text-slate-500 text-sm">Žádní klienti</li>
              ) : (
                contacts.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/portal/mindmap?contactId=${c.id}`}
                      className="block px-6 py-4 hover:bg-slate-50 transition-colors font-medium text-slate-800"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </li>
                ))
              )}
            </ul>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mt-8">Domácnosti</h2>
            <ul className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {households.length === 0 ? (
                <li className="px-6 py-4 text-slate-500 text-sm">Žádné domácnosti</li>
              ) : (
                households.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/portal/mindmap?householdId=${h.id}`}
                      className="block px-6 py-4 hover:bg-slate-50 transition-colors font-medium text-slate-800"
                    >
                      {h.name}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-[#f8fafc]">
        <p className="text-slate-500">Žádná data.</p>
      </div>
    );
  }

  return <MindmapView initial={state} />;
}
