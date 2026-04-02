"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bell,
  Briefcase,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Shield,
  TrendingUp,
  User,
} from "lucide-react";
import {
  createClientPortalRequest,
  getClientRequests,
} from "@/app/actions/client-portal-requests";
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
import {
  aggregatePortfolioMetrics,
  PORTFOLIO_GROUP_LABELS,
  segmentToPortfolioGroup,
  type PortfolioUiGroup,
} from "@/lib/client-portfolio/read-model";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import {
  getMessages,
  getUnreadAdvisorMessagesForClientCount,
  markMessagesRead,
  sendMessageWithAttachments,
  type MessageRow,
} from "@/app/actions/messages";
import { clientUpdateProfile } from "@/app/actions/contacts";
import { addHouseholdMemberFromClient, getClientHouseholdForContact, type ClientHouseholdDetail } from "@/app/actions/households";
import type { ClientRequestItem } from "@/app/lib/client-portal/request-types";
import {
  BottomSheet,
  ChatMessageBubble,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingSkeleton,
  MobileDocumentItem,
  MobileAppShell,
  MobileBottomNav,
  MobileCard,
  MobileHeader,
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
import type { MaterialRequestListItem } from "@/lib/advisor-material-requests/display";
import { isClientPortalAiDisabled } from "@/lib/client-portal/feature-flags";
import type { ClientMobileInitialData } from "./client-mobile-initial-data";

function fmtMoney(v: number): string {
  return `${v.toLocaleString("cs-CZ")} Kč`;
}

function materialRequestStatusLabel(status: string): string {
  const m: Record<string, string> = {
    new: "Nový",
    seen: "Zobrazeno",
    answered: "Odpovězeno",
    needs_more: "Potřeba doplnit",
    done: "Vyřízeno",
    closed: "Uzavřeno",
  };
  return m[status] ?? status;
}

function materialRequestStatusTone(status: string): "success" | "warning" | "info" {
  if (status === "done" || status === "closed") return "success";
  if (status === "needs_more") return "warning";
  return "info";
}

function notificationRoute(n: { type: string; relatedEntityType: string | null; relatedEntityId: string | null }): string | null {
  if (n.type === "new_message") return "/client/messages";
  if (n.type === "new_document") return "/client/documents";
  if (n.type === "advisor_material_request") {
    return n.relatedEntityId
      ? `/client/pozadavky-poradce/${n.relatedEntityId}`
      : "/client/pozadavky-poradce";
  }
  if (n.type === "request_status_change") return "/client/requests";
  return null;
}

function notificationIcon(type: string) {
  if (type === "new_message") return MessageSquare;
  if (type === "new_document") return FileText;
  if (type === "advisor_material_request") return ClipboardList;
  if (type === "request_status_change") return CheckCircle2;
  if (type === "important_date") return Calendar;
  return Bell;
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
  const openRequests = requests.filter(
    (r) => r.statusKey !== "done" && r.statusKey !== "cancelled"
  );
  const unreadNotifications = notifications.filter((n) => !n.readAt);
  const latestDocs = documents.slice(0, 3);
  const hasPayments = initialData.paymentInstructions.length > 0;

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
        <MobileCard className="p-5 bg-gradient-to-br from-slate-800 to-slate-900 text-white border-slate-700/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Přístup aktivní</span>
          </div>
          <h2 className="text-xl font-black mb-1">Vítejte, {initialData.profile?.firstName || "Kliente"}</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Vaše klientská zóna je připravená. Najdete tu dokumenty, zprávy a vše důležité od poradce.
          </p>
        </MobileCard>

        {initialData.advisor && (
          <MobileCard className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-black shrink-0">
              {initialData.advisor.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Váš poradce</p>
              <p className="text-sm font-bold text-slate-900 truncate">{initialData.advisor.fullName}</p>
              {initialData.advisor.email && <p className="text-xs text-slate-500 truncate">{initialData.advisor.email}</p>}
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
                  <p className="text-sm font-bold text-slate-900 line-clamp-1">{item.label}</p>
                  {item.detail && <p className="text-xs text-slate-500 line-clamp-1">{item.detail}</p>}
                </div>
                <ChevronRight size={14} className="shrink-0 text-slate-400" />
              </button>
            ))}
          </MobileSection>
        )}

        <MobileSection title="Co můžete udělat">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => router.push("/client/messages")} className="min-h-[52px] rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-bold">
              Napsat poradci
            </button>
            <button type="button" onClick={onNewRequest} className="min-h-[52px] rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-bold">
              Nový požadavek
            </button>
            <button type="button" onClick={() => router.push("/client/documents")} className="min-h-[52px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold">
              Dokumenty
            </button>
            <button type="button" onClick={() => router.push("/client/profile")} className="min-h-[52px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold">
              Můj profil
            </button>
          </div>
        </MobileSection>

        <p className="text-xs text-slate-400 font-medium px-1 leading-relaxed">
          Jakmile váš poradce přidá smlouvy a dokumenty, zobrazí se zde automaticky.
        </p>
      </>
    );
  }

  return (
    <>
      {/* A. Uvítání + poradce */}
      <MobileCard className="p-4">
        <div className="flex items-center gap-3">
          {initialData.advisor ? (
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-black shrink-0">
              {initialData.advisor.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">
              Dobrý den, {initialData.profile?.firstName || "Kliente"}
            </p>
            {initialData.advisor && (
              <p className="text-xs text-slate-500 truncate">
                Poradce: {initialData.advisor.fullName}
              </p>
            )}
          </div>
          <button type="button" onClick={() => router.push("/client/messages")} className="relative shrink-0 min-h-[40px] min-w-[40px] rounded-xl border border-indigo-200 bg-indigo-50 grid place-items-center text-indigo-600">
            <MessageSquare size={16} />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 text-center">
                {unreadMessagesCount > 9 ? "9+" : unreadMessagesCount}
              </span>
            )}
          </button>
        </div>
      </MobileCard>

      {/* B. Finanční přehled */}
      <MobileSection title="Finanční přehled">
        <div className="grid grid-cols-3 gap-2">
          <MobileCard className="p-3">
            <TrendingUp size={14} className="text-emerald-500 mb-1" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Investice / m</p>
            <p className="text-base font-black mt-0.5">{fmtMoney(quickStats.monthlyInvestments)}</p>
          </MobileCard>
          <MobileCard className="p-3">
            <Shield size={14} className="text-amber-500 mb-1" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Pojistné / m</p>
            <p className="text-base font-black mt-0.5">{fmtMoney(quickStats.monthlyInsurancePremiums)}</p>
          </MobileCard>
          <MobileCard className="p-3">
            <Briefcase size={14} className="text-indigo-500 mb-1" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Smlouvy</p>
            <p className="text-base font-black mt-0.5">{quickStats.activeContractCount}</p>
          </MobileCard>
        </div>
      </MobileSection>

      {/* C. Prioritní blok — „Co je potřeba řešit" */}
      {actionItems.length > 0 && (
        <MobileSection title="Co je potřeba řešit">
          {actionItems.map((item, i) => (
            <button key={i} type="button" onClick={item.onClick} className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-left">
              <AlertCircle size={16} className="shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 line-clamp-1">{item.label}</p>
                {item.detail && <p className="text-xs text-slate-500 line-clamp-1">{item.detail}</p>}
              </div>
              <ChevronRight size={14} className="shrink-0 text-slate-400" />
            </button>
          ))}
        </MobileSection>
      )}

      {/* D. Rychlé akce */}
      <MobileSection title="Rychlé akce">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onNewRequest} className="min-h-[52px] rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-bold inline-flex items-center justify-center gap-1.5">
            <Plus size={15} /> Nový požadavek
          </button>
          <button type="button" onClick={() => router.push("/client/messages")} className="min-h-[52px] rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-bold inline-flex items-center justify-center gap-1.5">
            <MessageSquare size={15} /> Napsat poradci
          </button>
          <button type="button" onClick={() => router.push("/client/documents")} className="min-h-[52px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold inline-flex items-center justify-center gap-1.5">
            <FolderOpen size={15} /> Trezor dokumentů
          </button>
          <button type="button" onClick={() => router.push("/client/portfolio")} className="min-h-[52px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold inline-flex items-center justify-center gap-1.5">
            <Briefcase size={15} /> Moje portfolio
          </button>
          {hasPayments && (
            <button type="button" onClick={() => router.push("/client/payments")} className="min-h-[52px] col-span-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold inline-flex items-center justify-center gap-1.5">
              <CreditCard size={15} /> Platby a instrukce
            </button>
          )}
        </div>
      </MobileSection>

      {/* E. Modulární obsah */}
      {openRequests.length > 0 && (
        <MobileSection
          title="Aktivní požadavky"
          action={
            <button type="button" onClick={() => router.push("/client/requests")} className="text-xs font-bold text-indigo-600">
              Vše
            </button>
          }
        >
          {openRequests.slice(0, 3).map((r) => (
            <MobileCard key={r.id} className="p-3 flex items-center gap-3">
              <ListTodo size={16} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 line-clamp-1">{r.title}</p>
                <p className="text-xs text-slate-500">{r.caseTypeLabel} · {r.statusLabel}</p>
              </div>
            </MobileCard>
          ))}
        </MobileSection>
      )}

      {latestDocs.length > 0 && (
        <MobileSection
          title="Poslední dokumenty"
          action={
            <button type="button" onClick={() => router.push("/client/documents")} className="text-xs font-bold text-indigo-600">
              Vše
            </button>
          }
        >
          {latestDocs.map((d) => (
            <MobileCard key={d.id} className="p-3 flex items-center gap-3">
              <FileText size={16} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 line-clamp-1">{d.name}</p>
                <p className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleDateString("cs-CZ")}</p>
              </div>
              <a href={`/api/documents/${d.id}/download`} className="shrink-0 text-xs font-bold text-indigo-600">
                Stáhnout
              </a>
            </MobileCard>
          ))}
        </MobileSection>
      )}
    </>
  );
}

