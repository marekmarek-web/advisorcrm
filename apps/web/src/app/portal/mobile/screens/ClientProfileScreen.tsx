"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Sparkles,
  Clock,
  Pencil,
  CreditCard,
  Hash,
} from "lucide-react";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import {
  getContact,
  getContactAiProvenance,
  confirmContactPendingFieldAction,
  type ContactRow,
  type ContactAiProvenanceResult,
} from "@/app/actions/contacts";
import { AiReviewProvenanceBadge } from "@/app/components/aidvisora/AiReviewProvenanceBadge";
import { ContactMergeConflictGuard } from "@/app/portal/contacts/[id]/ContactMergeConflictGuard";
import {
  resolveContactIdentityFieldProvenanceForContactRow,
  resolveContactIdentityFieldProvenanceForHeader,
  shouldShowContactIdentityRow,
} from "@/lib/portal/contact-identity-field-provenance";
import { MobileContactContractsStrip } from "./MobileContactContractsStrip";
import { getHouseholdForContact, type HouseholdForContact } from "@/app/actions/households";
import { getTasksByContactId, completeTask, reopenTask, type TaskRow } from "@/app/actions/tasks";
import { getPipelineByContact, type StageWithOpportunities } from "@/app/actions/pipeline";
import { getDocumentsForContact, type DocumentRow } from "@/app/actions/documents";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  MobileCard,
  MobileSection,
  StatusBadge,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const CONTACT_FIELD_LABELS: Record<string, string> = {
  firstName: "Jméno",
  lastName: "Příjmení",
  fullName: "Jméno a příjmení",
  email: "E-mail",
  phone: "Telefon",
  birthDate: "Datum narození",
  personalId: "Rodné číslo",
  idCardNumber: "Číslo občanského průkazu",
  address: "Adresa",
  permanentAddress: "Trvalé bydliště",
  city: "Město",
  zip: "PSČ",
  street: "Ulice",
  occupation: "Povolání",
};

