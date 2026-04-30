"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Briefcase,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Shield,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";
import { signOutAndRedirectClient } from "@/lib/auth/sign-out-client";
import { isClientMobileSpaPath } from "@/lib/client-portal/client-mobile-spa-paths";
import { householdRoleLabel, isHouseholdChildLikeRole } from "@/lib/households/roles";
import * as Sentry from "@sentry/nextjs";
import {
  createClientPortalRequestFromForm,
  getClientRequests,
} from "@/app/actions/client-portal-requests";
import { summarizeAttachmentOutcomes } from "@/app/lib/client-portal/attachment-outcome";
import type { ContractRow } from "@/app/actions/contracts";
import {
  clientUploadDocument,
  getDocumentsForClient,
  type DocumentRow,
} from "@/app/actions/documents";
import {
  getPortalNotificationsForClient,
  getPortalNotificationsUnreadCount,
  markPortalNotificationRead,
  type PortalNotificationRow,
} from "@/app/actions/portal-notifications";
import { formatPortalNotificationBody } from "@/lib/client-portal/format-portal-notification-body";
import { getPortalNotificationDeepLinkWithFallback } from "@/lib/client-portal/portal-notification-routing";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import {
  aggregatePortfolioMetrics,
  mapContractToCanonicalProduct,
  PORTFOLIO_GROUP_LABELS,
  segmentToPortfolioGroup,
  type PortfolioUiGroup,
} from "@/lib/client-portfolio/read-model";
import {
  canonicalPortfolioDetailRowsForClientPortfolioCard,
  formatPortalPremiumLineCs,
  isFvEligibleSegment,
  portfolioContractStatusLabelCs,
  resolveFvMonthlyContribution,
  resolvePortalProductDisplayLogo,
} from "@/lib/client-portfolio/portal-portfolio-display";
import { institutionInitials, resolveInstitutionLogo } from "@/lib/institutions/institution-logo";
import type { CanonicalProduct } from "@/lib/products/canonical-product-read";
import {
  computeSharedFutureValueFromRate,
  SHARED_FV_DISCLAIMER,
} from "@/lib/fund-library/shared-future-value-pure";
import type { PortalFvContractAux } from "@/lib/client-portfolio/portal-portfolio-fv-precompute.types";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import {
  loadThreadMessages,
  loadThreadAttachmentsByContact,
  getUnreadAdvisorMessagesForClientCount,
  sendPortalMessage,
  sendPortalMessageWithAttachments,
  type MessageRow,
  type MessageAttachmentRow,
} from "@/app/actions/messages";
import { clientUpdateProfile } from "@/app/actions/contacts";
import { addHouseholdMemberFromClient, getClientHouseholdForContact, type ClientHouseholdDetail } from "@/app/actions/households";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingSkeleton,
  MobileAppShell,
  MobileBottomNav,
  MobileCard,
  MobileScreen,
  MobileSection,
  ProfileFieldRow,
  RequestStatusCard,
  SearchBar,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import { AiSupportButton } from "@/app/client/AiSupportButton";
import { ClientMaterialRequestToastStack } from "@/app/client/ClientMaterialRequestToastStack";
import { ClientRequestCancelButton } from "@/app/client/requests/ClientRequestCancelButton";
import { listClientMaterialRequests } from "@/app/actions/advisor-material-requests";
import {
  type MaterialRequestListItem,
  materialRequestStatusLabel,
} from "@/lib/advisor-material-requests/display";
import { isClientPortalAiDisabled } from "@/lib/client-portal/feature-flags";
import { useDeviceClass } from "@/lib/ui/useDeviceClass";
import { useMobilePortalDocumentViewportLock } from "@/lib/ui/useMobilePortalDocumentViewportLock";
import type { ClientMobileInitialData } from "./client-mobile-initial-data";
import {
  ADVISOR_PROPOSAL_SEGMENT_LABELS,
  formatMoneyCs as formatProposalMoneyCs,
} from "@/lib/advisor-proposals/segment-labels";
import { ClientPaymentsView } from "../payments/payments-client";

function fmtMoney(v: number): string {
  return `${v.toLocaleString("cs-CZ")} Kč`;
}

function materialRequestStatusTone(status: string): "success" | "warning" | "info" {
  if (status === "done" || status === "closed") return "success";
  if (status === "needs_more") return "warning";
  return "info";
}

// B1.11: Routing pro mobil používá stejnou funkci jako desktop, aby se mapování
// notifikací nerozbíhalo. `getPortalNotificationDeepLinkWithFallback` vrací vždy
// cestu + `known` flag, takže neznámé typy vedou na /client/notifications místo
// tichého dead clicku.
function notificationRouteResolved(n: { type: string; relatedEntityType: string | null; relatedEntityId: string | null }) {
  return getPortalNotificationDeepLinkWithFallback(n);
}

function notificationIcon(type: string) {
  if (type === "new_message") return MessageSquare;
  if (type === "new_document") return FileText;
  if (type === "advisor_material_request") return ClipboardList;
  if (type === "request_status_change") return CheckCircle2;
  if (type === "important_date") return Calendar;
  return Bell;
}

function formatMessageDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Dnes";
  if (date.toDateString() === yesterday.toDateString()) return "Včera";
  return date.toLocaleDateString("cs-CZ", { day: "numeric", month: "long" });
}

function groupMessagesByDate(msgs: MessageRow[]): Array<{ date: string; msgs: MessageRow[] }> {
  const groups: Array<{ date: string; msgs: MessageRow[] }> = [];
  let current: { date: string; msgs: MessageRow[] } | null = null;
  for (const msg of msgs) {
    const d = formatMessageDate(new Date(msg.createdAt));
    if (!current || current.date !== d) {
      current = { date: d, msgs: [] };
      groups.push(current);
    }
    current.msgs.push(msg);
  }
  return groups;
}

