"use client";

import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { User, PlusCircle } from "lucide-react";

function ageFromBirthDate(birthDate: string): number | null {
  if (!birthDate?.trim()) return null;
  const m = birthDate.match(/(\d{4})-(\d{2})-(\d{2})/) || birthDate.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const year = m[3] ? parseInt(m[3], 10) : parseInt(m[1], 10);
  const month = m[2] ? parseInt(m[2], 10) - 1 : parseInt(m[2] ?? "1", 10) - 1;
  const day = m[1] ? parseInt(m[1], 10) : 1;
  const birth = new Date(year, month, day);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return isNaN(age) ? null : age;
}

export function StepClientInfo() {
  const data = useFinancialAnalysisStore((s) => s.data);
  const setClient = useFinancialAnalysisStore((s) => s.setClient);
  const setPartner = useFinancialAnalysisStore((s) => s.setPartner);
  const addChild = useFinancialAnalysisStore((s) => s.addChild);
  const updateChild = useFinancialAnalysisStore((s) => s.updateChild);
  const removeChild = useFinancialAnalysisStore((s) => s.removeChild);

  const client = data.client;
  const partner = data.partner;
  const children = data.children;
  const age = ageFromBirthDate(client.birthDate);

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Osobní údaje</h2>
          <p className="text-slate-500 mt-1">Základní údaje pro výpočet finančního plánu.</p>
        </div>
        <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
          <User className="w-4 h-4" />
          Klient & Rodina
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">Hlavní klient</h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Jméno a příjmení</label>
              <input
                type="text"
                value={client.name}
                onChange={(e) => setClient({ name: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                placeholder=""
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Datum narození</label>
              <input
                type="text"
                value={client.birthDate}
                onChange={(e) => setClient({ birthDate: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                placeholder="RRRR-MM-DD"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Věk</label>
              <div className="w-full px-2 py-3 bg-slate-100 text-blue-800 font-bold text-center rounded-xl text-sm">
                {age != null ? `${age} let` : "—"}
              </div>
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email <span className="text-slate-400 font-normal">(volitelné)</span></label>
              <input
                type="email"
                value={client.email}
                onChange={(e) => setClient({ email: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                placeholder=""
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Telefon <span className="text-slate-400 font-normal">(volitelné)</span></label>
              <input
                type="tel"
                value={client.phone}
                onChange={(e) => setClient({ phone: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                placeholder=""
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Povolání <span className="text-slate-400 font-normal">(volitelné)</span></label>
              <input
                type="text"
                value={client.occupation}
                onChange={(e) => setClient({ occupation: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                placeholder=""
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Sporty <span className="text-slate-400 font-normal">(volitelné)</span></label>
              <input
                type="text"
                value={client.sports}
                onChange={(e) => setClient({ sports: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                placeholder=""
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
          <input
            type="checkbox"
            id="has-partner"
            checked={client.hasPartner}
            onChange={(e) => setClient({ hasPartner: e.target.checked })}
            className="w-5 h-5 text-indigo-500 rounded border-slate-300 focus:ring-indigo-400"
          />
          <label htmlFor="has-partner" className="text-slate-700 font-bold cursor-pointer select-none">Přidat partnera / partnerku</label>
        </div>

        {client.hasPartner && (
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <h3 className="text-sm font-bold text-indigo-800 uppercase tracking-widest mb-4">Partner</h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Jméno partnera</label>
                <input
                  type="text"
                  value={partner.name}
                  onChange={(e) => setPartner({ name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                  placeholder=""
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Datum narození</label>
                <input
                  type="text"
                  value={partner.birthDate}
                  onChange={(e) => setPartner({ birthDate: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                  placeholder="RRRR-MM-DD"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Povolání partnera</label>
                <input
                  type="text"
                  value={partner.occupation ?? ""}
                  onChange={(e) => setPartner({ occupation: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                  placeholder=""
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Sporty</label>
                <input
                  type="text"
                  value={partner.sports ?? ""}
                  onChange={(e) => setPartner({ sports: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                  placeholder=""
                />
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h3 className="text-lg font-bold text-slate-800">Děti</h3>
            <button
              type="button"
              onClick={() => addChild()}
              className="min-h-[44px] text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-200 flex items-center gap-1"
            >
              <PlusCircle className="w-4 h-4" />
              Přidat dítě
            </button>
          </div>
          <div className="space-y-3">
            {children.length === 0 ? (
              <div className="text-center py-6 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200 text-sm italic">
                Žádné děti zatím nepřidány.
              </div>
            ) : (
              children.map((child) => (
                <div key={child.id} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <input
                    type="text"
                    value={child.name}
                    onChange={(e) => updateChild(child.id, "name", e.target.value)}
                    placeholder="Jméno"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
                  />
                  <input
                    type="text"
                    value={child.birthDate}
                    onChange={(e) => updateChild(child.id, "birthDate", e.target.value)}
                    placeholder="Datum narození"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeChild(child.id)}
                    className="min-h-[44px] px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold"
                  >
                    Odebrat
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
