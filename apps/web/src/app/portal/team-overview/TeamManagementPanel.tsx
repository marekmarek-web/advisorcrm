"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, UserCog } from "lucide-react";
import {
  listTenantMembers,
  sendTeamMemberInvitation,
  getTenantTeamCareerDefaults,
  setTenantTeamCareerDefaultProgram,
  removeMember,
  getMemberOffboardingPreview,
} from "@/app/actions/team";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { normalizeCareerProgramFromDb } from "@/lib/career/registry";
import { TeamMemberCareerFields } from "@/app/portal/setup/TeamMemberCareerFields";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { useToast } from "@/app/components/Toast";
import { useConfirm } from "@/app/components/ConfirmDialog";

export interface TeamManagementPanelProps {
  currentUserId: string;
  currentUserEmail: string;
  currentUserFullName: string | null;
  roleName: string;
}

export function TeamManagementPanel({
  currentUserId,
  currentUserEmail,
  currentUserFullName,
  roleName,
}: TeamManagementPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const canManageTeamCareer = hasPermission(roleName as RoleName, "team_members:write");

  const resolvedCareerProgramForMember = useCallback((raw: string | null) => {
    const { programId } = normalizeCareerProgramFromDb(raw);
    return programId === "beplan" || programId === "premium_brokers" ? programId : null;
  }, []);

  const [teamMembers, setTeamMembers] = useState<Awaited<ReturnType<typeof listTenantMembers>>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Advisor");
  const [inviteSending, setInviteSending] = useState(false);
  const [tenantDefaultCareerProgram, setTenantDefaultCareerProgram] = useState<
    "__none__" | "beplan" | "premium_brokers"
  >("__none__");
  const [tenantDefaultSaving, setTenantDefaultSaving] = useState(false);

  useEffect(() => {
    listTenantMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, []);

  useEffect(() => {
    void getTenantTeamCareerDefaults().then((d) => {
      const p = d.defaultCareerProgram;
      setTenantDefaultCareerProgram(p === "beplan" || p === "premium_brokers" ? p : "__none__");
    });
  }, []);

  return (
    <section
      id="sprava-tymu"
      className="scroll-mt-24 overflow-hidden rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)]/80 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] animate-in fade-in duration-300"
      aria-labelledby="team-management-heading"
    >
      {/* Header */}
      <div className="border-b border-[color:var(--wp-surface-card-border)] px-7 py-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)]">Workspace a přístupy</p>
        <h2 id="team-management-heading" className="mt-2 text-[22px] font-black tracking-tight text-[color:var(--wp-text)]">
          Správa týmu
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[color:var(--wp-text-secondary)]">
          Spolupracujte na klientech se svými asistenty nebo kolegy.
        </p>
      </div>

      {/* Default career program */}
      {canManageTeamCareer ? (
        <div className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/50 px-7 py-6">
          <p className="mb-4 text-[11px] font-bold leading-relaxed text-[color:var(--wp-text-secondary)]">
            Výchozí kariérní program pro workspace — předvyplní se u členů bez uloženého programu (nepřepisuje jejich údaje).
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={tenantDefaultCareerProgram}
              onChange={(e) =>
                setTenantDefaultCareerProgram(e.target.value as "beplan" | "premium_brokers" | "__none__")
              }
              className="h-10 rounded-[12px] border border-[color:var(--wp-surface-card-border)] bg-white px-3 text-sm font-medium text-[color:var(--wp-text)] focus:outline-none focus:ring-2 focus:ring-[#16192b]/10"
            >
              <option value="__none__">Žádný výchozí</option>
              <option value="beplan">Beplan</option>
              <option value="premium_brokers">Premium Brokers</option>
            </select>
            <button
              type="button"
              disabled={tenantDefaultSaving}
              onClick={async () => {
                setTenantDefaultSaving(true);
                try {
                  const res = await setTenantTeamCareerDefaultProgram(
                    tenantDefaultCareerProgram === "__none__" ? null : tenantDefaultCareerProgram
                  );
                  if (!res.ok) toast.showToast(res.error ?? "Uložení se nezdařilo.", "error");
                  else toast.showToast("Výchozí kariérní program uložen.");
                } finally {
                  setTenantDefaultSaving(false);
                }
              }}
              className="h-10 rounded-[12px] bg-[#16192b] px-4 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
            >
              {tenantDefaultSaving ? "Ukládám…" : "Uložit výchozí"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Invite section */}
      <div className="border-b border-slate-700/60 bg-[#16192b] px-7 py-7 text-white">
        <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)]">
          Pozvat nového člena
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!inviteEmail.trim()) return;
            setInviteSending(true);
            try {
              const result = await sendTeamMemberInvitation(inviteEmail.trim(), inviteRole);
              if (!result.ok) {
                toast.showToast(result.error, "error");
                return;
              }
              if (result.emailSent) {
                toast.showToast(`Pozvánka odeslána na ${inviteEmail.trim()}`);
              } else {
                toast.showToast(
                  result.emailError
                    ? `Pozvánka uložena, ale e-mail se nepodařilo odeslat (${result.emailError}). Odkaz: ${result.inviteLink}`
                    : `Pozvánka uložena. Odkaz: ${result.inviteLink}`,
                  "error"
                );
              }
              setInviteEmail("");
              void listTenantMembers().then(setTeamMembers).catch(() => {});
            } catch {
              toast.showToast("Pozvánku se nepodařilo vytvořit.", "error");
            } finally {
              setInviteSending(false);
            }
          }}
          className="flex flex-wrap items-center gap-2.5"
        >
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@kolegy.cz"
            className="h-10 min-w-[200px] flex-1 rounded-[12px] border border-white/10 bg-white/5 px-4 text-sm font-medium text-white placeholder:text-[color:var(--wp-text-secondary)] focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
            required
          />
          <CustomDropdown
            value={inviteRole}
            onChange={setInviteRole}
            options={[
              { id: "Advisor", label: "Poradce" },
              { id: "Manager", label: "Manažer" },
              { id: "Viewer", label: "Prohlížeč" },
              { id: "Admin", label: "Admin" },
            ]}
            placeholder="Role"
            icon={UserCog}
          />
          <button
            type="submit"
            disabled={inviteSending || !inviteEmail.trim()}
            className="h-10 rounded-[12px] bg-white px-5 text-sm font-bold text-[#16192b] transition hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
          >
            {inviteSending ? "Odesílám…" : "Pozvat"}
          </button>
        </form>
      </div>

      {/* Members table */}
      <div className="overflow-x-auto">
        {teamMembers.length === 0 ? (
          <div className="px-7 py-10 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-[color:var(--wp-text-tertiary)]" />
            <p className="text-sm font-bold text-[color:var(--wp-text)]">Zatím žádní další členové.</p>
            <p className="mt-1 text-xs text-[color:var(--wp-text-tertiary)]">Pozvěte prvního člena formulářem výše.</p>
          </div>
        ) : (
          <table className="w-full min-w-[500px] text-left">
            <thead>
              <tr className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/80">
                <th className="px-7 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)]">
                  Uživatel
                </th>
                <th className="px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)]">
                  Role
                </th>
                <th className="hidden px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)] md:table-cell">
                  Připojení
                </th>
                <th className="px-7 py-3.5 text-right text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-tertiary)]">
                  Akce
                </th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((m) => {
                const isCurrentUser = m.userId === currentUserId;
                const displayName = isCurrentUser ? (currentUserFullName || currentUserEmail || "—") : "Člen týmu";
                const displayEmail = isCurrentUser ? currentUserEmail : "—";
                const initials =
                  isCurrentUser && currentUserFullName
                    ? [currentUserFullName.trim().split(/\s+/)[0]?.[0], currentUserFullName.trim().split(/\s+/).pop()?.[0]]
                        .filter(Boolean)
                        .join("")
                        .toUpperCase()
                    : (displayEmail.slice(0, 2).toUpperCase() || "?");
                return (
                  <tr key={m.membershipId} className="border-b border-[color:var(--wp-surface-card-border)]/80 transition hover:bg-[color:var(--wp-main-scroll-bg)]/60">
                    <td className="px-7 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#16192b] text-sm font-black text-white">
                          {initials}
                        </div>
                        <div>
                          <div className="text-[14px] font-extrabold text-[color:var(--wp-text)]">{displayName}</div>
                          <div className="mt-0.5 text-[11px] font-medium text-[color:var(--wp-text-tertiary)]">{displayEmail}</div>
                        </div>
                      </div>
                      {canManageTeamCareer ? (
                        <TeamMemberCareerFields
                          key={`${m.membershipId}-${m.careerProgram ?? ""}-${m.careerTrack ?? ""}-${m.careerPositionCode ?? ""}`}
                          membershipId={m.membershipId}
                          initialProgram={resolvedCareerProgramForMember(m.careerProgram)}
                          initialTrack={m.careerTrack}
                          initialPosition={m.careerPositionCode}
                          careerHasLegacyProgram={m.careerHasLegacyProgram}
                          tenantDefaultProgram={
                            tenantDefaultCareerProgram === "__none__" ? null : tenantDefaultCareerProgram
                          }
                          onSaved={() => void listTenantMembers().then(setTeamMembers).catch(() => {})}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-5">
                      <span
                        className={`rounded-[10px] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] ${
                          m.roleName === "Admin"
                            ? "bg-[#16192b] text-white"
                            : "border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text-secondary)]"
                        }`}
                      >
                        {m.roleName === "Admin" ? "Vlastník" : m.roleName}
                      </span>
                    </td>
                    <td className="hidden px-4 py-5 text-sm font-semibold text-[color:var(--wp-text-secondary)] md:table-cell">
                      {new Date(m.joinedAt).toLocaleDateString("cs-CZ")}
                    </td>
                    <td className="px-7 py-5 text-right">
                      {isCurrentUser ? (
                        <span className="text-xs text-[color:var(--wp-text-tertiary)]">—</span>
                      ) : (
                        <button
                          type="button"
                          className="text-[11px] font-extrabold text-rose-500 transition hover:text-rose-700 hover:underline"
                          onClick={async () => {
                            // Delta A7: preview dopadu + ownership-transfer modal
                            const preview = await getMemberOffboardingPreview(m.membershipId);
                            if (!preview.ok) {
                              toast.showToast(preview.error, "error");
                              return;
                            }
                            const c = preview.counts;
                            const totalAssignments =
                              c.tasksAssigned + c.eventsAssigned + c.opportunitiesAssigned;
                            const totalRevoked =
                              c.googleDriveIntegrations +
                              c.googleGmailIntegrations +
                              c.googleCalendarIntegrations +
                              c.pushDevices;

                            let transferToUserId: string | undefined;
                            if (totalAssignments > 0) {
                              const candidates = teamMembers.filter(
                                (x) => x.userId !== m.userId && x.userId !== currentUserId,
                              );
                              const defaultSuccessor = candidates[0]?.userId ?? currentUserId;
                              const candidateList = candidates
                                .map((x) => `  • ${x.displayName ?? x.email ?? x.userId}`)
                                .join("\n");
                              const chosen =
                                typeof window !== "undefined"
                                  ? window.prompt(
                                      `Převod přiřazení při odebrání člena\n\n` +
                                        `Tento člen má přiřazeno:\n` +
                                        `  • ${c.tasksAssigned} úkolů\n` +
                                        `  • ${c.eventsAssigned} událostí\n` +
                                        `  • ${c.opportunitiesAssigned} příležitostí\n\n` +
                                        `Dále se odvolá:\n` +
                                        `  • ${c.googleDriveIntegrations} Google Drive\n` +
                                        `  • ${c.googleGmailIntegrations} Gmail\n` +
                                        `  • ${c.googleCalendarIntegrations} Calendar\n` +
                                        `  • ${c.pushDevices} push zařízení\n\n` +
                                        `Zadejte user_id nástupce (nebo potvrďte výchozího):\n` +
                                        `${candidateList}\n\n` +
                                        `Výchozí: ${defaultSuccessor}`,
                                      defaultSuccessor,
                                    )
                                  : defaultSuccessor;
                              if (!chosen) return;
                              transferToUserId = chosen.trim();
                            }

                            const confirmed = await confirm({
                              title: "Odebrat člena?",
                              message:
                                totalAssignments > 0
                                  ? `Převede se ${totalAssignments} přiřazení na nového vlastníka a odvolá se ${totalRevoked} integrací / zařízení. Pokračovat?`
                                  : totalRevoked > 0
                                    ? `Odvolá se ${totalRevoked} integrací / zařízení bývalého člena. Pokračovat?`
                                    : "Opravdu chcete odebrat tohoto člena z workspace? Tuto akci nelze vrátit zpět.",
                              confirmLabel: "Odebrat",
                              variant: "destructive",
                            });
                            if (!confirmed) return;

                            const res = await removeMember(m.membershipId, {
                              transferToUserId,
                            });
                            if (res.ok) {
                              const summary = res.offboarding
                                ? ` (převedeno: ${res.offboarding.reassigned.tasks} úkolů, ${res.offboarding.reassigned.events} událostí, ${res.offboarding.reassigned.opportunities} příležitostí)`
                                : "";
                              toast.showToast(`Člen byl odebrán.${summary}`);
                              setTeamMembers((prev) => prev.filter((x) => x.membershipId !== m.membershipId));
                            } else if (res.code === "REAUTH_REQUIRED") {
                              toast.showToast(res.error ?? "Je potřeba se znovu přihlásit.", "error");
                              const returnTo =
                                typeof window !== "undefined"
                                  ? window.location.pathname + window.location.search
                                  : "/portal/team-overview";
                              setTimeout(() => {
                                if (typeof window !== "undefined") {
                                  window.location.href = `/login?reauth=1&return=${encodeURIComponent(returnTo)}`;
                                }
                              }, 1200);
                            } else if (res.code === "TRANSFER_REQUIRED") {
                              toast.showToast(res.error ?? "Vyberte nástupce.", "error");
                            } else {
                              toast.showToast(res.error ?? "Odebrání se nezdařilo.", "error");
                            }
                          }}
                        >
                          Odebrat
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