function formatDateCs(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDocumentType(document: DocumentRow): string {
  const visibleTag = document.tags?.find((tag) => {
    const t = tag.trim().toLowerCase();
    return (
      t &&
      t !== "ai-smlouva" &&
      t !== "ai_smlouva" &&
      !t.startsWith("review:") &&
      !t.startsWith("ai-review:") &&
      !t.startsWith("source:")
    );
  });
  if (visibleTag) return visibleTag;
  if (document.mimeType === "application/pdf") return "PDF";
  if (document.mimeType?.startsWith("image/")) return "Obrázek";
  return "Dokument";
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function MockSectionTitle({
  label,
  title,
  action,
}: {
  label?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {label ? (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-600/80">
            {label}
          </p>
        ) : null}
        <h2 className="break-words text-[20px] font-black leading-tight tracking-tight text-slate-900">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function MockMetricCard({
  label,
  value,
  icon,
  tone,
  wide,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "navy" | "orange" | "green";
  wide?: boolean;
}) {
  return (
    <article
      className={cx(
        "group relative min-w-0 overflow-hidden rounded-[24px] p-5 shadow-sm transition-transform active:scale-[.99] flex flex-col justify-between",
        wide ? "col-span-2 h-[130px]" : "h-[140px]",
        tone === "navy" && "bg-[#233052] text-white shadow-[#233052]/25",
        tone === "orange" && "bg-[#ea7a1a] text-white shadow-[#ea7a1a]/25",
        tone === "green" && "bg-[#277154] text-white shadow-[#277154]/25",
      )}
    >
      <div className="absolute -right-2 -top-2 text-white opacity-[0.12] transition-all duration-500 group-active:scale-110">
        {icon}
      </div>
      <p className="relative z-10 text-[11px] font-bold uppercase tracking-widest text-white/80 drop-shadow-sm">
        {label}
      </p>
      <p className={cx("relative z-10 mt-auto min-w-0 whitespace-nowrap font-black tracking-tight text-white drop-shadow-sm", wide ? "text-[32px]" : "text-[clamp(1.45rem,6.8vw,1.75rem)]")}>
        {value}
      </p>
    </article>
  );
}

function MockQuickAction({
  label,
  icon,
  tone,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  tone: "emerald" | "indigo" | "slate" | "violet";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-full px-5 text-[13px] font-bold shadow-sm ring-1 transition-all active:scale-95",
        tone === "emerald" && "bg-emerald-50 text-emerald-700 ring-emerald-200/50",
        tone === "indigo" && "bg-[#f3f5fc] text-[#2a3b7a] ring-[#2a3b7a]/10",
        tone === "slate" && "bg-white text-slate-700 ring-slate-200",
        tone === "violet" && "bg-violet-50 text-violet-700 ring-violet-200/50",
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard home — plnohodnotný klientský přehled                    */
/* ------------------------------------------------------------------ */

function DashboardHome({
  initialData,
  quickStats,
  contracts,
  documents,
  requests,
  notifications,
  unreadMessagesCount,
  onNewRequest,
  router,
}: {
  initialData: ClientMobileInitialData;
  quickStats: ClientMobileInitialData["quickStats"];
  contracts: ClientMobileInitialData["contracts"];
  documents: ClientMobileInitialData["documents"];
  requests: ClientMobileInitialData["requests"];
  notifications: ClientMobileInitialData["notifications"];
  unreadMessagesCount: number;
  onNewRequest: () => void;
  router: ReturnType<typeof import("next/navigation").useRouter>;
}) {
  const isFirstRun = contracts.length === 0 && documents.length === 0;
  const openMaterialRequests = initialData.advisorMaterialRequests.filter(
    (r) => r.status !== "done" && r.status !== "closed"
  );
  const activeProposals = initialData.advisorProposals.filter(
    (p) => p.status === "published" || p.status === "viewed"
  );
  const heroProposal = activeProposals.length
    ? [...activeProposals].sort(
        (a, b) => (b.savingsAnnual ?? 0) - (a.savingsAnnual ?? 0)
      )[0]
    : null;
  const openRequests = requests.filter(
    (r) => r.statusKey !== "done" && r.statusKey !== "cancelled"
  );
  const unreadNotifications = notifications.filter((n) => !n.readAt);
  const latestDocs = documents.slice(0, 3);
  const requestPreviewItems = [
    ...openRequests.map((r) => ({
      label: r.title,
      detail: `${r.caseTypeLabel} · ${r.statusLabel}`,
      onClick: () => router.push("/client/requests"),
    })),
    ...openMaterialRequests.map((r) => ({
      label: r.title,
      detail: `${r.categoryLabel} · ${materialRequestStatusLabel(r.status)}`,
      onClick: () => router.push(`/client/pozadavky-poradce/${r.id}`),
    })),
  ].slice(0, 3);

  const actionItems: { label: string; detail?: string; onClick: () => void }[] = [];
  for (const mr of openMaterialRequests.slice(0, 3)) {
    actionItems.push({
      label: mr.title,
      detail: mr.categoryLabel,
      onClick: () => router.push(`/client/pozadavky-poradce/${mr.id}`),
    });
  }
  if (unreadMessagesCount > 0) {
    actionItems.push({
      label: `${unreadMessagesCount} nepřečten${unreadMessagesCount === 1 ? "á zpráva" : unreadMessagesCount < 5 ? "é zprávy" : "ých zpráv"}`,
      onClick: () => router.push("/client/messages"),
    });
  }
  for (const n of unreadNotifications.slice(0, 2)) {
    actionItems.push({
      label: n.title,
      detail: n.body ? formatPortalNotificationBody(n.type, n.body) : undefined,
      onClick: () => router.push("/client/notifications"),
    });
  }

  if (isFirstRun) {
    return (
      <>
        <section className="group relative min-h-[88px] rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200/50">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-50/50 blur-3xl" />
          <div className="relative">
            <p className="flex min-w-0 items-center gap-2 text-[22px] font-black leading-tight tracking-tight text-slate-900">
              Dobrý den, {initialData.profile?.firstName || "Kliente"} <span className="text-[24px]">👋</span>
            </p>
            <p className="mt-1.5 break-words text-[14px] font-medium leading-5 text-slate-500">
              Váš portál je připraven.
            </p>
          </div>
        </section>

        {initialData.advisor && (
          <MobileCard className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-black shrink-0">
              {initialData.advisor.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">Váš poradce</p>
              <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{initialData.advisor.fullName}</p>
              {initialData.advisor.email && <p className="text-xs text-[color:var(--wp-text-secondary)] truncate">{initialData.advisor.email}</p>}
            </div>
            <button type="button" onClick={() => router.push("/client/messages")} className="shrink-0 min-h-[36px] min-w-[36px] rounded-lg border border-indigo-200 bg-indigo-50 grid place-items-center text-indigo-600">
              <MessageSquare size={16} />
            </button>
          </MobileCard>
        )}

        {actionItems.length > 0 && (
          <MobileSection title="Co je potřeba řešit">
            {actionItems.map((item, i) => (
              <button key={i} type="button" onClick={item.onClick} className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-left">
                <AlertCircle size={16} className="shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[color:var(--wp-text)] line-clamp-1">{item.label}</p>
                  {item.detail && <p className="text-xs text-[color:var(--wp-text-secondary)] line-clamp-1">{item.detail}</p>}
                </div>
                <ChevronRight size={14} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
              </button>
            ))}
          </MobileSection>
        )}

        <section>
          <MockSectionTitle label="Nástroje" title="Rychlé akce" />
          <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-3">
              <MockQuickAction label="Napsat poradci" tone="indigo" icon={<MessageSquare size={18} />} onClick={() => router.push("/client/messages")} />
              <MockQuickAction label="Dokumenty" tone="slate" icon={<FolderOpen size={18} />} onClick={() => router.push("/client/documents")} />
              <MockQuickAction label="Platby" tone="emerald" icon={<CreditCard size={18} />} onClick={() => router.push("/client/payments")} />
              <MockQuickAction label="Požádat poradce" tone="slate" icon={<Plus size={18} />} onClick={onNewRequest} />
            </div>
          </div>
        </section>

        <p className="text-xs text-[color:var(--wp-text-tertiary)] font-medium px-1 leading-relaxed">
          Jakmile váš poradce přidá smlouvy a dokumenty, zobrazí se zde automaticky.
        </p>
      </>
    );
  }

  return (
    <>
      <section className="group relative min-h-[88px] rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200/50 transition-all">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-50/50 blur-3xl" />
        <div className="relative flex flex-col justify-center">
          <p className="flex min-w-0 items-center gap-2 text-[22px] font-black leading-tight tracking-tight text-slate-900">
            Dobrý den, {initialData.profile?.firstName || "Kliente"} <span className="text-[24px]">👋</span>
          </p>
          <p className="mt-1.5 break-words text-[14px] font-medium leading-5 text-slate-500">
            Váš portál je připraven.
          </p>
        </div>
      </section>

      {/* B. Finanční přehled */}
      <section>
        <MockSectionTitle label="Finanční přehled" title="Moje Portfolio" />
        {initialData.quickStatsLoadFailed ? (
          <MobileCard className="border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">Přehled se nepodařilo načíst.</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
              Zobrazujeme ostatní části portálu; finanční metriky zkuste obnovit později.
            </p>
          </MobileCard>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <MockMetricCard
              label="Smlouvy"
              value={String(quickStats.activeContractCount)}
              icon={<Briefcase size={64} strokeWidth={1} />}
              tone="navy"
            />
            <MockMetricCard
              label="Pojistné"
              value={fmtMoney(quickStats.monthlyInsurancePremiums)}
              icon={<Shield size={64} strokeWidth={1} />}
              tone="orange"
            />
            <MockMetricCard
              label="Investice"
              value={fmtMoney(quickStats.assetsUnderManagement || quickStats.monthlyInvestments)}
              icon={<TrendingUp size={80} strokeWidth={1} />}
              tone="green"
              wide
            />
          </div>
        )}
      </section>

      {contracts.length > 0 ? (
        <section>
          <MockSectionTitle
            label="Produkty"
            title="Moje portfolio"
            action={
              <button
                type="button"
                onClick={() => router.push("/client/portfolio")}
                className="text-[13px] font-bold text-indigo-600 active:scale-95"
              >
                Vše
              </button>
            }
          />
          <div className="space-y-3">
            {contracts.slice(0, 3).map((contract) => {
              const canonical = contractToCanonicalMobile(contract);
              const aux = initialData.fvContractAux[contract.id] ?? null;
              return (
                <button
                  key={contract.id}
                  type="button"
                  onClick={() => router.push("/client/portfolio")}
                  className="flex w-full items-center gap-4 rounded-[20px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/60 active:scale-[.99]"
                >
                  <PortfolioProductLeadVisual contract={contract} canonical={canonical} fvAux={aux} compact />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[14px] font-black leading-tight text-slate-900">
                      {contract.productName || canonical.segmentLabel}
                    </p>
                    <p className="mt-1 truncate text-[12px] font-semibold text-slate-500">
                      {contract.partnerName || "Instituce"} · {canonical.segmentLabel}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-slate-300" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* B2. Návrh od poradce — nenásilná karta (jen pokud existuje aktivní) */}
      {heroProposal && (
        <MobileSection
          title="Návrh od vašeho poradce"
          action={
            activeProposals.length > 1 ? (
              <button
                type="button"
                onClick={() => router.push("/client/navrhy")}
                className="text-xs font-bold text-emerald-700"
              >
                Vše ({activeProposals.length})
              </button>
            ) : undefined
          }
        >
          <MobileCard className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 grid place-items-center text-emerald-600 shrink-0">
                <Sparkles size={18} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                  {ADVISOR_PROPOSAL_SEGMENT_LABELS[heroProposal.segment] ?? heroProposal.segment}
                </p>
                {heroProposal.savingsAnnual !== null && heroProposal.savingsAnnual > 0 ? (
                  <p className="text-base font-black text-[color:var(--wp-text)] leading-snug mt-0.5">
                    Úspora{" "}
                    <span className="text-emerald-600">
                      {formatProposalMoneyCs(heroProposal.savingsAnnual, heroProposal.currency)} / rok
                    </span>
                  </p>
                ) : (
                  <p className="text-base font-black text-[color:var(--wp-text)] leading-snug mt-0.5">
                    Nezávazné porovnání
                  </p>
                )}
                <p className="text-sm font-semibold text-[color:var(--wp-text)] line-clamp-2 mt-1">
                  „{heroProposal.title}"
                </p>
                <p className="text-[11px] text-[color:var(--wp-text-secondary)] mt-1 leading-snug">
                  Interní podklad od poradce. Nejde o pokyn klientovi.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => router.push(`/client/navrhy/${heroProposal.id}`)}
                className="flex-1 min-h-[40px] rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5"
              >
                Prohlédnout
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => router.push("/client/navrhy")}
                className="min-h-[40px] px-4 rounded-xl border border-emerald-200 bg-white text-emerald-700 text-sm font-bold"
              >
                Vše
              </button>
            </div>
          </MobileCard>
        </MobileSection>
      )}

      {/* C. Prioritní blok — „Co je potřeba řešit" */}
      {actionItems.length > 0 && (
        <section>
          <MockSectionTitle label="Co je potřeba řešit" title="Aktuální podněty" />
          {actionItems.map((item, i) => (
            <button key={i} type="button" onClick={item.onClick} className="group flex w-full items-start gap-4 rounded-[24px] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200/60 transition-all active:scale-[.98]">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <AlertCircle size={20} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[15px] font-bold leading-tight text-slate-900 line-clamp-1">{item.label}</p>
                {item.detail && <p className="mt-1.5 break-words text-[13px] font-medium leading-relaxed text-slate-500 line-clamp-2">{item.detail}</p>}
              </div>
              <ChevronRight size={16} className="mt-3 shrink-0 text-slate-300 transition-transform group-active:translate-x-1" />
            </button>
          ))}
        </section>
      )}

      <section>
        <MockSectionTitle label="Nástroje" title="Rychlé akce" />
        <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-3">
            <MockQuickAction label="Napsat poradci" tone="indigo" icon={<MessageSquare size={18} />} onClick={() => router.push("/client/messages")} />
            <MockQuickAction label="Trezor dokumentů" tone="slate" icon={<FolderOpen size={18} />} onClick={() => router.push("/client/documents")} />
            <MockQuickAction label="Platby" tone="emerald" icon={<CreditCard size={18} />} onClick={() => router.push("/client/payments")} />
            <MockQuickAction label="Požádat poradce" tone="slate" icon={<Plus size={18} />} onClick={onNewRequest} />
          </div>
        </div>
      </section>

      {/* E. Modulární obsah */}
      <section>
        <MockSectionTitle
          label="Servis"
          title="Moje požadavky"
          action={
            <button type="button" onClick={() => router.push("/client/requests")} className="text-[13px] font-bold text-indigo-600 active:scale-95">
              Vše
            </button>
          }
        />
        {requestPreviewItems.length > 0 ? (
          <div className="space-y-3">
            {requestPreviewItems.map((item, index) => (
              <button
                key={`${item.label}-${index}`}
                type="button"
                onClick={item.onClick}
                className="flex w-full items-center gap-4 rounded-[20px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/60 active:scale-[.99]"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <ListTodo size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[14px] font-black leading-tight text-slate-900">{item.label}</p>
                  <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-slate-500">{item.detail}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        ) : (
          <MobileCard className="p-4">
            <p className="text-[14px] font-black text-slate-900">Žádné otevřené požadavky</p>
            <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-500">
              Nový požadavek můžete vytvořit přes tlačítko níže.
            </p>
            <button
              type="button"
              onClick={onNewRequest}
              className="mt-3 min-h-[44px] w-full rounded-[16px] bg-[#f3f5fc] text-[13px] font-black text-[#2a3b7a] ring-1 ring-[#2a3b7a]/10"
            >
              Vytvořit požadavek
            </button>
          </MobileCard>
        )}
      </section>

      {latestDocs.length > 0 && (
        <section>
          <MockSectionTitle
            label="Soubory ke stažení"
            title="Poslední dokumenty"
            action={
              <button type="button" onClick={() => router.push("/client/documents")} className="text-[13px] font-bold text-indigo-600 active:scale-95">
              Vše
            </button>
            }
          />
          <div className="space-y-3">
            {latestDocs.map((d) => (
            <a key={d.id} href={`/api/documents/${d.id}/download`} className="group flex w-full items-center gap-4 rounded-[20px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/60 transition-all active:scale-[.99]">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-slate-100">
                <FileText size={22} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[14px] font-bold leading-tight text-slate-900 line-clamp-1">{d.name}</p>
                <p className="mt-1 flex items-center gap-1.5 break-words text-[12px] font-medium text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  {formatDocumentType(d)} <span className="opacity-50">|</span> {formatDateCs(d.createdAt)}
                </p>
              </div>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-400 transition-all group-active:bg-indigo-600 group-active:text-white">
                <Download size={18} />
              </span>
            </a>
            ))}
          </div>
        </section>
      )}

      {initialData.advisor ? (
        <MobileSection title="Váš poradce">
          <MobileCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#111b36] text-sm font-black text-white">
                {initialData.advisor.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[color:var(--wp-text)]">{initialData.advisor.fullName}</p>
                {initialData.advisor.email ? (
                  <p className="truncate text-xs font-medium text-[color:var(--wp-text-secondary)]">{initialData.advisor.email}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => router.push("/client/messages")}
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700"
                aria-label="Napsat poradci"
              >
                <MessageSquare size={17} />
              </button>
            </div>
          </MobileCard>
        </MobileSection>
      ) : null}
    </>
  );
}

type TabId = "home" | "messages" | "documents" | "payments" | "menu";

function toTab(pathname: string): TabId {
  if (pathname.startsWith("/client/messages")) return "messages";
  if (pathname.startsWith("/client/documents")) return "documents";
  if (pathname.startsWith("/client/payments")) return "payments";
  if (
    pathname.startsWith("/client/requests") ||
    pathname.startsWith("/client/profile") ||
    pathname.startsWith("/client/notifications") ||
    pathname.startsWith("/client/portfolio") ||
    pathname.startsWith("/client/contracts")
  ) {
    return "menu";
  }
  return pathname.startsWith("/client") ? "home" : "menu";
}

/* ------------------------------------------------------------------ */
/*  Portfolio screen — seskupené podle read-modelu jako web             */
/* ------------------------------------------------------------------ */

const GROUP_ORDER: PortfolioUiGroup[] = [
  "investments_pensions",
  "loans",
  "income_protection_life",
  "children",
  "property_liability",
  "vehicles",
  "travel",
  "business",
  "other",
];

function contractToCanonicalMobile(c: ClientMobileInitialData["contracts"][number]) {
  return mapContractToCanonicalProduct({
    id: c.id,
    contactId: c.contactId,
    segment: c.segment,
    type: c.type,
    partnerId: c.partnerId,
    productId: c.productId,
    partnerName: c.partnerName,
    productName: c.productName,
    premiumAmount: c.premiumAmount,
    premiumAnnual: c.premiumAnnual,
    contractNumber: c.contractNumber,
    startDate: c.startDate,
    anniversaryDate: c.anniversaryDate,
    note: c.note,
    visibleToClient: c.visibleToClient,
    portfolioStatus: c.portfolioStatus,
    sourceKind: c.sourceKind,
    portfolioAttributes: c.portfolioAttributes,
  });
}

function PortfolioProductLeadVisual({
  contract,
  canonical: p,
  fvAux,
  compact = false,
}: {
  contract: ContractRow;
  canonical: CanonicalProduct;
  fvAux: PortalFvContractAux | null;
  compact?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const displayLogo = resolvePortalProductDisplayLogo(p, {
    fundLogoPath: fvAux?.fundLogoPath ?? null,
  });
  const fallbackLogo = resolveInstitutionLogo(contract.partnerName);
  const logoSource = displayLogo ?? fallbackLogo;
  const logoPath = logoSource?.src && !logoFailed ? logoSource.src : null;
  const logoAlt = logoSource?.alt ?? "Logo instituce";
  const initials = institutionInitials(contract.partnerName ?? p.productName);
  const size = compact ? "h-12 w-12 rounded-2xl" : "h-[5.5rem] w-[5.5rem] rounded-xl";

  return logoPath ? (
    <Image
      src={logoPath}
      alt={logoAlt}
      width={88}
      height={88}
      className={`${compact ? "h-12 w-12 rounded-2xl bg-white p-1.5" : "h-[5.5rem] w-[5.5rem]"} shrink-0 object-contain`}
      onError={() => setLogoFailed(true)}
      unoptimized
    />
  ) : (
    <div
      className={`${size} bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] flex items-center justify-center text-sm font-black text-[color:var(--wp-text-secondary)] shrink-0`}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function PortfolioScreen({
  contracts,
  visibleSourceDocs,
  fvContractAux,
}: {
  contracts: ClientMobileInitialData["contracts"];
  visibleSourceDocs: ClientMobileInitialData["visiblePortfolioSourceDocs"];
  fvContractAux: ClientMobileInitialData["fvContractAux"];
}) {
  if (contracts.length === 0) {
    return (
      <EmptyState
        title="Žádné produkty"
        description="Jakmile poradce přidá a zveřejní smlouvy, zobrazí se zde seřazené podle kategorií."
      />
    );
  }

  const metrics = aggregatePortfolioMetrics(
    contracts.map((c) => ({
      segment: c.segment,
      premiumAmount: c.premiumAmount,
      premiumAnnual: c.premiumAnnual,
      portfolioAttributes: c.portfolioAttributes,
      portfolioStatus: c.portfolioStatus,
    })),
  );

  const canonicalById = new Map<string, ReturnType<typeof contractToCanonicalMobile>>();
  for (const c of contracts) {
    canonicalById.set(c.id, contractToCanonicalMobile(c));
  }

  let anyFvShown = false;
  for (const c of contracts) {
    const p = canonicalById.get(c.id);
    if (!p || !isFvEligibleSegment(c.segment) || !p.fvReadiness.fvSourceType) continue;
    const isOneTime =
      p.segmentDetail?.kind === "investment" && p.segmentDetail.paymentType === "one_time";
    const aux = fvContractAux[c.id] ?? null;
    const hit = computeSharedFutureValueFromRate({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: resolveFvMonthlyContribution(p),
      annualContribution: isOneTime ? null : p.premiumAnnual,
      lumpContribution: isOneTime ? p.premiumMonthly : null,
      resolvedAnnualRatePercent: aux?.resolvedAnnualRatePercent ?? null,
      resolvedFundDisplayName: aux?.resolvedFundDisplayName ?? null,
    });
    if (hit.projectionState === "complete" && hit.projectedFutureValue != null) {
      anyFvShown = true;
      break;
    }
  }

  const grouped = new Map<PortfolioUiGroup, typeof contracts>();
  for (const c of contracts) {
    const g = segmentToPortfolioGroup(c.segment, c.portfolioAttributes);
    const list = grouped.get(g) ?? [];
    list.push(c);
    grouped.set(g, list);
  }

  return (
    <>
      <p className="text-[11px] text-[color:var(--wp-text-tertiary)] px-0.5 -mt-1 mb-1 leading-relaxed">
        Souhrnné částky počítáme jen u aktivních smluv; ukončené zůstávají v seznamu níže.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {metrics.monthlyInvestments > 0 && (
          <MobileCard className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-black">Investice / měs.</p>
            <p className="text-base font-black mt-0.5">{fmtMoney(metrics.monthlyInvestments)}</p>
          </MobileCard>
        )}
        {metrics.monthlyInsurancePremiums > 0 && (
          <MobileCard className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-600 font-black">Pojistné / měs.</p>
            <p className="text-base font-black mt-0.5">{fmtMoney(metrics.monthlyInsurancePremiums)}</p>
          </MobileCard>
        )}
        {metrics.totalLoanPrincipal > 0 && (
          <MobileCard className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-blue-600 font-black">Jistiny úvěrů</p>
            <p className="text-base font-black mt-0.5">{fmtMoney(metrics.totalLoanPrincipal)}</p>
          </MobileCard>
        )}
        <MobileCard className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--wp-text-secondary)] font-black">Položek</p>
          <p className="text-base font-black mt-0.5">{metrics.activeContractCount}</p>
        </MobileCard>
      </div>

      {GROUP_ORDER.map((groupKey) => {
        const items = grouped.get(groupKey);
        if (!items?.length) return null;
        return (
          <MobileSection key={groupKey} title={PORTFOLIO_GROUP_LABELS[groupKey]}>
            {items.map((contract) => {
              const p = canonicalById.get(contract.id)!;
              const st = portfolioContractStatusLabelCs(contract.portfolioStatus, contract.startDate);
              const stTone =
                st === "Aktivní"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : st === "Ukončené"
                    ? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]"
                    : "bg-amber-50 text-amber-800 border-amber-100";
              const isOneTimeInv =
                p.segmentDetail?.kind === "investment" && p.segmentDetail.paymentType === "one_time";
              const aux = fvContractAux[contract.id] ?? null;
              const fvShared =
                isFvEligibleSegment(contract.segment) && p.fvReadiness.fvSourceType
                  ? computeSharedFutureValueFromRate({
                      fvSourceType: p.fvReadiness.fvSourceType,
                      resolvedFundId: p.fvReadiness.resolvedFundId,
                      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
                      investmentHorizon: p.fvReadiness.investmentHorizon,
                      monthlyContribution: resolveFvMonthlyContribution(p),
                      annualContribution: isOneTimeInv ? null : p.premiumAnnual,
                      lumpContribution: isOneTimeInv ? p.premiumMonthly : null,
                      resolvedAnnualRatePercent: aux?.resolvedAnnualRatePercent ?? null,
                      resolvedFundDisplayName: aux?.resolvedFundDisplayName ?? null,
                    })
                  : null;
              const fv =
                fvShared?.projectionState === "complete" &&
                fvShared.projectedFutureValue != null &&
                fvShared.horizonYears != null
                  ? {
                      amount: fvShared.projectedFutureValue,
                      horizonYears: fvShared.horizonYears,
                      sourceExplanation: fvShared.sourceLabel,
                    }
                  : null;
              const detailRows = canonicalPortfolioDetailRowsForClientPortfolioCard(p);
              const dDetail = p.segmentDetail;
              const lifeRisks = dDetail?.kind === "life_insurance" ? (dDetail.risks ?? []) : [];
              const dpsBreakdown =
                dDetail?.kind === "pension" &&
                (dDetail.participantContribution || dDetail.employerContribution || dDetail.stateContributionEstimate)
                  ? {
                      participant: dDetail.participantContribution,
                      employer: dDetail.employerContribution,
                      state: dDetail.stateContributionEstimate,
                    }
                  : null;
              const visibleDoc =
                contract.sourceDocumentId && visibleSourceDocs[contract.sourceDocumentId]
                  ? visibleSourceDocs[contract.sourceDocumentId]
                  : null;
              return (
                <MobileCard key={contract.id} className="p-3.5 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <PortfolioProductLeadVisual contract={contract} canonical={p} fvAux={aux} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[color:var(--wp-text)] leading-snug line-clamp-2">
                            {contract.productName || "Produkt"}
                          </p>
                          {contract.partnerName ? (
                            <p className="text-xs text-[color:var(--wp-text-secondary)] truncate mt-0.5">{contract.partnerName}</p>
                          ) : null}
                          <p className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1 uppercase tracking-wide">{p.segmentLabel}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider ${stTone}`}>
                          {st}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Platba</p>
                      <p className="font-bold text-[color:var(--wp-text)]">
                        {formatPortalPremiumLineCs(
                          contract.premiumAmount,
                          contract.premiumAnnual,
                          p.segmentDetail?.kind === "investment" ? p.segmentDetail.paymentType : null,
                        )}
                      </p>
                    </div>
                    {contract.contractNumber ? (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Číslo smlouvy</p>
                        <p className="font-mono text-[color:var(--wp-text)] truncate">{contract.contractNumber}</p>
                      </div>
                    ) : null}
                    {contract.startDate ? (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Od</p>
                        <p className="font-bold text-[color:var(--wp-text)]">{formatDisplayDateCs(contract.startDate) || contract.startDate}</p>
                      </div>
                    ) : null}
                    {contract.anniversaryDate ? (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Výročí</p>
                        <p className="font-bold text-[color:var(--wp-text)]">{formatDisplayDateCs(contract.anniversaryDate) || contract.anniversaryDate}</p>
                      </div>
                    ) : null}
                  </div>

                  {detailRows.length > 0 ? (
                    <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)]/90 bg-white p-3 space-y-0 shadow-sm">
                      {detailRows.map((row, ridx) => (
                        <div
                          key={`${row.label}-${ridx}`}
                          className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-baseline sm:gap-3 py-2.5 border-b border-[color:var(--wp-surface-card-border)] last:border-b-0 first:pt-0 last:pb-0"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] shrink-0">
                            {row.label}
                          </span>
                          <span className="text-[12px] font-bold text-[color:var(--wp-text)] text-left sm:text-right min-w-0 leading-snug break-words">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {lifeRisks.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] px-0.5">Rizika / krytí</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {lifeRisks.map((r, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white p-2 flex items-start justify-between gap-2 shadow-sm"
                          >
                            <span className="text-[12px] font-bold text-[color:var(--wp-text)] leading-snug min-w-0 break-words">
                              {r.label || "—"}
                            </span>
                            {r.amount ? (
                              <span className="text-[12px] font-black text-purple-700 tabular-nums shrink-0">
                                {r.amount}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {dpsBreakdown ? (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Složení vkladu</p>
                      <div className="space-y-1.5">
                        {dpsBreakdown.participant ? (
                          <div className="flex justify-between text-[12px] font-bold text-[color:var(--wp-text)]">
                            <span>Vlastní</span>
                            <span className="tabular-nums text-[color:var(--wp-text)]">{dpsBreakdown.participant}</span>
                          </div>
                        ) : null}
                        {dpsBreakdown.state ? (
                          <div className="flex justify-between text-[12px] font-bold text-indigo-700">
                            <span>Stát (odhad)</span>
                            <span className="tabular-nums">+ {dpsBreakdown.state}</span>
                          </div>
                        ) : null}
                        {dpsBreakdown.employer ? (
                          <div className="flex justify-between text-[12px] font-bold text-emerald-700">
                            <span>Zaměstnavatel</span>
                            <span className="tabular-nums">+ {dpsBreakdown.employer}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {fv ? (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5 space-y-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Odhad budoucí hodnoty</p>
                      <p className="text-base font-black text-indigo-950">{fv.amount.toLocaleString("cs-CZ")} Kč</p>
                      <p className="text-[10px] text-indigo-900/85 leading-snug">{fv.sourceExplanation}</p>
                    </div>
                  ) : null}

                  {visibleDoc && contract.sourceDocumentId ? (
                    <a
                      href={`/api/documents/${contract.sourceDocumentId}/download`}
                      className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-[11px] font-black text-indigo-700"
                    >
                      Související dokument ({visibleDoc.name})
                    </a>
                  ) : null}
                </MobileCard>
              );
            })}
          </MobileSection>
        );
      })}

      {anyFvShown ? (
        <p className="text-[10px] text-[color:var(--wp-text-tertiary)] leading-relaxed px-0.5">{SHARED_FV_DISCLAIMER}</p>
      ) : null}
    </>
  );
}

export function ClientMobileClient({ initialData }: { initialData: ClientMobileInitialData }) {
  const deviceClass = useDeviceClass();
  useMobilePortalDocumentViewportLock();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => toTab(pathname));
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [quickStats] = useState(initialData.quickStats);
  const [requests, setRequests] = useState<ClientRequestItem[]>(initialData.requests);
  const [advisorMaterialRequests, setAdvisorMaterialRequests] = useState<MaterialRequestListItem[]>(initialData.advisorMaterialRequests);
  const [contracts, setContracts] = useState<ContractRow[]>(initialData.contracts);
  const [documents, setDocuments] = useState<DocumentRow[]>(initialData.documents);
  const [notifications, setNotifications] = useState<PortalNotificationRow[]>(initialData.notifications);
  const [household, setHousehold] = useState<ClientHouseholdDetail | null>(initialData.household);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageAttachmentsById, setMessageAttachmentsById] = useState<Record<string, MessageAttachmentRow[]>>({});

  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(initialData.unreadNotificationsCount);
  // exposed via setter used in notification tap handler above
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(initialData.unreadMessagesCount);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [notificationsSheetOpen, setNotificationsSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [requestCaseType, setRequestCaseType] = useState("hypotéka");
  const [requestSubject, setRequestSubject] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestFiles, setRequestFiles] = useState<File[]>([]);

  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const messageBottomRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const [documentsSearch, setDocumentsSearch] = useState("");
  const [requestsFilter, setRequestsFilter] = useState<"all" | "mine" | "advisor">("all");
  const [profileDraft, setProfileDraft] = useState({
    email: initialData.profile?.email ?? "",
    phone: initialData.profile?.phone ?? "",
    street: initialData.profile?.street ?? "",
    city: initialData.profile?.city ?? "",
    zip: initialData.profile?.zip ?? "",
  });
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("partner");
  const [newMemberBirthDate, setNewMemberBirthDate] = useState("");

  const onPortfolioRoute = pathname.startsWith("/client/portfolio") || pathname.startsWith("/client/contracts");
  const onPaymentsRoute = pathname.startsWith("/client/payments");
  const onNotificationsRoute = pathname.startsWith("/client/notifications");
  const onProfileRoute = pathname.startsWith("/client/profile");
  const isMessagesActive =
    pathname.startsWith("/client/messages") &&
    !onPortfolioRoute &&
    !onPaymentsRoute &&
    !onNotificationsRoute &&
    !onProfileRoute;
  // Reset MobileScreen scroll when pathname or shell context changes (not only tab — avoids stale layout).
  const pathBase = pathname.split("?")[0] ?? pathname;
  const screenKey = `${pathBase}|${tab}|${String(onPortfolioRoute)}|${String(onPaymentsRoute)}|${String(onNotificationsRoute)}|${String(onProfileRoute)}`;
  /** Deep routes (portfolio, notifications) are not primary tabs — no misleading “home” highlight. */
  // No tab highlighted on portfolio/notifications deep routes, or during the brief window
  // before window.location.replace fires on non-SPA paths (prevents false "Přehled" flash).
  const navActiveId =
    onPortfolioRoute || onNotificationsRoute || !isClientMobileSpaPath(pathname) ? null : tab;

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages]);

  useEffect(() => {
    setTab(toTab(pathname));
  }, [pathname]);

  // Kalkulačky, platby, detaily požadavků a jiné non-SPA stránky potřebují full-page reload.
  // Next.js App Router layout se při client-side navigaci nespouští znovu, takže server-side
  // rozhodnutí "SPA vs. children" zůstane z předchozího requestu.
  useEffect(() => {
    if (!isClientMobileSpaPath(pathname)) {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "client_mobile_spa_full_reload",
        level: "info",
        data: { pathname },
      });
      const search = searchParams.toString();
      window.location.replace(pathname + (search ? `?${search}` : ""));
    }
    // Intentionally depends only on pathname — a searchParams-only change doesn't trigger reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/client/requests")) return;
    startTransition(async () => {
      try {
        const [nextRequests, nextMaterial] = await Promise.all([
          getClientRequests().catch(() => null),
          listClientMaterialRequests().catch(() => null),
        ]);
        if (nextRequests) setRequests(nextRequests);
        if (nextMaterial) setAdvisorMaterialRequests(nextMaterial);
      } catch {
        /* ignore */
      }
    });
     
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/client/messages")) return;
    startTransition(async () => {
      try {
        const [msgRes, attRes] = await Promise.all([
          loadThreadMessages(initialData.contactId, { markRead: true }),
          loadThreadAttachmentsByContact(initialData.contactId),
        ]);
        if (msgRes.ok) {
          setMessages(msgRes.messages);
        } else {
          setError(msgRes.error);
        }
        if (attRes.ok) setMessageAttachmentsById(attRes.byMessageId);
        const unread = await getUnreadAdvisorMessagesForClientCount();
        setUnreadMessagesCount(unread);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Zprávy se nepodařilo načíst.");
      }
    });
  }, [pathname, initialData.contactId]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function refreshBadges() {
    const [notifCount, msgCount] = await Promise.all([
      getPortalNotificationsUnreadCount().catch(() => unreadNotificationsCount),
      getUnreadAdvisorMessagesForClientCount().catch(() => unreadMessagesCount),
    ]);
    setUnreadNotificationsCount(notifCount);
    setUnreadMessagesCount(msgCount);
  }

  function navigate(next: TabId) {
    if (next === "home") router.push("/client");
    else if (next === "messages") router.push("/client/messages");
    else if (next === "documents") router.push("/client/documents");
    else if (next === "payments") router.push("/client/payments");
    else router.push("/client/profile");
  }

  async function createRequest() {
    startTransition(async () => {
      setError(null);
      try {
        const fd = new FormData();
        fd.set("caseType", requestCaseType);
        fd.set("subject", requestSubject.trim());
        fd.set("description", requestDescription.trim());
        for (const f of requestFiles) fd.append("files", f);
        const result = await createClientPortalRequestFromForm(fd);
        if (!result.success) {
          setError("error" in result ? result.error : "Požadavek se nepodařilo vytvořit.");
          return;
        }
        const { warning } = summarizeAttachmentOutcomes(result.attachments);
        if (warning) {
          setError(warning);
        }
        setRequestModalOpen(false);
        setRequestSubject("");
        setRequestDescription("");
        setRequestFiles([]);
        setRequests(await getClientRequests());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Požadavek se nepodařilo vytvořit.");
      }
    });
  }

  async function sendMessage() {
    const trimmed = composeBody.trim();
    if (!trimmed && composeFiles.length === 0) return;
    startTransition(async () => {
      setError(null);
      try {
        if (composeFiles.length > 0) {
          const formData = new FormData();
          formData.set("body", trimmed || "(příloha)");
          for (const file of composeFiles) formData.append("files", file);
          const sent = await sendPortalMessageWithAttachments(initialData.contactId, formData);
          if (!sent.ok) {
            setError(sent.error);
            return;
          }
        } else {
          const sent = await sendPortalMessage(initialData.contactId, trimmed);
          if (!sent.ok) {
            setError(sent.error);
            return;
          }
        }
        setComposeBody("");
        setComposeFiles([]);
        const [msgRes, attRes] = await Promise.all([
          loadThreadMessages(initialData.contactId, { markRead: true }),
          loadThreadAttachmentsByContact(initialData.contactId),
        ]);
        if (msgRes.ok) setMessages(msgRes.messages);
        if (attRes.ok) setMessageAttachmentsById(attRes.byMessageId);
        await refreshBadges();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Zprávu se nepodařilo odeslat.");
      }
    });
  }

  async function uploadDocument(file: File | null) {
    if (!file) return;
    startTransition(async () => {
      setError(null);
      try {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("name", file.name);
        formData.set("uploadSource", "mobile_file");
        await clientUploadDocument(formData);
        setDocuments(await getDocumentsForClient(initialData.contactId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Dokument se nepodařilo nahrát.");
      }
    });
  }

  async function markNotificationAsRead(notificationId: string) {
    startTransition(async () => {
      setError(null);
      try {
        await markPortalNotificationRead(notificationId);
        const [nextNotifications, nextCount] = await Promise.all([
          getPortalNotificationsForClient(),
          getPortalNotificationsUnreadCount(),
        ]);
        setNotifications(nextNotifications);
        setUnreadNotificationsCount(nextCount);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Notifikaci se nepodařilo označit.");
      }
    });
  }

  async function saveProfile(): Promise<boolean> {
    setError(null);
    try {
      await clientUpdateProfile(profileDraft);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profil se nepodařilo uložit.");
      return false;
    }
  }

  async function addHouseholdMember() {
    if (!newMemberName.trim()) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await addHouseholdMemberFromClient({
          role: newMemberRole,
          fullName: newMemberName.trim(),
          birthDate: newMemberBirthDate || null,
        });
        if (!result.success) return;
        setAddMemberOpen(false);
        setNewMemberName("");
        setNewMemberBirthDate("");
        setHousehold(await getClientHouseholdForContact(initialData.contactId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Člena domácnosti se nepodařilo přidat.");
      }
    });
  }

  const filteredDocuments = useMemo(() => {
    const q = documentsSearch.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, documentsSearch]);

  const filteredRequests = useMemo(() => {
    if (requestsFilter === "advisor") return [];
    return requests;
  }, [requests, requestsFilter]);

  const filteredMaterialRequests = useMemo(() => {
    if (requestsFilter === "mine") return [];
    return advisorMaterialRequests;
  }, [advisorMaterialRequests, requestsFilter]);

  const navItems = [
    { id: "home", label: "Přehled", icon: LayoutDashboard },
    { id: "messages", label: "Zprávy", icon: MessageSquare, badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined },
    { id: "documents", label: "Dokumenty", icon: FileText },
    { id: "payments", label: "Platby", icon: CreditCard },
  ];

  const headerTitle = onPortfolioRoute
    ? "Portfolio"
    : onPaymentsRoute
      ? "Platby a příkazy"
      : onNotificationsRoute
        ? "Oznámení"
        : onProfileRoute
          ? "Můj profil"
          : tab === "home"
            ? "Můj přehled"
            : tab === "messages"
              ? "Zprávy"
              : tab === "documents"
                ? "Dokumenty"
                : tab === "payments"
                  ? "Platby"
                  : "Profil";

  // B2.9: Sjednoceno s desktopem — žádné interní termíny typu „segmenty“
  // nebo „evidence poradce“. Klient rozumí jen běžnému jazyku.
  const headerSubtitle = onNotificationsRoute
    ? "Vaše oznámení a novinky"
    : onPortfolioRoute
      ? "Vaše smlouvy a investice"
      : onPaymentsRoute
        ? "Platební údaje a QR kódy"
        : initialData.advisor?.fullName
          ? `Poradce: ${initialData.advisor.fullName}`
          : initialData.fullName;
  const profileInitials =
    initialData.fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "K";
  const notificationBadge = unreadNotificationsCount + unreadMessagesCount;
  const overlayOpen =
    requestModalOpen ||
    actionSheetOpen ||
    notificationsSheetOpen ||
    profileEditOpen ||
    addMemberOpen ||
    helpOpen ||
    paymentModalOpen;

  return (
    <>
    <MobileAppShell deviceClass={deviceClass}>
      {isMessagesActive ? (
        <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white px-4 pb-4 pt-[calc(var(--safe-area-top)+0.5rem)]">
          <div className="flex min-h-[50px] items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/client")}
              className="grid h-10 w-10 place-items-center rounded-full bg-slate-50 text-slate-600 active:scale-95"
              aria-label="Zpět na přehled"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#1a264d] text-[13px] font-black text-white shadow-sm">
              {initialData.advisor?.initials ?? "VP"}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-black leading-tight text-slate-900">
                {initialData.advisor?.fullName ?? "Váš poradce"}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Váš poradce
              </p>
            </div>
          </div>
        </header>
      ) : (
        <header className="relative z-30 shrink-0 px-6 pb-4 pt-[calc(var(--safe-area-top)+1rem)] transition-all duration-300 ease-in-out">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="mt-0.5 break-words text-[11px] font-bold uppercase tracking-widest text-slate-500">
                {headerSubtitle}
              </p>
              <h1 className="break-words text-[28px] font-black leading-tight tracking-tight text-slate-900 drop-shadow-sm">
                {headerTitle}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isClientPortalAiDisabled() ? (
                <AiSupportButton variant="header" onOpenChange={setHelpOpen} />
              ) : null}
            <button
              type="button"
              onClick={() => setNotificationsSheetOpen(true)}
              className="group relative grid h-11 w-11 place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200/60 transition-all active:scale-95"
              aria-label="Notifikace"
            >
              <Bell size={20} className="transition-colors group-active:text-indigo-600" />
              {notificationBadge > 0 ? (
                <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-[#f6f8fb]">
                  {notificationBadge > 9 ? "9+" : notificationBadge}
                </span>
              ) : null}
            </button>
              <button
                type="button"
                onClick={() => router.push("/client/profile")}
                className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-[#1e2b5a] text-[13px] font-black text-white shadow-md ring-2 ring-white transition-all active:scale-95"
                aria-label="Profil"
              >
                {profileInitials}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ── CHAT LAYOUT (messages tab): inner scroll + fixed compose at bottom ── */}
      {isMessagesActive ? (
        <main className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] bg-white/70 px-4 py-3 backdrop-blur">
            {initialData.advisorBookingPath ? (
              <button
                type="button"
                onClick={() => router.push(initialData.advisorBookingPath!)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 text-sm font-black text-indigo-700 active:scale-[0.99]"
              >
                <Calendar size={16} />
                Naplánovat schůzku
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 text-sm font-black text-slate-500"
              >
                <Calendar size={16} />
                Rezervační odkaz není dostupný
              </button>
            )}
          </div>
          {/* Messages scroll area */}
          <div ref={messagesScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-y-none bg-[#f6f8fb] px-4 py-4">
            {busy ? <LoadingSkeleton rows={3} /> : null}
            {error ? (
              <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}
            {!busy && !error && messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center pb-24 text-center">
                <p className="text-sm font-medium text-slate-500">Zatím žádné zprávy.</p>
                <p className="mt-1 text-xs text-slate-400">Napište poradci níže.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {groupedMessages.map(({ date, msgs: dayMsgs }) => (
                  <div key={date}>
                    <div className="flex justify-center py-3">
                      <span className="px-3 py-1 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] text-[10px] font-black uppercase tracking-wider rounded-full">
                        {date}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dayMsgs.map((message) => {
                        const own = message.senderType === "client";
                        const attachments = messageAttachmentsById[message.id] ?? [];
                        return (
                          <div key={message.id} className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
                            <div
                              className={`max-w-[85%] rounded-[22px] px-4 py-3 text-[15px] font-medium leading-relaxed shadow-sm ${
                                own
                                  ? "rounded-tr-md bg-indigo-600 text-white"
                                  : "rounded-tl-md border border-slate-200 bg-white text-slate-900"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{message.body}</p>
                              {attachments.length > 0 ? (
                                <div className={`mt-3 space-y-2 ${own ? "text-white" : ""}`}>
                                  {attachments.map((attachment) => (
                                    <a
                                      key={attachment.id}
                                      href={`/api/messages/attachments/${attachment.id}/download`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`block min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold underline ${
                                        own
                                          ? "border-white/25 bg-white/10 text-white"
                                          : "border-slate-200 bg-slate-50 text-indigo-700"
                                      }`}
                                    >
                                      Příloha: {attachment.fileName}
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className={`mt-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-slate-400 ${own ? "justify-end" : "justify-start"}`}>
                              <span>
                                {new Date(message.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {own && message.readAt ? <span>· Přečteno</span> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div ref={messageBottomRef} className="h-1" />
              </div>
            )}
          </div>
          <div className="shrink-0 rounded-t-[30px] border-t border-slate-200 bg-white px-3 pb-[calc(var(--safe-area-bottom)+0.75rem)] pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.06)]">
            {composeFiles.length > 0 ? (
              <p className="text-[11px] text-[color:var(--wp-text-secondary)] mb-1.5 px-1">
                {composeFiles.length} {composeFiles.length === 1 ? "soubor vybrán" : "soubory vybrány"}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <div className="flex-1 flex items-end gap-1.5 rounded-[24px] border border-slate-200 bg-slate-50 pl-3 pr-2 py-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-300 transition-all">
                <textarea
                  rows={1}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  className="flex-1 bg-transparent border-none outline-none text-[16px] text-[color:var(--wp-text)] resize-none max-h-24 min-h-[20px] leading-relaxed"
                  placeholder="Napište zprávu…"
                />
                <label
                  className="shrink-0 h-7 w-7 grid place-items-center text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] cursor-pointer mb-0.5"
                  title="Přiložit soubor"
                >
                  <span className="sr-only">Přiložit soubor</span>
                  <Paperclip size={15} aria-hidden />
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => setComposeFiles(Array.from(e.target.files ?? []))}
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!composeBody.trim() && composeFiles.length === 0}
                className="shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white grid place-items-center shadow-md disabled:opacity-40 active:scale-95 transition-transform"
                aria-label="Odeslat zprávu"
              >
                <Send size={16} className="ml-0.5" />
              </button>
            </div>
          </div>
        </main>
      ) : (
      /* ── ALL OTHER TABS: scrollable MobileScreen — key resets scroll on section change ── */
      <MobileScreen
        key={screenKey}
        className={
          tab === "home" && !onPortfolioRoute && !onPaymentsRoute && !onNotificationsRoute && !onProfileRoute
            ? "overflow-x-hidden px-6 pt-3 space-y-8 pb-[calc(var(--aidv-mobile-screen-pad-bottom)+2rem)]"
            : "overflow-x-hidden pb-[calc(var(--aidv-mobile-screen-pad-bottom)+2rem)]"
        }
      >
        {error ? (
          <ErrorState title={error} homeHref={false} onRetry={() => router.refresh()} />
        ) : null}
        {busy ? <LoadingSkeleton rows={2} /> : null}

        {tab === "home" && !onPortfolioRoute && !onPaymentsRoute && !onNotificationsRoute && !onProfileRoute ? (
          <DashboardHome
            initialData={initialData}
            quickStats={quickStats}
            contracts={contracts}
            documents={documents}
            requests={requests}
            notifications={notifications}
            unreadMessagesCount={unreadMessagesCount}
            onNewRequest={() => setRequestModalOpen(true)}
            router={router}
          />
        ) : null}

        {(tab === "documents" || pathname.startsWith("/client/documents")) &&
        !onPortfolioRoute &&
        !onPaymentsRoute &&
        !onNotificationsRoute &&
        !onProfileRoute ? (
          <>
            <section className="min-h-[148px] rounded-[24px] bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-lg">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Zabezpečené úložiště</p>
                  <h2 className="mt-2 text-[26px] font-black">Klientský trezor</h2>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 text-emerald-400 backdrop-blur-md">
                  <Shield size={28} />
                </div>
              </div>
              <p className="mt-4 max-w-[88%] text-[14px] font-medium leading-relaxed text-slate-300">
                Dokumenty od poradce i soubory, které mu nahrajete.
              </p>
            </section>
            <SearchBar value={documentsSearch} onChange={setDocumentsSearch} placeholder="Hledat dokument..." />
            <MobileCard className="p-1">
              <label className="w-full min-h-[52px] rounded-[18px] border border-dashed border-indigo-200 bg-[#f3f5fc] text-[#2a3b7a] text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[.99]">
                <Upload size={16} />
                Nahrát dokument
                <input type="file" className="hidden" onChange={(e) => uploadDocument(e.target.files?.[0] ?? null)} accept=".pdf,.jpg,.jpeg,.png,.webp" />
              </label>
            </MobileCard>
            {filteredDocuments.length === 0 ? (
              <EmptyState title="Žádné dokumenty" description="Nahrané dokumenty se zobrazí v trezoru." />
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map((document) => (
                  <a key={document.id} href={`/api/documents/${document.id}/download`} className="group flex w-full items-center gap-4 rounded-[20px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/60 transition-all active:scale-[.99]">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50 text-slate-400 ring-1 ring-slate-100">
                      <FileText size={22} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[14px] font-bold leading-tight text-slate-900 line-clamp-1">{document.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 break-words text-[12px] font-medium text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        {formatDocumentType(document)} <span className="opacity-50">|</span> {formatDateCs(document.createdAt)}
                      </p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-400 transition-all group-active:bg-indigo-600 group-active:text-white">
                      <Download size={18} />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </>
        ) : null}

        {pathname.startsWith("/client/requests") &&
        !onPortfolioRoute &&
        !onPaymentsRoute &&
        !onNotificationsRoute &&
        !onProfileRoute ? (
          <>
            <FilterChips
              value={requestsFilter}
              onChange={(id) => setRequestsFilter(id as "all" | "mine" | "advisor")}
              options={[
                { id: "all", label: "Vše", badge: requests.length + advisorMaterialRequests.length },
                { id: "mine", label: "Moje", badge: requests.length },
                {
                  id: "advisor",
                  label: "Od poradce",
                  badge: advisorMaterialRequests.filter((r) => r.status !== "done" && r.status !== "closed").length || undefined,
                  tone: "warning",
                },
              ]}
            />

            {/* Klientské požadavky (moje) */}
            {requestsFilter !== "advisor" && (
              filteredRequests.length === 0 && requestsFilter === "mine" ? (
                <EmptyState title="Žádné vlastní požadavky" description="Vytvořte nový požadavek pro poradce." />
              ) : (
                filteredRequests.map((request) => {
                  const canCancel = request.statusKey !== "done" && request.statusKey !== "cancelled";
                  return (
                    <RequestStatusCard
                      key={request.id}
                      title={`${request.title} • ${request.caseTypeLabel}`}
                      description={request.description}
                      statusLabel={request.statusLabel}
                      statusTone={
                        request.statusKey === "done"
                          ? "success"
                          : request.statusKey === "cancelled"
                            ? "warning"
                            : "info"
                      }
                      footer={
                        canCancel ? (
                          <ClientRequestCancelButton
                            requestId={request.id}
                            onAfterCancel={async () => {
                              try {
                                setRequests(await getClientRequests());
                              } catch {
                                /* ignore */
                              }
                            }}
                          />
                        ) : undefined
                      }
                    />
                  );
                })
              )
            )}

            {/* Požadavky od poradce (advisor material requests) */}
            {requestsFilter !== "mine" && (
              filteredMaterialRequests.length === 0 && requestsFilter === "advisor" ? (
                <EmptyState title="Žádné požadavky od poradce" description="Poradce zatím nepožaduje žádné podklady." />
              ) : (
                filteredMaterialRequests.map((mr) => (
                  <button
                    key={mr.id}
                    type="button"
                    onClick={() => router.push(`/client/pozadavky-poradce/${mr.id}`)}
                    className="w-full text-left"
                  >
                    <MobileCard className="p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 grid place-items-center">
                            <ClipboardList size={15} className="text-violet-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">{mr.categoryLabel}</p>
                            <p className="text-sm font-bold text-[color:var(--wp-text)] leading-snug">{mr.title}</p>
                            {mr.dueAt && (
                              <p className="text-[11px] text-[color:var(--wp-text-tertiary)] mt-0.5">
                                Termín: {new Date(mr.dueAt).toLocaleDateString("cs-CZ")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <StatusBadge tone={materialRequestStatusTone(mr.status)}>
                            {materialRequestStatusLabel(mr.status)}
                          </StatusBadge>
                          <ChevronRight size={14} className="text-[color:var(--wp-text-tertiary)]" />
                        </div>
                      </div>
                    </MobileCard>
                  </button>
                ))
              )
            )}

            {/* Prázdný stav pro Vše */}
            {requestsFilter === "all" && filteredRequests.length === 0 && filteredMaterialRequests.length === 0 && (
              <EmptyState title="Žádné požadavky" description="Vytvořte nový požadavek nebo počkejte na podklady od poradce." />
            )}
          </>
        ) : null}

        {onPortfolioRoute ? (
          <PortfolioScreen
            contracts={contracts}
            visibleSourceDocs={initialData.visiblePortfolioSourceDocs}
            fvContractAux={initialData.fvContractAux}
          />
        ) : null}

        {onPaymentsRoute ? (
          <ClientPaymentsView
            paymentInstructions={initialData.paymentInstructions}
            paymentsLoadFailed={initialData.paymentsLoadFailed}
            embeddedInMobileShell
            onModalOpenChange={setPaymentModalOpen}
          />
        ) : null}

        {onNotificationsRoute ? (
          <MobileSection title="Notifikační centrum">
            {notifications.length === 0 ? (
              <EmptyState title="Žádná oznámení" description="Nové zprávy, dokumenty a požadavky od poradce se zobrazí zde." />
            ) : (
              notifications.map((notification) => {
                const { route } = notificationRouteResolved(notification);
                const IconComponent = notificationIcon(notification.type);
                const isUnread = !notification.readAt;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    className="w-full text-left"
                    onClick={async () => {
                      if (isUnread) {
                        await markNotificationAsRead(notification.id);
                        setNotifications((prev) =>
                          prev.map((n) => n.id === notification.id ? { ...n, readAt: new Date() } : n)
                        );
                        setUnreadNotificationsCount((c) => Math.max(0, c - 1));
                      }
                      router.push(route);
                    }}
                  >
                    <MobileCard className={`p-3.5 ${isUnread ? "border-indigo-200 bg-indigo-50/40" : ""}`}>
                      <div className="flex items-start gap-3">
                        <div className={`shrink-0 mt-0.5 w-9 h-9 rounded-xl border grid place-items-center ${isUnread ? "bg-indigo-100 border-indigo-200 text-indigo-600" : "bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"}`}>
                          <IconComponent size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-sm font-bold leading-snug ${isUnread ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text)]"}`}>
                              {notification.title}
                            </p>
                            {isUnread && (
                              <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
                            )}
                          </div>
                          {notification.body ? (
                            <p className="text-xs text-[color:var(--wp-text-secondary)] line-clamp-2">
                              {formatPortalNotificationBody(notification.type, notification.body)}
                            </p>
                          ) : null}
                          <p className="text-[11px] text-[color:var(--wp-text-tertiary)] mt-1">
                            {new Date(notification.createdAt).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        {route && <ChevronRight size={14} className="text-[color:var(--wp-text-tertiary)] shrink-0 mt-1" />}
                      </div>
                    </MobileCard>
                  </button>
                );
              })
            )}
          </MobileSection>
        ) : null}

        {(onProfileRoute || tab === "menu") && !onPortfolioRoute && !onPaymentsRoute && !onNotificationsRoute ? (
          <MobileSection title="Můj účet">
            {/* ── Přehled účtu ── */}
            <MobileCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-black text-base">
                    {`${initialData.profile?.firstName?.[0] ?? ""}${initialData.profile?.lastName?.[0] ?? ""}`.toUpperCase() || "K"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[color:var(--wp-text)] truncate">{initialData.fullName}</p>
                    {profileDraft.email && (
                      <p className="text-xs text-[color:var(--wp-text-secondary)] font-medium truncate">{profileDraft.email}</p>
                    )}
                    {profileDraft.phone && (
                      <p className="text-xs text-[color:var(--wp-text-secondary)] font-medium">{profileDraft.phone}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileEditOpen((v) => !v)}
                  className="shrink-0 min-h-[40px] min-w-[40px] rounded-xl border border-[color:var(--wp-surface-card-border)] grid place-items-center text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors"
                  aria-label="Upravit kontaktní údaje"
                >
                  <Pencil size={15} />
                </button>
              </div>

              {profileEditOpen && (
                <div className="mt-4 space-y-2 border-t border-[color:var(--wp-surface-card-border)] pt-4">
                  <input value={profileDraft.email} onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px] bg-[color:var(--wp-main-scroll-bg)] focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" placeholder="E-mail" />
                  <input value={profileDraft.phone} onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px] bg-[color:var(--wp-main-scroll-bg)] focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" placeholder="Telefon" />
                  <input value={profileDraft.street} onChange={(e) => setProfileDraft((prev) => ({ ...prev, street: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px] bg-[color:var(--wp-main-scroll-bg)] focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" placeholder="Ulice" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={profileDraft.city} onChange={(e) => setProfileDraft((prev) => ({ ...prev, city: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px] bg-[color:var(--wp-main-scroll-bg)] focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" placeholder="Město" />
                    <input value={profileDraft.zip} onChange={(e) => setProfileDraft((prev) => ({ ...prev, zip: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px] bg-[color:var(--wp-main-scroll-bg)] focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" placeholder="PSČ" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await saveProfile();
                        if (ok) setProfileEditOpen(false);
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-black"
                    >
                      Uložit
                    </button>
                    <button type="button" onClick={() => setProfileEditOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)]">
                      Zrušit
                    </button>
                  </div>
                </div>
              )}
            </MobileCard>

            {/* ── Domácnost ── */}
            <MobileSection
              title="Domácnost"
              action={
                <button type="button" onClick={() => setAddMemberOpen(true)} className="min-h-[32px] rounded-lg border border-[color:var(--wp-surface-card-border)] px-2.5 text-xs font-black">
                  + Přidat
                </button>
              }
            >
              {!household || household.members.length === 0 ? (
                <EmptyState title="Domácnost je prázdná" description="Přidejte partnera nebo dítě." />
              ) : (
                household.members.map((member) => {
                  const roleLabel = householdRoleLabel(member.role ?? null);
                  const childLike = isHouseholdChildLikeRole(member.role);
                  return (
                    <MobileCard key={member.id} className="p-3.5 flex items-center gap-3">
                      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${childLike ? "bg-amber-100 text-amber-700" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]"}`}>
                        {`${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[color:var(--wp-text)]">{member.firstName} {member.lastName}</p>
                        <p className="text-xs text-[color:var(--wp-text-secondary)] font-medium">{roleLabel}{member.birthDate ? ` · ${new Date(member.birthDate).getFullYear()}` : ""}</p>
                      </div>
                    </MobileCard>
                  );
                })
              )}
            </MobileSection>

            {/* ── Moduly ── */}
            <MobileSection title="Rychlý přístup">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => router.push("/client/portfolio")} className="min-h-[52px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors">
                  <Briefcase size={16} className="text-indigo-500" /> Portfolio
                </button>
                <button type="button" onClick={() => router.push("/client/notifications")} className="min-h-[52px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors">
                  <Bell size={16} className="text-rose-500" /> Oznámení
                  {unreadNotificationsCount > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-black rounded-full w-4 h-4 grid place-items-center">
                      {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => router.push("/client/payments")} className="min-h-[52px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors">
                  <CreditCard size={16} className="text-emerald-500" /> Platby
                </button>
                <button type="button" onClick={() => router.push("/client/calculators")} className="min-h-[52px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors">
                  <Calculator size={16} className="text-amber-500" /> Kalkulačky
                </button>
              </div>
            </MobileSection>

            {/* ── Odhlásit se ── */}
            <button
              type="button"
              onClick={() => signOutAndRedirectClient(router)}
              className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 text-sm font-black hover:bg-rose-100 transition-all"
            >
              <LogOut size={16} />
              Odhlásit se
            </button>
          </MobileSection>
        ) : null}
      </MobileScreen>
      )} {/* end isMessagesActive conditional */}

      <BottomSheet open={requestModalOpen} onClose={() => setRequestModalOpen(false)} title="Nový požadavek">
        <div className="space-y-3">
          <CustomDropdown
            value={requestCaseType}
            onChange={setRequestCaseType}
            options={[
              { id: "hypotéka", label: "Hypotéka" },
              { id: "investice", label: "Investice" },
              { id: "pojištění", label: "Pojištění" },
              { id: "změna situace", label: "Změna životní situace" },
              { id: "servis smlouvy", label: "Servis smlouvy" },
              { id: "hlášení pojistné události", label: "Hlášení pojistné události" },
              { id: "jiné", label: "Jiné" },
            ]}
          />
          <input
            type="text"
            value={requestSubject}
            onChange={(e) => setRequestSubject(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px]"
            placeholder="Předmět (nepovinné)"
          />
          <textarea rows={4} value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-[16px]" placeholder="Popis požadavku (nepovinné)" />
          <label className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] text-sm font-bold text-[color:var(--wp-text)]">
            Přiložit soubor
            <input
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setRequestFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {requestFiles.length > 0 ? (
            <p className="text-xs text-[color:var(--wp-text-secondary)] px-1">
              {requestFiles.length === 1 ? `1 soubor` : `${requestFiles.length} soubory`}
            </p>
          ) : null}
          <button type="button" onClick={createRequest} className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold">
            Vytvořit požadavek
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={addMemberOpen} onClose={() => setAddMemberOpen(false)} title="Přidat člena domácnosti">
        <div className="space-y-3">
          <CustomDropdown
            value={newMemberRole}
            onChange={setNewMemberRole}
            options={[
              { id: "partner", label: "Partner" },
              { id: "child", label: "Dítě" },
              { id: "member", label: "Jiné" },
            ]}
          />
          <input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px]" placeholder="Jméno a příjmení" />
          <input type="date" value={newMemberBirthDate} onChange={(e) => setNewMemberBirthDate(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-[16px]" />
          <CreateActionButton type="button" onClick={addHouseholdMember} className="min-h-[44px] w-full" icon={null}>
            Přidat člena
          </CreateActionButton>
        </div>
      </BottomSheet>

      <BottomSheet
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        title="Rychlé akce"
      >
        <div className="space-y-3">
          {[
            { label: "Napsat poradci", icon: MessageSquare, onClick: () => router.push("/client/messages") },
            { label: "Nahrát dokument", icon: FileText, onClick: () => router.push("/client/documents") },
            { label: "Vytvořit požadavek", icon: Plus, onClick: () => setRequestModalOpen(true) },
            ...(initialData.advisorBookingPath
              ? [{ label: "Naplánovat schůzku", icon: Calendar, onClick: () => router.push(initialData.advisorBookingPath!) }]
              : []),
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setActionSheetOpen(false);
                  item.onClick();
                }}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-[18px] bg-white px-4 text-left text-[15px] font-black text-slate-900 shadow-sm ring-1 ring-slate-200/70 active:scale-[.99]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f3f5fc] text-[#2a3b7a]">
                  <Icon size={18} />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={notificationsSheetOpen}
        onClose={() => setNotificationsSheetOpen(false)}
        title="Oznámení"
      >
        <div className="space-y-2">
          {notifications.length === 0 ? (
            <EmptyState title="Žádná oznámení" description="Nové zprávy a dokumentové události se zobrazí zde." />
          ) : (
            notifications.slice(0, 6).map((notification) => {
              const { route } = notificationRouteResolved(notification);
              const IconComponent = notificationIcon(notification.type);
              const isUnread = !notification.readAt;
              return (
                <button
                  key={notification.id}
                  type="button"
                  className="w-full text-left"
                  onClick={async () => {
                    if (isUnread) {
                      await markNotificationAsRead(notification.id);
                      setNotifications((prev) =>
                        prev.map((n) => n.id === notification.id ? { ...n, readAt: new Date() } : n),
                      );
                      setUnreadNotificationsCount((c) => Math.max(0, c - 1));
                    }
                    setNotificationsSheetOpen(false);
                    router.push(route);
                  }}
                >
                  <MobileCard className={`p-3.5 ${isUnread ? "border-indigo-200 bg-indigo-50/50" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${isUnread ? "border-indigo-200 bg-indigo-100 text-indigo-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                        <IconComponent size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-black text-[color:var(--wp-text)]">{notification.title}</p>
                        {notification.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--wp-text-secondary)]">
                            {formatPortalNotificationBody(notification.type, notification.body)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-[color:var(--wp-text-tertiary)]">
                          {formatDateCs(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </MobileCard>
                </button>
              );
            })
          )}
          {notifications.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setNotificationsSheetOpen(false);
                router.push("/client/notifications");
              }}
              className="mt-3 min-h-[44px] w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white text-sm font-black text-indigo-700"
            >
              Zobrazit všechna oznámení
            </button>
          ) : null}
        </div>
      </BottomSheet>

      {!isMessagesActive ? (
        <MobileBottomNav
          deviceClass={deviceClass}
          items={navItems}
          activeId={navActiveId}
          onSelect={(id) => navigate(id as TabId)}
          centerFab={{ onClick: () => setActionSheetOpen(true), ariaLabel: "Rychlé akce" }}
          visible={!overlayOpen}
        />
      ) : null}
    </MobileAppShell>
    <ClientMaterialRequestToastStack />
    </>
  );
}
