"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  CheckSquare,
  Briefcase,
  FileText,
  Home,
  Tag,
  CheckCheck,
  ExternalLink,
} from "lucide-react";
import { getContact, type ContactRow } from "@/app/actions/contacts";
import { getHouseholdForContact, type HouseholdForContact } from "@/app/actions/households";
import { getTasksByContactId, completeTask, reopenTask, type TaskRow } from "@/app/actions/tasks";
import { getPipelineByContact, type StageWithOpportunities } from "@/app/actions/pipeline";
import { getDocumentsForContact, type DocumentRow } from "@/app/actions/documents";
import {
  EmptyState,
  ErrorState,
  FilterChips,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ContactDetail = ContactRow & { referralContactName?: string | null };
type ProfileTab = "overview" | "tasks" | "pipeline" | "documents";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

const AVATAR_PALETTE = [
  "bg-indigo-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-teal-500",
];

function getAvatarColor(name: string): string {
  const idx = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

const SEGMENT_CONFIG: Record<string, { label: string; cls: string }> = {
  lead: { label: "Lead", cls: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]" },
  prospect: { label: "Prospect", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  client: { label: "Klient", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  vip: { label: "VIP", cls: "bg-violet-50 text-violet-700 border border-violet-200" },
  former_client: { label: "Bývalý klient", cls: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]" },
};

function SegmentBadge({ stage }: { stage?: string | null }) {
  if (!stage) return null;
  const cfg = SEGMENT_CONFIG[stage] ?? { label: stage, cls: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]" };
  return (
    <span className={cx("text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/*  Tab: Přehled                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({
  contact,
  tasks,
  pipeline,
  documents,
  household,
  onOpenHousehold,
}: {
  contact: ContactDetail;
  tasks: TaskRow[];
  pipeline: StageWithOpportunities[];
  documents: DocumentRow[];
  household: HouseholdForContact | null;
  onOpenHousehold: (id: string) => void;
}) {
  const totalOpportunities = pipeline.reduce((sum, s) => sum + s.opportunities.length, 0);

  const metaRows: Array<{ icon: React.ElementType; label: string; value: string }> = [
    ...(contact.birthDate ? [{ icon: Calendar, label: "Datum narození", value: formatDate(contact.birthDate)! }] : []),
    ...(contact.city ? [{ icon: MapPin, label: "Město", value: `${contact.city}${contact.zip ? ` ${contact.zip}` : ""}` }] : []),
    ...(contact.leadSource ? [{ icon: Tag, label: "Zdroj", value: contact.leadSource }] : []),
    ...(contact.referralContactName ? [{ icon: User, label: "Doporučil/a", value: contact.referralContactName }] : []),
    ...(contact.gdprConsentAt ? [{ icon: CheckCheck, label: "GDPR souhlas", value: formatDate(contact.gdprConsentAt.toISOString())! }] : []),
    ...(contact.nextServiceDue ? [{ icon: Calendar, label: "Příští servis", value: formatDate(contact.nextServiceDue)! }] : []),
  ];

  return (
    <div className="space-y-0">
      {/* Stats */}
      <MobileSection title="CRM přehled">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: CheckSquare, label: "Úkoly", value: tasks.length },
            { icon: Briefcase, label: "Příležitosti", value: totalOpportunities },
            { icon: FileText, label: "Dokumenty", value: documents.length },
          ].map(({ icon: Icon, label, value }) => (
            <MobileCard key={label} className="p-3 text-center">
              <Icon size={16} className="text-indigo-500 mx-auto" />
              <p className="text-xl font-black mt-1 text-[color:var(--wp-text)]">{value}</p>
              <p className="text-[10px] uppercase tracking-wider text-[color:var(--wp-text-secondary)] font-bold">{label}</p>
            </MobileCard>
          ))}
        </div>
      </MobileSection>

      {/* Meta info */}
      {metaRows.length > 0 ? (
        <MobileSection title="Informace">
          <MobileCard className="divide-y divide-[color:var(--wp-surface-card-border)] py-1 px-3">
            {metaRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 py-2.5">
                <Icon size={15} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0" />
                <span className="text-xs text-[color:var(--wp-text-secondary)] flex-shrink-0 w-28">{label}</span>
                <span className="text-sm font-semibold text-[color:var(--wp-text)] truncate">{value}</span>
              </div>
            ))}
          </MobileCard>
        </MobileSection>
      ) : null}

      {/* Tags */}
      {(contact.tags ?? []).length > 0 ? (
        <MobileSection title="Štítky">
          <div className="flex flex-wrap gap-1.5">
            {(contact.tags ?? []).map((tag) => (
              <span key={tag} className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                {tag}
              </span>
            ))}
          </div>
        </MobileSection>
      ) : null}

      {/* Household */}
      <MobileSection title="Domácnost">
        {household ? (
          <MobileCard className="p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Home size={15} className="text-[color:var(--wp-text-tertiary)]" />
                <p className="text-sm font-bold text-[color:var(--wp-text)]">{household.name}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenHousehold(household.id)}
                className="flex items-center gap-1 text-xs font-bold text-indigo-600 min-h-[32px] px-2"
              >
                Otevřít <ExternalLink size={11} />
              </button>
            </div>
          </MobileCard>
        ) : (
          <EmptyState title="Bez domácnosti" description="Klient není zařazen do domácnosti." />
        )}
      </MobileSection>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Úkoly                                                         */
/* ------------------------------------------------------------------ */

function TasksTab({
  tasks,
  onNewTask,
}: {
  tasks: TaskRow[];
  onNewTask: () => void;
}) {
  const [localTasks, setLocalTasks] = useState<TaskRow[]>(tasks);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  function toggle(task: TaskRow) {
    startTransition(async () => {
      try {
        if (task.completedAt) await reopenTask(task.id);
        else await completeTask(task.id);
        setLocalTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, completedAt: task.completedAt ? null : new Date() }
              : t
          )
        );
      } catch {
        // noop
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <MobileSection
      title={`Úkoly (${localTasks.length})`}
      action={
        <button
          type="button"
          onClick={onNewTask}
          className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg min-h-[32px]"
        >
          Nový
        </button>
      }
    >
      {localTasks.length === 0 ? (
        <EmptyState title="Žádné úkoly" description="Klient nemá navázané úkoly." />
      ) : (
        localTasks.map((task) => {
          const isOverdue = !task.completedAt && task.dueDate && task.dueDate < today;
          return (
            <MobileCard key={task.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(task)}
                  className={cx(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                    task.completedAt
                      ? "border-emerald-500 bg-emerald-500"
                      : isOverdue
                        ? "border-rose-400"
                        : "border-[color:var(--wp-border-strong)]"
                  )}
                >
                  {task.completedAt ? <CheckCheck size={12} className="text-white" /> : null}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cx("text-sm font-bold", task.completedAt ? "line-through text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text)]")}>
                    {task.title}
                  </p>
                  {task.dueDate ? (
                    <p className={cx("text-xs mt-0.5 font-semibold", isOverdue ? "text-rose-500" : "text-[color:var(--wp-text-secondary)]")}>
                      {isOverdue ? "Prošlé · " : ""}{task.dueDate}
                    </p>
                  ) : null}
                </div>
                <StatusBadge tone={task.completedAt ? "success" : isOverdue ? "danger" : "info"}>
                  {task.completedAt ? "hotovo" : isOverdue ? "po termínu" : "aktivní"}
                </StatusBadge>
              </div>
            </MobileCard>
          );
        })
      )}
    </MobileSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Pipeline                                                      */
/* ------------------------------------------------------------------ */

function PipelineTab({ pipeline }: { pipeline: StageWithOpportunities[] }) {
  const allOpps = pipeline.flatMap((s) => s.opportunities.map((o) => ({ ...o, stageName: s.name })));

  if (allOpps.length === 0) {
    return (
      <MobileSection title="Obchodní příležitosti">
        <EmptyState title="Žádné příležitosti" description="Klient nemá navázané příležitosti." />
      </MobileSection>
    );
  }

  return (
    <>
      {pipeline.filter((s) => s.opportunities.length > 0).map((stage) => (
        <MobileSection key={stage.id} title={`${stage.name} (${stage.opportunities.length})`}>
          {stage.opportunities.map((opp) => {
            const isOverdue =
              opp.expectedCloseDate && opp.expectedCloseDate < new Date().toISOString().slice(0, 10);
            return (
              <MobileCard key={opp.id} className="p-3.5">
                <p className="text-sm font-bold text-[color:var(--wp-text)]">{opp.title}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded">
                    {opp.caseType}
                  </span>
                  {opp.expectedValue ? (
                    <span className="text-[11px] font-black text-emerald-700">
                      {Number(opp.expectedValue).toLocaleString("cs-CZ")} Kč
                    </span>
                  ) : null}
                  {opp.expectedCloseDate ? (
                    <span className={cx("text-[11px] font-bold", isOverdue ? "text-rose-500" : "text-[color:var(--wp-text-tertiary)]")}>
                      {opp.expectedCloseDate}
                    </span>
                  ) : null}
                </div>
              </MobileCard>
            );
          })}
        </MobileSection>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Dokumenty                                                     */
/* ------------------------------------------------------------------ */

function DocumentsTab({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <MobileSection title="Dokumenty">
        <EmptyState title="Žádné dokumenty" description="Klient nemá nahrané dokumenty." />
      </MobileSection>
    );
  }

  function getDocIcon(mime?: string | null): string {
    if (!mime) return "📄";
    if (mime.includes("pdf")) return "📑";
    if (mime.includes("image")) return "🖼";
    if (mime.includes("word") || mime.includes("doc")) return "📝";
    if (mime.includes("excel") || mime.includes("sheet")) return "📊";
    return "📄";
  }

  return (
    <MobileSection title={`Dokumenty (${documents.length})`}>
      {documents.map((doc) => (
        <MobileCard key={doc.id} className="p-3.5">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">{getDocIcon(doc.mimeType)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{doc.name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {doc.processingStatus ? (
                  <StatusBadge
                    tone={
                      doc.processingStatus === "done"
                        ? "success"
                        : doc.processingStatus === "failed"
                          ? "danger"
                          : "info"
                    }
                  >
                    {doc.processingStatus}
                  </StatusBadge>
                ) : null}
                <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">
                  {new Date(doc.createdAt).toLocaleDateString("cs-CZ")}
                </span>
              </div>
            </div>
          </div>
        </MobileCard>
      ))}
    </MobileSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

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
  const [tab, setTab] = useState<ProfileTab>("overview");

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      const results = await Promise.allSettled([
        getContact(contactId),
        getHouseholdForContact(contactId),
        getTasksByContactId(contactId),
        getPipelineByContact(contactId),
        getDocumentsForContact(contactId),
      ]);

      const contactRes = results[0];
      if (contactRes.status === "rejected") {
        setError(
          contactRes.reason instanceof Error
            ? contactRes.reason.message
            : "Nepodařilo se načíst klientský profil."
        );
        return;
      }

      const contactData = contactRes.value as ContactDetail | null;
      setContact(contactData);

      if (results[1].status === "fulfilled") setHousehold(results[1].value);
      else setHousehold(null);

      if (results[2].status === "fulfilled") setTasks(results[2].value);
      else setTasks([]);

      if (results[3].status === "fulfilled") setPipeline(results[3].value);
      else setPipeline([]);

      if (results[4].status === "fulfilled") setDocuments(results[4].value);
      else setDocuments([]);
    });
  }, [contactId]);

  if (pending && !contact) {
    return (
      <div className="min-h-[50vh] space-y-0">
        <div className="h-36 animate-pulse rounded-b-2xl bg-gradient-to-br from-[#1e293b] to-indigo-900" />
        <div className="px-4 py-3 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-10 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
        <div className="px-4 flex gap-2 mb-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 flex-1 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
        <div className="px-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState title={error} />;
  if (!contact) return <EmptyState title="Klient nebyl nalezen" />;

  const fullName = `${contact.firstName} ${contact.lastName}`;
  const initials = getInitials(contact.firstName, contact.lastName);
  const avatarColor = getAvatarColor(fullName);

  const totalOpportunities = pipeline.reduce((sum, s) => sum + s.opportunities.length, 0);

  return (
    <div className="space-y-0 pb-4">
      {/* Hero card */}
      <div className="bg-gradient-to-br from-[#0a0f29] to-indigo-900 p-4 pb-5 mx-0">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          {contact.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contact.avatarUrl}
              alt={fullName}
              className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 border-2 border-white/20"
            />
          ) : (
            <div className={cx("w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-black flex-shrink-0", avatarColor)}>
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-white truncate">{fullName}</h2>
            {contact.title ? (
              <p className="text-xs text-indigo-200 mt-0.5">{contact.title}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <SegmentBadge stage={contact.lifecycleStage} />
              {contact.priority ? (
                <span className={cx(
                  "text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg",
                  contact.priority === "high"
                    ? "bg-rose-500/20 text-rose-300"
                    : contact.priority === "medium"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-[color:var(--wp-surface-card)]/10 text-white/60"
                )}>
                  {contact.priority === "high" ? "Vysoká priorita" : contact.priority === "medium" ? "Střední priorita" : contact.priority}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Quick action bar */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className="min-h-[44px] rounded-xl bg-[color:var(--wp-surface-card)]/10 border border-white/20 text-white text-xs font-bold flex flex-col items-center justify-center gap-1"
            >
              <Phone size={16} />
              <span>Volat</span>
            </a>
          ) : null}
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="min-h-[44px] rounded-xl bg-[color:var(--wp-surface-card)]/10 border border-white/20 text-white text-xs font-bold flex flex-col items-center justify-center gap-1"
            >
              <Mail size={16} />
              <span>E-mail</span>
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenTaskWizard(contact.id)}
            className="min-h-[44px] rounded-xl bg-indigo-500/80 border border-indigo-400/40 text-white text-xs font-bold flex flex-col items-center justify-center gap-1"
          >
            <CheckSquare size={16} />
            <span>Úkol</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenOpportunityWizard(contact.id)}
            className="min-h-[44px] rounded-xl bg-[color:var(--wp-surface-card)]/10 border border-white/20 text-white text-xs font-bold flex flex-col items-center justify-center gap-1"
          >
            <Briefcase size={16} />
            <span>Obchod</span>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 py-2 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)] sticky top-0 z-10">
        <FilterChips
          value={tab}
          onChange={(id) => setTab(id as ProfileTab)}
          options={[
            { id: "overview", label: "Přehled" },
            { id: "tasks", label: "Úkoly", badge: tasks.filter((t) => !t.completedAt).length },
            { id: "pipeline", label: "Obchody", badge: totalOpportunities },
            { id: "documents", label: "Dokumenty", badge: documents.length },
          ]}
        />
      </div>

      {/* Tab content */}
      <div className="mt-1">
        {tab === "overview" ? (
          <OverviewTab
            contact={contact}
            tasks={tasks}
            pipeline={pipeline}
            documents={documents}
            household={household}
            onOpenHousehold={onOpenHousehold}
          />
        ) : null}
        {tab === "tasks" ? (
          <TasksTab
            tasks={tasks}
            onNewTask={() => onOpenTaskWizard(contact.id)}
          />
        ) : null}
        {tab === "pipeline" ? <PipelineTab pipeline={pipeline} /> : null}
        {tab === "documents" ? <DocumentsTab documents={documents} /> : null}
      </div>
    </div>
  );
}
