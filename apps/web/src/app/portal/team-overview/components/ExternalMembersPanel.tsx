"use client";

/**
 * F4 — Admin UI pro externí / manuálně vedené členy týmu a jejich period snapshot.
 *
 * Minimalistický, ale kompletně funkční panel. Montuje se dovnitř TeamManagementPanel
 * v otáčce "Správa týmu". Obsahuje:
 *   - Formulář pro založení externího člena (jméno, email, parent, kariéra).
 *   - Seznam existujících externích členů se statusem.
 *   - Modal pro rychlé vyplnění manual period snapshot (units/production/meetings).
 *
 * Poznámka: seznam externích členů čte z props (server-side pre-fetch
 * přes getTeamOverviewPageSnapshot — máme dostupné TeamHierarchyMember[]).
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
      <div className="rounded border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-4 text-sm text-[color:var(--wp-text-secondary)]">
        Nemáte oprávnění spravovat externí členy týmu.
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
      <div className="rounded border border-[color:var(--wp-surface-card-border)] bg-white p-4">
        <h4 className="mb-1 text-sm font-semibold text-[color:var(--wp-text)]">Přidat externího člena týmu</h4>
        <p className="mb-3 text-xs text-[color:var(--wp-text-secondary)]">
          Členové, kteří nemají Aidvisora účet — například spolupracující poradci, jejichž data evidujete ručně.
        </p>
        <form onSubmit={submitCreate} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            className="rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            placeholder="Jméno *"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
          />
          <input
            className="rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            placeholder="Email (volitelně)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <select
            className="rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            value={form.parentMemberId}
            onChange={(e) => setForm({ ...form, parentMemberId: e.target.value })}
          >
            <option value="">— bez managera —</option>
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
            {pending ? "Ukládám…" : "Přidat"}
          </button>
        </form>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        <p className="mt-2 text-xs text-[color:var(--wp-text-secondary)]">
          Externí člen nemá Aidvisora účet — data evidujete ručně. Později je možné propárovat se skutečným účtem.
        </p>
      </div>

      <div className="rounded border border-[color:var(--wp-surface-card-border)] bg-white">
        <div className="border-b border-[color:var(--wp-surface-card-border)] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text)]">
          Externí členové ({externals.length})
        </div>
        {externals.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[color:var(--wp-text-secondary)]">Zatím žádní externí členové.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {externals.map((m) => (
              <li key={m.userId} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-[color:var(--wp-text)]">{m.displayName ?? m.email ?? "(bez jména)"}</div>
                  <div className="text-xs text-[color:var(--wp-text-secondary)]">
                    {m.roleName} · {m.status} · {m.careerProgram ?? "bez programu"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpenPeriodFor(m.teamMemberId)}
                    className="rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-xs hover:bg-[color:var(--wp-main-scroll-bg)]"
                  >
                    Zadat měsíc
                  </button>
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await updateExternalTeamMember(m.teamMemberId!, {
                          status: m.status === "active" ? "paused" : "active",
                        });
                      })
                    }
                    className="rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-xs hover:bg-[color:var(--wp-main-scroll-bg)]"
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-base font-semibold">Manuální období</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Rok
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Měsíc
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            BJ / Units
            <input
              type="number"
              step="0.01"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Produkce (Kč)
            <input
              type="number"
              step="0.01"
              value={production}
              onChange={(e) => setProduction(e.target.value)}
              className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Schůzky
            <input
              type="number"
              value={meetings}
              onChange={(e) => setMeetings(e.target.value)}
              className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            Smlouvy
            <input
              type="number"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block text-xs">
          Spolehlivost
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as typeof confidence)}
            className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
          >
            <option value="manual_confirmed">Potvrzeno</option>
            <option value="manual_estimated">Odhad</option>
          </select>
        </label>
        <label className="mt-2 block text-xs">
          Poznámka (zdroj dat)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded border border-[color:var(--wp-surface-card-border)] px-2 py-1 text-sm"
          />
        </label>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-[color:var(--wp-surface-card-border)] px-3 py-1 text-sm">
            Zrušit
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {pending ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </form>
    </div>
  );
}