type TabId = "home" | "messages" | "documents" | "requests" | "menu";

function toTab(pathname: string): TabId {
  if (pathname.startsWith("/client/messages")) return "messages";
  if (pathname.startsWith("/client/documents")) return "documents";
  if (pathname.startsWith("/client/requests")) return "requests";
  if (
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

function statusLabel(portfolioStatus: string, startDate: string | null): string {
  if (portfolioStatus === "ended") return "Ukončené";
  if (!startDate) return "V evidenci";
  return "Aktivní";
}

function formatMoneyLine(monthly: string | null, annual: string | null): string {
  const m = Number(monthly ?? "");
  const y = Number(annual ?? "");
  if (Number.isFinite(y) && y > 0) return `${y.toLocaleString("cs-CZ")} Kč / rok`;
  if (Number.isFinite(m) && m > 0) return `${m.toLocaleString("cs-CZ")} Kč / měs.`;
  return "Dle smlouvy";
}

function PortfolioScreen({ contracts }: { contracts: ClientMobileInitialData["contracts"] }) {
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
    }))
  );

  const grouped = new Map<PortfolioUiGroup, typeof contracts>();
  for (const c of contracts) {
    const g = segmentToPortfolioGroup(c.segment, c.portfolioAttributes);
    const list = grouped.get(g) ?? [];
    list.push(c);
    grouped.set(g, list);
  }

  return (
    <>
      {/* KPI dlaždice — stejný zdroj jako web */}
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
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Položek</p>
          <p className="text-base font-black mt-0.5">{metrics.activeContractCount}</p>
        </MobileCard>
      </div>

      {/* Skupiny dle read-modelu */}
      {GROUP_ORDER.map((groupKey) => {
        const items = grouped.get(groupKey);
        if (!items?.length) return null;
        return (
          <MobileSection key={groupKey} title={PORTFOLIO_GROUP_LABELS[groupKey]}>
            {items.map((contract) => {
              const st = statusLabel(contract.portfolioStatus, contract.startDate);
              const stTone =
                st === "Aktivní"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : st === "Ukončené"
                    ? "bg-slate-100 text-slate-600 border-slate-200"
                    : "bg-amber-50 text-amber-800 border-amber-100";
              return (
                <MobileCard key={contract.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                        {contract.productName || "Produkt"}
                      </p>
                      {contract.partnerName && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{contract.partnerName}</p>
                      )}
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider ${stTone}`}>
                      {st}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Platba</p>
                      <p className="font-bold text-slate-900">{formatMoneyLine(contract.premiumAmount, contract.premiumAnnual)}</p>
                    </div>
                    {contract.contractNumber && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Číslo smlouvy</p>
                        <p className="font-mono text-slate-700 truncate">{contract.contractNumber}</p>
                      </div>
                    )}
                    {contract.startDate && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Od</p>
                        <p className="font-bold text-slate-700">{new Date(contract.startDate).toLocaleDateString("cs-CZ")}</p>
                      </div>
                    )}
                    {contract.anniversaryDate && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Výročí</p>
                        <p className="font-bold text-slate-700">{new Date(contract.anniversaryDate).toLocaleDateString("cs-CZ")}</p>
                      </div>
                    )}
                  </div>
                  {contract.sourceDocumentId && (
                    <a
                      href={`/api/documents/${contract.sourceDocumentId}/download`}
                      className="mt-2.5 inline-flex min-h-[36px] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-700"
                    >
                      Zobrazit dokument
                    </a>
                  )}
                </MobileCard>
              );
            })}
          </MobileSection>
        );
      })}
    </>
  );
}

export function ClientMobileClient({ initialData }: { initialData: ClientMobileInitialData }) {
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

  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(initialData.unreadNotificationsCount);
  // exposed via setter used in notification tap handler above
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(initialData.unreadMessagesCount);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestCaseType, setRequestCaseType] = useState("hypotéka");
  const [requestSubject, setRequestSubject] = useState("");
  const [requestDescription, setRequestDescription] = useState("");

  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [messageSearch, setMessageSearch] = useState("");
  const messageBottomRef = useRef<HTMLDivElement>(null);

  const [documentsSearch, setDocumentsSearch] = useState("");
  const [requestsFilter, setRequestsFilter] = useState<"all" | "mine" | "advisor">("all");
  const [profileDraft, setProfileDraft] = useState({
    email: initialData.profile?.email ?? "",
    phone: initialData.profile?.phone ?? "",
    street: initialData.profile?.street ?? "",
    city: initialData.profile?.city ?? "",
    zip: initialData.profile?.zip ?? "",
  });
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("partner");
  const [newMemberBirthDate, setNewMemberBirthDate] = useState("");

  const onPortfolioRoute = pathname.startsWith("/client/portfolio") || pathname.startsWith("/client/contracts");
  const onNotificationsRoute = pathname.startsWith("/client/notifications");
  const onProfileRoute = pathname.startsWith("/client/profile");

  useEffect(() => {
    setTab(toTab(pathname));
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/client/requests") && toTab(pathname) !== "requests") return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/client/messages")) return;
    startTransition(async () => {
      try {
        const next = await getMessages(initialData.contactId);
        setMessages(next);
        await markMessagesRead(initialData.contactId);
        const unread = await getUnreadAdvisorMessagesForClientCount();
        setUnreadMessagesCount(unread);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Zprávy se nepodařilo načíst.");
      }
    });
  }, [pathname, initialData.contactId]);

  useEffect(() => {
    messageBottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    setTab(next);
    if (next === "home") router.push("/client");
    else if (next === "messages") router.push("/client/messages");
    else if (next === "documents") router.push("/client/documents");
    else if (next === "requests") router.push("/client/requests");
    else router.push("/client/profile");
  }

  async function createRequest() {
    startTransition(async () => {
      setError(null);
      try {
        const result = await createClientPortalRequest({
          caseType: requestCaseType,
          subject: requestSubject.trim() || null,
          description: requestDescription.trim() || null,
        });
        if (!result.success) {
          setError("error" in result ? result.error : "Požadavek se nepodařilo vytvořit.");
          return;
        }
        setRequestModalOpen(false);
        setRequestSubject("");
        setRequestDescription("");
        setRequests(await getClientRequests());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Požadavek se nepodařilo vytvořit.");
      }
    });
  }

  async function sendMessage() {
    const trimmed = composeBody.trim();
    if (!trimmed) return;
    startTransition(async () => {
      setError(null);
      try {
        const formData = new FormData();
        formData.set("body", trimmed);
        for (const file of composeFiles) formData.append("files", file);
        await sendMessageWithAttachments(initialData.contactId, formData);
        setComposeBody("");
        setComposeFiles([]);
        const next = await getMessages(initialData.contactId);
        setMessages(next);
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

  async function saveProfile() {
    startTransition(async () => {
      setError(null);
      try {
        await clientUpdateProfile(profileDraft);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Profil se nepodařilo uložit.");
      }
    });
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

  const filteredMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.body.toLowerCase().includes(q));
  }, [messages, messageSearch]);

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

  const openRequestCount = useMemo(
    () =>
      requests.filter((r) => r.statusKey !== "done" && r.statusKey !== "cancelled").length +
      advisorMaterialRequests.filter((r) => r.status !== "done" && r.status !== "closed").length,
    [requests, advisorMaterialRequests]
  );

  const navItems = [
    { id: "home", label: "Přehled", icon: LayoutDashboard },
    { id: "messages", label: "Zprávy", icon: MessageSquare, badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined },
    { id: "documents", label: "Dokumenty", icon: FileText },
    { id: "requests", label: "Požadavky", icon: ListTodo, badge: openRequestCount || undefined },
    { id: "menu", label: "Profil", icon: User, badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined },
  ];

  const headerTitle = onPortfolioRoute
    ? "Portfolio"
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
              : tab === "requests"
                ? "Požadavky"
                : "Profil";

  const headerSubtitle = onNotificationsRoute
    ? "Notifikační centrum"
    : onPortfolioRoute
      ? "Smlouvy a segmenty"
      : initialData.advisor?.fullName
        ? `Poradce: ${initialData.advisor.fullName}`
        : initialData.fullName;

  return (
    <>
    <MobileAppShell>
      <MobileHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        right={
          <button
            type="button"
            onClick={() => router.push("/client/notifications")}
            className="relative min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center"
            aria-label="Notifikace"
          >
            <Bell size={18} />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 text-center">
                {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
              </span>
            ) : null}
          </button>
        }
      />

      <MobileScreen>
        {error ? (
          <ErrorState title={error} homeHref={false} onRetry={() => router.refresh()} />
        ) : null}
        {busy ? <LoadingSkeleton rows={2} /> : null}

        {tab === "home" && !onPortfolioRoute && !onNotificationsRoute && !onProfileRoute ? (
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

        {(tab === "messages" || pathname.startsWith("/client/messages")) && !onPortfolioRoute && !onNotificationsRoute && !onProfileRoute ? (
          <>
            <SearchBar value={messageSearch} onChange={setMessageSearch} placeholder="Hledat ve zprávách..." />
            {filteredMessages.length === 0 ? (
              <EmptyState title="Žádné zprávy" description="Zatím zde není žádná konverzace." />
            ) : (
              filteredMessages.map((message) => {
                const isClient = message.senderType === "client";
                return (
                  <ChatMessageBubble
                    key={message.id}
                    own={isClient}
                    body={message.body}
                    timestamp={new Date(message.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                  />
                );
              })
            )}
            <div ref={messageBottomRef} />
            <MobileCard className="p-3">
              <textarea
                rows={3}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Napište zprávu…"
              />
              <label className="mt-2 inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 px-3 text-xs font-bold cursor-pointer">
                Přidat přílohu
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setComposeFiles(Array.from(e.target.files ?? []))}
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                />
              </label>
              {composeFiles.length > 0 ? <p className="mt-1 text-[11px] text-slate-500">{composeFiles.length} příloh</p> : null}
              <button type="button" onClick={sendMessage} className="mt-3 w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2">
                <Send size={16} />
                Odeslat zprávu
              </button>
            </MobileCard>
          </>
        ) : null}

        {(tab === "documents" || pathname.startsWith("/client/documents")) && !onPortfolioRoute && !onNotificationsRoute && !onProfileRoute ? (
          <>
            <SearchBar value={documentsSearch} onChange={setDocumentsSearch} placeholder="Hledat dokument..." />
            <MobileCard>
              <label className="w-full min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-700 text-sm font-bold inline-flex items-center justify-center cursor-pointer">
                Nahrát dokument
                <input type="file" className="hidden" onChange={(e) => uploadDocument(e.target.files?.[0] ?? null)} accept=".pdf,.jpg,.jpeg,.png,.webp" />
              </label>
            </MobileCard>
            {filteredDocuments.length === 0 ? (
              <EmptyState title="Žádné dokumenty" description="Nahrané dokumenty se zobrazí v trezoru." />
            ) : (
              filteredDocuments.map((document) => (
                <MobileDocumentItem
                  key={document.id}
                  title={document.name}
                  subtitle={new Date(document.createdAt).toLocaleDateString("cs-CZ")}
                  action={
                    <a href={`/api/documents/${document.id}/download`} className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700">
                      Stáhnout
                    </a>
                  }
                />
              ))
            )}
          </>
        ) : null}

        {(tab === "requests" || pathname.startsWith("/client/requests")) && !onPortfolioRoute && !onNotificationsRoute && !onProfileRoute ? (
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
                            <p className="text-sm font-bold text-slate-900 leading-snug">{mr.title}</p>
                            {mr.dueAt && (
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Termín: {new Date(mr.dueAt).toLocaleDateString("cs-CZ")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <StatusBadge tone={materialRequestStatusTone(mr.status)}>
                            {materialRequestStatusLabel(mr.status)}
                          </StatusBadge>
                          <ChevronRight size={14} className="text-slate-400" />
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
          <PortfolioScreen contracts={contracts} />
        ) : null}

        {onNotificationsRoute ? (
          <MobileSection title="Notifikační centrum">
            {notifications.length === 0 ? (
              <EmptyState title="Žádná oznámení" description="Nové zprávy, dokumenty a požadavky od poradce se zobrazí zde." />
            ) : (
              notifications.map((notification) => {
                const route = notificationRoute(notification);
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
                      if (route) router.push(route);
                    }}
                  >
                    <MobileCard className={`p-3.5 ${isUnread ? "border-indigo-200 bg-indigo-50/40" : ""}`}>
                      <div className="flex items-start gap-3">
                        <div className={`shrink-0 mt-0.5 w-9 h-9 rounded-xl border grid place-items-center ${isUnread ? "bg-indigo-100 border-indigo-200 text-indigo-600" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
                          <IconComponent size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-sm font-bold leading-snug ${isUnread ? "text-slate-900" : "text-slate-700"}`}>
                              {notification.title}
                            </p>
                            {isUnread && (
                              <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
                            )}
                          </div>
                          {notification.body ? (
                            <p className="text-xs text-slate-500 line-clamp-2">
                              {formatPortalNotificationBody(notification.type, notification.body)}
                            </p>
                          ) : null}
                          <p className="text-[11px] text-slate-400 mt-1">
                            {new Date(notification.createdAt).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        {route && <ChevronRight size={14} className="text-slate-400 shrink-0 mt-1" />}
                      </div>
                    </MobileCard>
                  </button>
                );
              })
            )}
          </MobileSection>
        ) : null}

        {(onProfileRoute || tab === "menu") && !onPortfolioRoute && !onNotificationsRoute ? (
          <MobileSection title="Profil a domácnost">
            <MobileCard>
              <p className="text-sm font-bold">{initialData.fullName}</p>
              <p className="text-xs text-slate-500 mt-1">Nastavení klientského profilu</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ProfileFieldRow label="E-mail" value={profileDraft.email} />
                <ProfileFieldRow label="Telefon" value={profileDraft.phone} />
              </div>
            </MobileCard>
            <MobileCard className="space-y-2">
              <input value={profileDraft.email} onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="E-mail" />
              <input value={profileDraft.phone} onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Telefon" />
              <input value={profileDraft.street} onChange={(e) => setProfileDraft((prev) => ({ ...prev, street: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Ulice" />
              <div className="grid grid-cols-2 gap-2">
                <input value={profileDraft.city} onChange={(e) => setProfileDraft((prev) => ({ ...prev, city: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Město" />
                <input value={profileDraft.zip} onChange={(e) => setProfileDraft((prev) => ({ ...prev, zip: e.target.value }))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="PSČ" />
              </div>
              <button type="button" onClick={saveProfile} className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold">
                Uložit profil
              </button>
            </MobileCard>

            <MobileSection
              title="Domácnost"
              action={
                <button type="button" onClick={() => setAddMemberOpen(true)} className="min-h-[32px] rounded-lg border border-slate-200 px-2.5 text-xs font-bold">
                  Přidat člena
                </button>
              }
            >
              {!household || household.members.length === 0 ? (
                <EmptyState title="Domácnost je prázdná" />
              ) : (
                household.members.map((member) => (
                  <MobileCard key={member.id} className="p-3.5">
                    <p className="text-sm font-bold">{member.firstName} {member.lastName}</p>
                    <p className="text-xs text-slate-500 mt-1">{member.role || "member"}</p>
                  </MobileCard>
                ))
              )}
            </MobileSection>

            <MobileSection title="Další moduly">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => router.push("/client/portfolio")} className="min-h-[48px] rounded-xl border border-slate-200 text-sm font-bold inline-flex items-center justify-center gap-2">
                  <Briefcase size={16} /> Portfolio
                </button>
                <button type="button" onClick={() => router.push("/client/notifications")} className="min-h-[48px] rounded-xl border border-slate-200 text-sm font-bold inline-flex items-center justify-center gap-2">
                  <Settings size={16} /> Oznámení
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/client/calculators")}
                  className="min-h-[48px] col-span-2 rounded-xl border border-slate-200 text-sm font-bold inline-flex items-center justify-center gap-2"
                >
                  <Calculator size={16} /> Kalkulačky
                </button>
              </div>
            </MobileSection>
          </MobileSection>
        ) : null}
      </MobileScreen>

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
              { id: "jiné", label: "Jiné" },
            ]}
          />
          <input
            type="text"
            value={requestSubject}
            onChange={(e) => setRequestSubject(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="Předmět (nepovinné)"
          />
          <textarea rows={4} value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Popis požadavku (nepovinné)" />
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
          <input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Jméno a příjmení" />
          <input type="date" value={newMemberBirthDate} onChange={(e) => setNewMemberBirthDate(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" />
          <CreateActionButton type="button" onClick={addHouseholdMember} className="min-h-[44px] w-full" icon={null}>
            Přidat člena
          </CreateActionButton>
        </div>
      </BottomSheet>

      {/* FAB: visible only on tabs where it has clear meaning (home, messages, requests, documents) */}
      {!onPortfolioRoute && !onNotificationsRoute && !onProfileRoute && tab !== "menu" ? (
        <button
          type="button"
          onClick={() => {
            if (tab === "requests") setRequestModalOpen(true);
            else if (tab === "messages") setComposeBody((prev) => prev || "Dobrý den, ");
            else setRequestModalOpen(true);
          }}
          className="fixed z-40 right-4 bottom-[calc(90px+var(--safe-area-bottom))] min-h-[52px] min-w-[52px] rounded-full bg-indigo-600 text-white shadow-lg"
          aria-label="Nový požadavek"
          title="Nový požadavek"
        >
          <Plus size={22} className="mx-auto" />
        </button>
      ) : null}

      <MobileBottomNav items={navItems} activeId={tab} onSelect={(id) => navigate(id as TabId)} />

      {!isClientPortalAiDisabled() ? (
        <AiSupportButton anchorClassName="bottom-[calc(168px+var(--safe-area-bottom,0px))] right-4 max-[380px]:right-3" />
      ) : null}
    </MobileAppShell>
    <ClientMaterialRequestToastStack />
    </>
  );
}
