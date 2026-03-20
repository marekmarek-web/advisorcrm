"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, Phone } from "lucide-react";
import { getContact, type ContactRow } from "@/app/actions/contacts";
import { getHouseholdForContact, type HouseholdForContact } from "@/app/actions/households";
import { getTasksByContactId, type TaskRow } from "@/app/actions/tasks";
import { getPipelineByContact, type StageWithOpportunities } from "@/app/actions/pipeline";
import { getDocumentsForContact, type DocumentRow } from "@/app/actions/documents";
import {
  ClientSummaryCard,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

type ContactDetail = ContactRow & {
  referralContactName?: string | null;
};

export function ClientProfileScreen({
  contactId,
  onOpenTaskWizard,
  onOpenOpportunityWizard,
  onOpenHousehold,
}: {
  contactId: string;
  onOpenTaskWizard: (contactId: string) => void;
  onOpenOpportunityWizard: (contactId: string) => void;
  onOpenHousehold: (householdId: string) => void;
}) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [household, setHousehold] = useState<HouseholdForContact | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [pipeline, setPipeline] = useState<StageWithOpportunities[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        const [contactData, householdData, taskData, pipelineData, documentsData] = await Promise.all([
          getContact(contactId),
          getHouseholdForContact(contactId),
          getTasksByContactId(contactId),
          getPipelineByContact(contactId),
          getDocumentsForContact(contactId),
        ]);
        setContact(contactData as ContactDetail | null);
        setHousehold(householdData);
        setTasks(taskData);
        setPipeline(pipelineData);
        setDocuments(documentsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst klientský profil.");
      }
    });
  }, [contactId]);

  const totalOpportunities = pipeline.reduce((sum, stage) => sum + stage.opportunities.length, 0);

  if (pending && !contact) return <LoadingSkeleton rows={4} />;
  if (error) return <ErrorState title={error} />;
  if (!contact) return <EmptyState title="Klient nebyl nalezen" />;

  return (
    <>
      <ClientSummaryCard
        name={`${contact.firstName} ${contact.lastName}`}
        email={contact.email}
        phone={contact.phone}
        tags={contact.tags}
        actions={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenTaskWizard(contact.id)}
              className="min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold"
            >
              Nový úkol
            </button>
            <button
              type="button"
              onClick={() => onOpenOpportunityWizard(contact.id)}
              className="min-h-[44px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold"
            >
              Nový obchod
            </button>
          </div>
        }
      />

      <MobileSection title="Rychlé akce">
        <div className="grid grid-cols-2 gap-2">
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Phone size={14} /> Zavolat
            </a>
          ) : null}
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Mail size={14} /> E-mail
            </a>
          ) : null}
        </div>
      </MobileSection>

      <MobileSection title="Vazby CRM">
        <div className="grid grid-cols-2 gap-2">
          <MobileCard className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Úkoly</p>
            <p className="text-xl font-black mt-1">{tasks.length}</p>
          </MobileCard>
          <MobileCard className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Případy</p>
            <p className="text-xl font-black mt-1">{totalOpportunities}</p>
          </MobileCard>
          <MobileCard className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Dokumenty</p>
            <p className="text-xl font-black mt-1">{documents.length}</p>
          </MobileCard>
          <MobileCard className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Domácnost</p>
            {household ? (
              <button
                type="button"
                onClick={() => onOpenHousehold(household.id)}
                className="mt-1 text-sm font-bold text-indigo-700 text-left"
              >
                {household.name}
              </button>
            ) : (
              <p className="text-sm font-semibold mt-1">Bez domácnosti</p>
            )}
          </MobileCard>
        </div>
      </MobileSection>

      <MobileSection title="Poslední úkoly">
        {tasks.length === 0 ? (
          <EmptyState title="Žádné úkoly" description="Klient zatím nemá navázané úkoly." />
        ) : (
          tasks.slice(0, 3).map((task) => (
            <MobileCard key={task.id} className="p-3.5">
              <p className="text-sm font-bold">{task.title}</p>
              <div className="mt-2">
                <StatusBadge tone={task.completedAt ? "success" : "info"}>
                  {task.completedAt ? "completed" : "pending"}
                </StatusBadge>
              </div>
            </MobileCard>
          ))
        )}
      </MobileSection>
    </>
  );
}
