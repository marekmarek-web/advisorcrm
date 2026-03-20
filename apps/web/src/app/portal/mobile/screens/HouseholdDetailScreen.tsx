"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addHouseholdMember,
  getHousehold,
  removeHouseholdMember,
  type HouseholdDetail,
} from "@/app/actions/households";
import { getOpportunitiesByHousehold, type OpportunityByHouseholdRow } from "@/app/actions/pipeline";
import { getFinancialAnalysesForHousehold, type FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import type { ContactRow } from "@/app/actions/contacts";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  HouseholdMemberCard,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

export function HouseholdDetailScreen({
  householdId,
  contacts,
}: {
  householdId: string;
  contacts: ContactRow[];
}) {
  const [detail, setDetail] = useState<HouseholdDetail | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityByHouseholdRow[]>([]);
  const [analyses, setAnalyses] = useState<FinancialAnalysisListItem[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newMemberContactId, setNewMemberContactId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");

  const memberContactIds = useMemo(() => new Set(detail?.members.map((m) => m.contactId) ?? []), [detail?.members]);
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
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst detail domácnosti.");
      }
    });
  }

  useEffect(() => {
    reload();
  }, [householdId]);

  async function handleAddMember() {
    if (!newMemberContactId) return;
    startTransition(async () => {
      try {
        await addHouseholdMember(householdId, newMemberContactId, newMemberRole || undefined);
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

  if (pending && !detail) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorState title={error} onRetry={reload} />;
  if (!detail) return <EmptyState title="Domácnost nebyla nalezena" />;

  return (
    <>
      <MobileCard>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Domácnost</p>
        <p className="text-lg font-black mt-1">{detail.name}</p>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge tone="info">{detail.members.length} členů</StatusBadge>
          <StatusBadge>{opportunities.length} obchodů</StatusBadge>
          <StatusBadge>{analyses.length} analýz</StatusBadge>
        </div>
      </MobileCard>

      <MobileSection
        title="Členové"
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="min-h-[32px] px-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold"
          >
            Přidat
          </button>
        }
      >
        {detail.members.length === 0 ? (
          <EmptyState title="Bez členů domácnosti" />
        ) : (
          detail.members.map((member) => (
            <HouseholdMemberCard
              key={member.id}
              name={`${member.firstName} ${member.lastName}`}
              role={member.role}
              subtitle={member.email || member.phone || ""}
              action={
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member.id)}
                  className="text-xs text-rose-700 font-bold min-h-[32px]"
                >
                  Odebrat
                </button>
              }
            />
          ))
        )}
      </MobileSection>

      <MobileSection title="Navázané obchody">
        {opportunities.length === 0 ? (
          <EmptyState title="Žádné navázané obchody" />
        ) : (
          opportunities.slice(0, 4).map((opportunity) => (
            <MobileCard key={opportunity.id} className="p-3.5">
              <p className="text-sm font-bold">{opportunity.title}</p>
              <p className="text-xs text-slate-500 mt-1">
                {opportunity.stageName || "Bez fáze"} • {opportunity.contactName}
              </p>
            </MobileCard>
          ))
        )}
      </MobileSection>

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Přidat člena domácnosti">
        <div className="space-y-3">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Kontakt</label>
          <select
            value={newMemberContactId}
            onChange={(e) => setNewMemberContactId(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">Vyberte kontakt</option>
            {availableContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.firstName} {contact.lastName}
              </option>
            ))}
          </select>

          <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Role</label>
          <input
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="Např. partner, dítě, parent"
          />

          <button
            type="button"
            onClick={handleAddMember}
            className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold"
          >
            Přidat člena
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
