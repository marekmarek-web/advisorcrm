"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  Users,
  Briefcase,
  BarChart2,
  UserPlus,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  addHouseholdMember,
  deleteHousehold,
  getHousehold,
  removeHouseholdMember,
  updateHousehold,
  type HouseholdDetail,
} from "@/app/actions/households";
import {
  getOpportunitiesByHousehold,
  type OpportunityByHouseholdRow,
} from "@/app/actions/pipeline";
import {
  getFinancialAnalysesForHousehold,
  type FinancialAnalysisListItem,
} from "@/app/actions/financial-analyses";
import type { ContactRow } from "@/app/actions/contacts";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import {
  HeroCard,
  HeroAction,
  HeroMetaDot,
  SegmentPills,
} from "@/app/shared/portal-ui/primitives";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { HOUSEHOLD_ROLES, householdRoleLabel } from "@/lib/households/roles";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type HouseholdTab = "members" | "deals" | "analyses";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const AVATAR_PALETTE = [
  "bg-indigo-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-teal-500",
  "bg-violet-500",
];

function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function getAvatarColor(name: string) {
  const idx = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

function AnalysisProgressBar({ progress }: { progress?: number }) {
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  return (
    <div className="mt-2 h-1.5 bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
      <div
        className={cx("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-indigo-500")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function HouseholdDetailScreen({
  householdId,
  contacts,
}: {
  householdId: string;
  contacts: ContactRow[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<HouseholdDetail | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityByHouseholdRow[]>([]);
  const [analyses, setAnalyses] = useState<FinancialAnalysisListItem[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<HouseholdTab>("members");

  const [addOpen, setAddOpen] = useState(false);
  const [newMemberContactId, setNewMemberContactId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("partner");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const memberContactIds = useMemo(
    () => new Set(detail?.members.map((m) => m.contactId) ?? []),
    [detail?.members]
  );
  const availableContacts = useMemo(
    () => contacts.filter((c) => !memberContactIds.has(c.id)),
    [contacts, memberContactIds]
  );

  function reload() {
    startTransition(async () => {
      setError(null);
      try {
        const [household, opps, analysesData] = await Promise.all([
          getHousehold(householdId),
          getOpportunitiesByHousehold(householdId),
          getFinancialAnalysesForHousehold(householdId),
        ]);
        setDetail(household);
        setOpportunities(opps);
        setAnalyses(analysesData);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Nepodařilo se načíst detail domácnosti."
        );
      }
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  async function handleAddMember() {
    if (!newMemberContactId) return;
    startTransition(async () => {
      try {
        await addHouseholdMember(
          householdId,
          newMemberContactId,
          newMemberRole || undefined
        );
        setAddOpen(false);
        setNewMemberContactId("");
        setNewMemberRole("member");
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Člena se nepodařilo přidat.");
      }
    });
  }

  async function handleRemoveMember(memberId: string) {
    startTransition(async () => {
      try {
        await removeHouseholdMember(memberId);
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Člena se nepodařilo odebrat.");
      }
    });
  }

  function openEditSheet() {
    if (!detail) return;
    setEditName(detail.name);
    setEditIcon(detail.icon?.trim() ?? "");
    setEditError(null);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    const name = editName.trim();
    if (!name) {
      setEditError("Název je povinný.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      const iconVal = editIcon.trim() || null;
      await updateHousehold(householdId, name, iconVal);
      setEditOpen(false);
      reload();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Uložení se nepodařilo.");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDeleteHousehold() {
    if (
      !(await confirm({
        title: "Smazat domácnost",
        message: "Opravdu chcete smazat tuto domácnost? Tato akce je nevratná.",
        confirmLabel: "Smazat",
        variant: "destructive",
      }))
    ) {
      return;
    }
    setDeleteBusy(true);
    try {
      await deleteHousehold(householdId);
      router.push("/portal/households");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Domácnost se nepodařilo smazat.");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (pending && !detail) {
    return (
      <div className="min-h-[50vh] space-y-0">
        <div className="h-32 bg-gradient-to-br from-[#1e293b] to-[#0f172a] animate-pulse rounded-b-2xl" />
        <div className="px-4 py-3 flex gap-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 flex-1 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse max-w-[100px]" />
          ))}
        </div>
        <div className="px-4 pt-3 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState title={error} onRetry={reload} />;
  if (!detail) return <EmptyState title="Domácnost nebyla nalezena" />;

  const householdName = detail.icon ? `${detail.icon} ${detail.name}` : detail.name;

  return (
    <>
    <div
      className={cx(
        "pb-6",
        pending && detail && "opacity-60 pointer-events-none transition-opacity duration-200"
      )}
    >
      {/* Hero */}
      <div className="px-4 pt-3">
        <HeroCard
          eyebrow="Domácnost"
          title={householdName}
          icon={<Home size={20} className="text-white" />}
          actions={
            <>
              <HeroAction onClick={openEditSheet} disabled={deleteBusy} aria-label="Upravit domácnost">
                <Pencil size={12} />
                Upravit
              </HeroAction>
              <HeroAction
                tone="danger"
                onClick={handleDeleteHousehold}
                disabled={deleteBusy}
                aria-label="Smazat domácnost"
              >
                <Trash2 size={12} />
                {deleteBusy ? "Mažu…" : "Smazat"}
              </HeroAction>
            </>
          }
          meta={
            <>
              <span className="flex items-center gap-1">
                <Users size={11} /> {detail.members.length}{" "}
                {detail.members.length === 1 ? "člen" : detail.members.length < 5 ? "členové" : "členů"}
              </span>
              <HeroMetaDot />
              <span className="flex items-center gap-1">
                <Briefcase size={11} /> {opportunities.length} obchodů
              </span>
              <HeroMetaDot />
              <span className="flex items-center gap-1">
                <BarChart2 size={11} /> {analyses.length} analýz
              </span>
            </>
          }
        >
          <button
            type="button"
            onClick={() => router.push("/portal/documents")}
            className="text-[11px] font-black uppercase tracking-wide text-white/85 underline-offset-2 hover:text-white hover:underline"
          >
            Otevřít knihovnu dokumentů →
          </button>
        </HeroCard>
      </div>

      {/* Tab bar */}
      <div className="px-4 py-3 sticky top-0 z-10 bg-[color:var(--wp-bg)]/90 backdrop-blur">
        <SegmentPills
          value={tab}
          onChange={(id) => setTab(id as HouseholdTab)}
          options={[
            { id: "members", label: "Členové", badge: detail.members.length },
            { id: "deals", label: "Obchody", badge: opportunities.length },
            { id: "analyses", label: "Analýzy", badge: analyses.length },
          ]}
        />
      </div>

      {/* Members tab */}
      {tab === "members" ? (
        <MobileSection
          title={`Členové (${detail.members.length})`}
          action={
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg min-h-[32px]"
            >
              <UserPlus size={11} /> Přidat
            </button>
          }
        >
          {detail.members.length === 0 ? (
            <EmptyState title="Bez členů" description="Přidejte prvního člena domácnosti." />
          ) : (
            detail.members.map((member) => {
              const fullName = `${member.firstName} ${member.lastName}`;
              const initials = getInitials(member.firstName, member.lastName);
              const avatarColor = getAvatarColor(fullName);
              return (
                <MobileCard key={member.id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className={cx(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0",
                        avatarColor
                      )}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[color:var(--wp-text)]">{fullName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {member.role ? (
                          <span className="text-[11px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded-lg border border-[color:var(--wp-surface-card-border)]">
                            {householdRoleLabel(member.role)}
                          </span>
                        ) : null}
                        {member.email ? (
                          <span className="text-[11px] text-[color:var(--wp-text-tertiary)] truncate">{member.email}</span>
                        ) : member.phone ? (
                          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{member.phone}</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center flex-shrink-0"
                      aria-label="Odebrat člena"
                    >
                      <X size={14} className="text-rose-500" />
                    </button>
                  </div>
                </MobileCard>
              );
            })
          )}
        </MobileSection>
      ) : null}

      {/* Deals tab */}
      {tab === "deals" ? (
        <MobileSection title={`Obchodní příležitosti (${opportunities.length})`}>
          {opportunities.length === 0 ? (
            <div className="space-y-3">
              <EmptyState title="Žádné navázané obchody" description="Obchody spravujete v pipeline — můžete je navázat na členy domácnosti." />
              <button
                type="button"
                onClick={() => router.push("/portal/pipeline")}
                className="w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800"
              >
                Otevřít obchodní pipeline
              </button>
            </div>
          ) : (
            opportunities.map((opp) => (
              <MobileCard key={opp.id} className="p-3.5">
                <p className="text-sm font-bold text-[color:var(--wp-text)]">{opp.title}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {opp.stageName ? (
                    <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {opp.stageName}
                    </span>
                  ) : null}
                  <span className="text-[11px] text-[color:var(--wp-text-secondary)]">{opp.contactName}</span>
                </div>
              </MobileCard>
            ))
          )}
        </MobileSection>
      ) : null}

      {/* Analyses tab */}
      {tab === "analyses" ? (
        <MobileSection title={`Finanční analýzy (${analyses.length})`}>
          {analyses.length === 0 ? (
            <div className="space-y-3">
              <EmptyState title="Žádné analýzy" description="Finanční analýzy založíte v sekci Analýzy portálu." />
              <button
                type="button"
                onClick={() => router.push("/portal/analyses")}
                className="w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800"
              >
                Přejít na analýzy
              </button>
            </div>
          ) : (
            analyses.map((analysis) => {
              const progress = analysis.progress ?? 0;
              const isDone = analysis.status === "completed" || progress === 100;
              return (
                <MobileCard key={analysis.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                        {analysis.analysisTypeLabel || "Finanční analýza"}
                      </p>
                      {analysis.clientName ? (
                        <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">{analysis.clientName}</p>
                      ) : null}
                      <AnalysisProgressBar progress={progress} />
                    </div>
                    <StatusBadge
                      tone={
                        isDone ? "success" : analysis.status === "draft" ? "neutral" : "info"
                      }
                    >
                      {isDone ? "hotovo" : analysis.status === "draft" ? "návrh" : "probíhá"}
                    </StatusBadge>
                  </div>
                  <p className="text-[11px] text-[color:var(--wp-text-tertiary)] mt-2">
                    {new Date(analysis.createdAt).toLocaleDateString("cs-CZ")}
                    {analysis.lastExportedAt
                      ? ` · Export ${new Date(analysis.lastExportedAt).toLocaleDateString("cs-CZ")}`
                      : ""}
                  </p>
                </MobileCard>
              );
            })
          )}
        </MobileSection>
      ) : null}
    </div>

      {/* Edit household */}
      <BottomSheet
        open={editOpen}
        onClose={() => !editBusy && setEditOpen(false)}
        title="Upravit domácnost"
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Ikona (emoji, volitelné)
            </label>
            <input
              type="text"
              value={editIcon}
              onChange={(e) => setEditIcon(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
              placeholder="🏠"
              maxLength={8}
              disabled={editBusy}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Název
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
              disabled={editBusy}
            />
          </div>
          {editError ? <p className="text-sm text-rose-600 font-semibold">{editError}</p> : null}
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={editBusy || !editName.trim()}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {editBusy ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </BottomSheet>

      {/* Add member sheet */}
      <BottomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Přidat člena domácnosti"
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Kontakt
            </label>
            <CustomDropdown
              value={newMemberContactId}
              onChange={setNewMemberContactId}
              placeholder="Vyberte kontakt"
              options={[
                { id: "", label: "Vyberte kontakt" },
                ...availableContacts.map((contact) => ({
                  id: contact.id,
                  label: `${contact.firstName} ${contact.lastName}`,
                })),
              ]}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Rodinná role
            </label>
            <CustomDropdown
              value={newMemberRole}
              onChange={setNewMemberRole}
              placeholder="Vyberte roli"
              options={HOUSEHOLD_ROLES.map((r) => ({ id: r.value, label: r.label }))}
            />
          </div>
          <button
            type="button"
            onClick={handleAddMember}
            disabled={!newMemberContactId}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            Přidat člena
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