function contactFieldLabel(key: string): string {
  return CONTACT_FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
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
/*  AI Provenance section                                              */
/* ------------------------------------------------------------------ */

function AiProvenanceMobileSection({
  provenance,
  onConfirm,
  onConfirmAll,
}: {
  provenance: ContactAiProvenanceResult;
  onConfirm: (fieldKey: string) => void;
  onConfirmAll: (fieldKeys: string[]) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!provenance) return null;

  const hasPending = provenance.pendingFields.length > 0;
  const hasManual = provenance.manualRequiredFields.length > 0;
  const hasAutoApplied = provenance.autoAppliedFields.length > 0;

  if (!hasPending && !hasManual && !hasAutoApplied) return null;

  return (
    <MobileSection title="AI Review — stav polí">
      <MobileCard className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={14} className="shrink-0 text-indigo-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
            Převzato z AI Review
          </p>
        </div>

        {hasPending ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <Clock size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-amber-900">
                  {provenance.pendingFields.length} pol{provenance.pendingFields.length === 1 ? "e" : provenance.pendingFields.length < 5 ? "e" : "í"} čeká na potvrzení
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-amber-800/90">
                  Zkontrolujte a potvrďte hromadně nebo jednotlivě.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-white shadow-sm active:bg-amber-600"
            >
              Zkontrolovat a potvrdit
            </button>
          </div>
        ) : null}

        {hasAutoApplied ? (
          <div className="mb-3">
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-emerald-700">
              <CheckCheck size={10} /> Automaticky převzato
            </p>
            <div className="flex flex-wrap gap-1">
              {provenance.autoAppliedFields.map((f) => (
                <span key={f} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  {contactFieldLabel(f)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {hasManual ? (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold text-rose-700">
              <Pencil size={10} /> Vyžaduje ruční doplnění
            </p>
            <div className="flex flex-wrap gap-1">
              {provenance.manualRequiredFields.map((f) => (
                <span key={f} className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                  {contactFieldLabel(f)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </MobileCard>

      {sheetOpen ? (
        <BottomSheet
          open
          title="Potvrzení polí z AI Review"
          onClose={() => setSheetOpen(false)}
          reserveMobileBottomNav
        >
          <p className="mb-3 text-sm font-semibold text-[color:var(--wp-text-secondary)]">
            Zkontrolujte hodnoty převzaté z AI Review a potvrďte je hromadně, nebo jednotlivě.
          </p>
          <div className="space-y-2">
            {provenance.pendingFields.map((fieldKey) => (
              <div
                key={fieldKey}
                className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[color:var(--wp-text)]">
                  {contactFieldLabel(fieldKey)}
                </span>
                <button
                  type="button"
                  onClick={() => onConfirm(fieldKey)}
                  className="min-h-[36px] shrink-0 rounded-lg bg-amber-500 px-3 text-[11px] font-black uppercase tracking-wide text-white active:bg-amber-600"
                >
                  Potvrdit
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onConfirmAll(provenance.pendingFields);
              setSheetOpen(false);
            }}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-white shadow-sm active:bg-amber-600"
          >
            Potvrdit vše ({provenance.pendingFields.length})
          </button>
        </BottomSheet>
      ) : null}
    </MobileSection>
  );
}

/** F8: Parita s ContactDetailIdentityTab — chybějící hodnota + pending_review / manual badge. */
function ContactIdentityMobileSection({
  contact,
  provenance,
  contactId,
}: {
  contact: ContactDetail;
  provenance: ContactAiProvenanceResult | null;
  contactId: string;
}) {
  const addressLine = [contact.street, [contact.city, contact.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const rows: { key: string; label: string; icon: typeof User; value: string | null }[] = [
    { key: "title", label: "Titul", icon: User, value: contact.title?.trim() || null },
    {
      key: "birthDate",
      label: "Datum narození",
      icon: Calendar,
      value: contact.birthDate ? formatDisplayDateCs(contact.birthDate) || contact.birthDate : null,
    },
    { key: "personalId", label: "Rodné číslo", icon: Hash, value: contact.personalId?.trim() || null },
    { key: "idCardNumber", label: "Číslo občanského průkazu", icon: CreditCard, value: contact.idCardNumber?.trim() || null },
    { key: "address", label: "Adresa", icon: MapPin, value: addressLine || null },
  ];
  const visible = rows.filter(({ key, value }) => shouldShowContactIdentityRow(key, Boolean(value), provenance));
  if (visible.length === 0) return null;

  return (
    <MobileSection title="Identita a doklady">
      <MobileCard className="p-0 overflow-hidden">
        <div className="divide-y divide-[color:var(--wp-surface-card-border)]">
          {visible.map(({ key, label, icon: Icon, value }) => {
            const p = resolveContactIdentityFieldProvenanceForContactRow(key, provenance, contact);
            return (
              <div key={key} className="px-3.5 py-3 min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                  <Icon size={14} className="shrink-0 opacity-70" aria-hidden />
                  {label}
                </div>
                <div className="mt-1.5 pl-0 min-w-0 flex flex-col gap-1.5">
                  {value ? (
                    <span className="text-sm font-bold text-[color:var(--wp-text)] break-words">{value}</span>
                  ) : (
                    <span className="text-sm text-[color:var(--wp-text-tertiary)] italic">—</span>
                  )}
                  {p ? (
                    <span className="inline-flex min-w-0 max-w-full">
                      <AiReviewProvenanceBadge
                        kind={p.kind}
                        reviewId={p.reviewId}
                        confirmedAt={p.confirmedAt}
                        className="flex-wrap max-w-full text-[11px] leading-snug [&_a]:break-words"
                      />
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </MobileCard>
      <Link
        href={`/portal/contacts/${contactId}/edit`}
        className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800"
      >
        Upravit údaje
      </Link>
    </MobileSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Přehled                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({
  contactId,
  contact,
  tasks,
  pipeline,
  documents,
  household,
  provenance,
  onOpenHousehold,
  onConfirmProvenance,
  onConfirmAllProvenance,
}: {
  contactId: string;
  contact: ContactDetail;
  tasks: TaskRow[];
  pipeline: StageWithOpportunities[];
  documents: DocumentRow[];
  household: HouseholdForContact | null;
  provenance: ContactAiProvenanceResult | null;
  onOpenHousehold: (id: string) => void;
  onConfirmProvenance: (fieldKey: string) => void;
  onConfirmAllProvenance: (fieldKeys: string[]) => void;
}) {
  const totalOpportunities = pipeline.reduce((sum, s) => sum + s.opportunities.length, 0);

  /** CRM doplněk — identitu včetně provenance bere sekce „Identita a doklady“ (F8). */
  const metaRows: Array<{ icon: React.ElementType; label: string; value: string }> = [
    ...(contact.leadSource ? [{ icon: Tag, label: "Zdroj", value: contact.leadSource }] : []),
    ...(contact.referralContactName ? [{ icon: User, label: "Doporučil/a", value: contact.referralContactName }] : []),
    ...(contact.gdprConsentAt
      ? [{ icon: CheckCheck, label: "GDPR souhlas", value: formatDate(contact.gdprConsentAt)! }]
      : []),
    ...(contact.nextServiceDue ? [{ icon: Calendar, label: "Příští servis", value: formatDate(contact.nextServiceDue)! }] : []),
  ];

  return (
    <div className="space-y-0 px-3 pt-3 pb-4">
      {/* Shrnutí — stats + meta + household + tags rolled into one card */}
      <MobileCard className="p-0 overflow-hidden mb-3">
        <div className="grid grid-cols-3 divide-x divide-[color:var(--wp-surface-card-border)]">
          {[
            { icon: CheckSquare, label: "Úkoly", value: tasks.length },
            { icon: Briefcase, label: "Obchody", value: totalOpportunities },
            { icon: FileText, label: "Dokumenty", value: documents.length },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex flex-col items-center justify-center px-2 py-3 text-center">
              <Icon size={15} className="text-indigo-500" />
              <p className="mt-1 text-lg font-black leading-none text-[color:var(--wp-text)]">{value}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">{label}</p>
            </div>
          ))}
        </div>

        {(metaRows.length > 0 || household || (contact.tags ?? []).length > 0) ? (
          <div className="border-t border-[color:var(--wp-surface-card-border)]">
            {household ? (
              <button
                type="button"
                onClick={() => onOpenHousehold(household.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--wp-surface-card-border)] text-left transition-colors hover:bg-[color:var(--wp-surface-muted)]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Home size={14} className="flex-shrink-0 text-[color:var(--wp-text-tertiary)]" />
                  <span className="truncate text-sm font-bold text-[color:var(--wp-text)]">{household.name}</span>
                </div>
                <span className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                  Otevřít <ExternalLink size={11} />
                </span>
              </button>
            ) : null}
            {metaRows.length > 0 ? (
              <div className="divide-y divide-[color:var(--wp-surface-card-border)]">
                {metaRows.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon size={14} className="flex-shrink-0 text-[color:var(--wp-text-tertiary)]" />
                    <span className="w-24 flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">{label}</span>
                    <span className="flex-1 truncate text-sm font-semibold text-[color:var(--wp-text)]">{value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {(contact.tags ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--wp-surface-card-border)] px-4 py-3">
                {(contact.tags ?? []).map((tag) => (
                  <span key={tag} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </MobileCard>

      <ContactIdentityMobileSection contact={contact} provenance={provenance} contactId={contactId} />

      <MobileContactContractsStrip contactId={contactId} />

      {/* AI Provenance — moved to bottom to reduce noise on overview */}
      {provenance ? (
        <AiProvenanceMobileSection
          provenance={provenance}
          onConfirm={onConfirmProvenance}
          onConfirmAll={onConfirmAllProvenance}
        />
      ) : null}
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
                      {isOverdue ? "Prošlé · " : ""}
                      {formatDisplayDateCs(task.dueDate) || task.dueDate}
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
  const router = useRouter();
  if (documents.length === 0) {
    return (
      <MobileSection title="Dokumenty">
        <EmptyState
          title="Žádné dokumenty"
          description="Nahrajte soubor v knihovně dokumentů a přiřaďte ho klientovi, nebo otevřete knihovnu."
        />
        <button
          type="button"
          onClick={() => router.push("/portal/documents")}
          className="mt-3 w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800"
        >
          Otevřít knihovnu dokumentů
        </button>
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
          <button
            type="button"
            className="flex w-full items-start gap-3 text-left"
            onClick={() => router.push(`/portal/documents?doc=${encodeURIComponent(doc.id)}`)}
          >
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
          </button>
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
  const [provenance, setProvenance] = useState<ContactAiProvenanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<ProfileTab>("overview");
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      const results = await Promise.allSettled([
        getContact(contactId),
        getHouseholdForContact(contactId),
        getTasksByContactId(contactId),
        getPipelineByContact(contactId),
        getDocumentsForContact(contactId),
        getContactAiProvenance(contactId),
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

      if (results[5].status === "fulfilled") setProvenance(results[5].value as ContactAiProvenanceResult | null);
      else setProvenance(null);
    });
  }, [contactId]);

  async function handleConfirmProvenance(fieldKey: string) {
    if (!provenance) return;
    startTransition(async () => {
      const result = await confirmContactPendingFieldAction(provenance.reviewId, fieldKey);
      if (!result.ok) {
        showToast(result.error, "error");
      } else {
        showToast(`Pole "${contactFieldLabel(fieldKey)}" potvrzeno z AI Review.`, "success");
        const [updated, refreshedContact] = await Promise.all([
          getContactAiProvenance(contactId),
          getContact(contactId),
        ]);
        setProvenance(updated);
        if (refreshedContact) setContact(refreshedContact as ContactDetail);
      }
    });
  }

  async function handleConfirmAllProvenance(fieldKeys: string[]) {
    if (!provenance || fieldKeys.length === 0) return;
    startTransition(async () => {
      const results = await Promise.all(
        fieldKeys.map((fk) => confirmContactPendingFieldAction(provenance.reviewId, fk))
      );
      const errors = results.filter((r) => !r.ok);
      if (errors.length === 0) {
        showToast(`Potvrzeno ${fieldKeys.length} polí z AI Review.`, "success");
      } else {
        showToast(`Některá pole se nepodařilo potvrdit (${errors.length}).`, "error");
      }
      const [updated, refreshedContact] = await Promise.all([
        getContactAiProvenance(contactId),
        getContact(contactId),
      ]);
      setProvenance(updated);
      if (refreshedContact) setContact(refreshedContact as ContactDetail);
    });
  }

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

  const quickActions: Array<{ id: string; href?: string; onClick?: () => void; icon: React.ElementType; label: string; primary?: boolean }> = [
    ...(contact.phone ? [{ id: "call", href: `tel:${contact.phone}`, icon: Phone, label: "Volat" }] : []),
    ...(contact.email ? [{ id: "email", href: `mailto:${contact.email}`, icon: Mail, label: "E-mail" }] : []),
    { id: "task", onClick: () => onOpenTaskWizard(contact.id), icon: CheckSquare, label: "Úkol", primary: true },
    { id: "opp", onClick: () => onOpenOpportunityWizard(contact.id), icon: Briefcase, label: "Obchod" },
  ];

  return (
    <div className="space-y-0 pb-6">
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}

      {/* Hero — single rounded card, Revolut-ish */}
      <div className="px-3 pt-3">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a0f29] via-[#141b3d] to-indigo-900 p-5 shadow-lg">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-400/20 blur-3xl" aria-hidden />
          <div className="relative flex items-center gap-3">
            {contact.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.avatarUrl}
                alt={fullName}
                className="h-12 w-12 flex-shrink-0 rounded-full object-cover ring-2 ring-white/30"
              />
            ) : (
              <div className={cx("flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-black text-white ring-2 ring-white/20", avatarColor)}>
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-black leading-tight text-white">{fullName}</h2>
              {contact.title ? (
                <p className="mt-0.5 truncate text-[11px] font-semibold text-indigo-200/90">{contact.title}</p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SegmentBadge stage={contact.lifecycleStage} />
                {contact.priority ? (
                  <span className={cx(
                    "rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                    contact.priority === "high"
                      ? "bg-rose-500/20 text-rose-200"
                      : contact.priority === "medium"
                        ? "bg-amber-500/20 text-amber-200"
                        : "bg-white/10 text-white/70"
                  )}>
                    {contact.priority === "high" ? "Vysoká priorita" : contact.priority === "medium" ? "Střední priorita" : contact.priority}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {provenance ? (() => {
            const pFirst = resolveContactIdentityFieldProvenanceForHeader("firstName", provenance, contact);
            const pLast = resolveContactIdentityFieldProvenanceForHeader("lastName", provenance, contact);
            const p = pFirst ?? pLast;
            if (!p) return null;
            return (
              <div className="relative mt-3 min-w-0 max-w-full">
                <AiReviewProvenanceBadge
                  kind={p.kind}
                  reviewId={p.reviewId}
                  confirmedAt={p.confirmedAt}
                  className="text-[11px] text-indigo-200/95 [&_a]:text-indigo-100 [&_a]:underline-offset-2 flex-wrap max-w-full [&_a]:break-words"
                />
              </div>
            );
          })() : null}

          {/* Quick actions pill group */}
          <div
            className="relative mt-4 grid gap-1.5 rounded-2xl bg-white/10 p-1.5 backdrop-blur"
            style={{ gridTemplateColumns: `repeat(${quickActions.length}, minmax(0, 1fr))` }}
          >
            {quickActions.map(({ id, href, onClick, icon: Icon, label, primary }) =>
              href ? (
                <a
                  key={id}
                  href={href}
                  className={cx(
                    "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition-colors",
                    primary
                      ? "bg-indigo-500 text-white shadow-sm active:bg-indigo-600"
                      : "bg-white/5 text-white/95 active:bg-white/15"
                  )}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </a>
              ) : (
                <button
                  key={id}
                  type="button"
                  onClick={onClick}
                  className={cx(
                    "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition-colors",
                    primary
                      ? "bg-indigo-500 text-white shadow-sm active:bg-indigo-600"
                      : "bg-white/5 text-white/95 active:bg-white/15"
                  )}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {provenance?.mergeConflictFields && provenance.mergeConflictFields.length > 0 ? (
        <div className="px-3 pt-3">
          <ContactMergeConflictGuard
            mergeConflicts={provenance.mergeConflictFields}
            contactId={contactId}
            reviewId={provenance.reviewId}
          />
        </div>
      ) : null}

      {/* Tab bar — sticky, chips only, clean bottom border inside chip container */}
      <div className="sticky top-0 z-10 mt-3 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 px-3 py-2 backdrop-blur">
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
            contactId={contactId}
            contact={contact}
            tasks={tasks}
            pipeline={pipeline}
            documents={documents}
            household={household}
            provenance={provenance}
            onOpenHousehold={onOpenHousehold}
            onConfirmProvenance={handleConfirmProvenance}
            onConfirmAllProvenance={handleConfirmAllProvenance}
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
