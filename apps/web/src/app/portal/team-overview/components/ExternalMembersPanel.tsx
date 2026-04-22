"use client";

/**
 * F4 \u2014 Admin UI pro extern\u00ed / manu\u00e1ln\u011b veden\u00e9 \u010dleny t\u00fdmu a jejich period snapshot.
 *
 * Minimalistick\u00fd, ale kompletn\u011b funk\u010dn\u00ed panel. Montuje se dovnit\u0159 TeamManagementPanel
 * v ot\u00e1\u010dce "Spr\u00e1va t\u00fdmu". Obsahuje:
 *   - Formul\u00e1\u0159 pro zalo\u017een\u00ed extern\u00edho \u010dlena (jm\u00e9no, email, parent, kari\u00e9ra).
 *   - Seznam existuj\u00edc\u00edch extern\u00edch \u010dlen\u016f se statusem.
 *   - Modal pro rychl\u00e9 vypln\u011bn\u00ed manual period snapshot (units/production/meetings).
 *
 * Pozn\u00e1mka: seznam extern\u00edch \u010dlen\u016f \u010dte z props (server-side pre-fetch
 * p\u0159es getTeamOverviewPageSnapshot \u2014 m\u00e1me dostupn\u00e9 TeamHierarchyMember[]).
 */

import { useState, useTransition } from "react";
import type { TeamHierarchyMember } from "@/lib/team-hierarchy-types";
import {
  createExternalTeamMember,
  updateExternalTeamMember,
  upsertManualPeriod,
} from "@/app/actions/team-members-manual";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";

type Props = {
  roleName: string;
  members: TeamHierarchyMember[];
};

export function ExternalMembersPanel({ roleName, members }: Props) {
  const canWrite = hasPermission(roleName as RoleName, "team_members:write");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ displayName: "", email: "", parentMemberId: "" });
  const [openPeriodFor, setOpenPeriodFor] = useState<string | null>(null);

  const externals = members.filter((m) => m.memberKind === "external_manual");
  const potentialParents = members.filter((m) => m.teamMemberId && m.status === "active");

  if (!canWrite) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Nem\u00e1te opr\u00e1vn\u011bn\u00ed spravovat extern\u00ed \u010dleny t\u00fdmu.
      </div>
    );
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await createExternalTeamMember({
        displayName: form.displayName,
        email: form.email || null,
        parentMemberId: form.parentMemberId || null,
      });
      if (!res.ok) setErr(res.error);
      else setForm({ displayName: "", email: "", parentMemberId: "" });
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-800">Extern\u00ed / manu\u00e1ln\u011b veden\u00fd \u010dlen</h4>
        <form onSubmit={submitCreate} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Jm\u00e9no *"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
          />
          <input
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Email (voliteln\u011b)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={form.parentMemberId}
            onChange={(e) => setForm({ ...form, parentMemberId: e.target.value })}
          >
            <option value="">\u2014 bez manager\u00e1 \u2014</option>
            {potentialParents.map((p) => (
              <option key={p.teamMemberId!} value={p.teamMemberId!}>
                {p.displayName ?? p.email ?? p.userId}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {pending ? "Ukl\u00e1d\u00e1m\u2026" : "P\u0159idat"}
          </button>
        </form>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        <p className="mt-2 text-xs text-slate-500">
          Extern\u00ed \u010dlen nem\u00e1 Aidvisora \u00fa\u010det \u2014 data evidujete ru\u010dn\u011b. Pozd\u011bji je mo\u017en\u00e9 prop\u00e1rovat se skute\u010dn\u00fdm \u00fa\u010dtem.
        </p>
      </div>

      <div className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
          Extern\u00ed \u010dlenov\u00e9 ({externals.length})
        </div>
        {externals.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">Zat\u00edm \u017e\u00e1dn\u00ed extern\u00ed \u010dlenov\u00e9.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {externals.map((m) => (
              <li key={m.userId} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">{m.displayName ?? m.email ?? "(bez jm\u00e9na)"}</div>
                  <div className="text-xs text-slate-500">
                    {m.roleName} \u00b7 {m.status} \u00b7 {m.careerProgram ?? "bez programu"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpenPeriodFor(m.teamMemberId)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Zadat m\u011bs\u00edc
                  </button>
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await updateExternalTeamMember(m.teamMemberId!, {
                          status: m.status === "active" ? "paused" : "active",
                        });
                      })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    {m.status === "active" ? "Pozastavit" : "Aktivovat"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {openPeriodFor && (
        <ManualPeriodModal
          teamMemberId={openPeriodFor}
          onClose={() => setOpenPeriodFor(null)}
        />
      )}
    </div>
  );
}

function ManualPeriodModal({ teamMemberId, onClose }: { teamMemberId: string; onClose: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [units, setUnits] = useState<string>("");
  const [production, setProduction] = useState<string>("");
  const [meetings, setMeetings] = useState<string>("");
  const [contracts, setContracts] = useState<string>("");
  const [confidence, setConfidence] = useState<"manual_confirmed" | "manual_estimated">("manual_confirmed");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await upsertManualPeriod({
        teamMemberId,
        period: "month",
        year,
        periodIndex: month,
        unitsCount: units ? Number(units) : null,
        productionAmount: production ? Number(production) : null,
        meetingsCount: meetings ? Number(meetings) : null,
        contractsCount: contracts ? Number(contracts) : null,
        confidence,
        sourceNote: note || null,
      });
      if (!res.ok) setErr(res.error ?? "Chyba");
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-base font-semibold">Manu\u00e1ln\u00ed obdob\u00ed</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Rok
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            M\u011bs\u00edc
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            BJ / Units
            <input
              type="number"
              step="0.01"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Produkce (K\u010d)
            <input
              type="number"
              step="0.01"
              value={production}
              onChange={(e) => setProduction(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Sch\u016fzky
            <input
              type="number"
              value={meetings}
              onChange={(e) => setMeetings(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Smlouvy
            <input
              type="number"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block text-xs">
          Spolehlivost
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as typeof confidence)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="manual_confirmed">Potvrzeno</option>
            <option value="manual_estimated">Odhad</option>
          </select>
        </label>
        <label className="mt-2 block text-xs">
          Pozn\u00e1mka (zdroj dat)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1 text-sm">
            Zru\u0161it
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {pending ? "Ukl\u00e1d\u00e1m\u2026" : "Ulo\u017eit"}
          </button>
        </div>
      </form>
    </div>
  );
}
