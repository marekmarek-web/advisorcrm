"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Briefcase,
  FileText,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Plus,
  Send,
  Settings,
  User,
} from "lucide-react";
import {
  createClientPortalRequest,
  getClientRequests,
} from "@/app/actions/client-portal-requests";
import { getContractsByContact, type ContractRow } from "@/app/actions/contracts";
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
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
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
import type { ClientMobileInitialData } from "./client-mobile-initial-data";

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

export function ClientMobileClient({ initialData }: { initialData: ClientMobileInitialData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => toTab(pathname));
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [quickStats] = useState(initialData.quickStats);
  const [requests, setRequests] = useState<ClientRequestItem[]>(initialData.requests);
  const [contracts, setContracts] = useState<ContractRow[]>(initialData.contracts);
  const [documents, setDocuments] = useState<DocumentRow[]>(initialData.documents);
  const [notifications, setNotifications] = useState<PortalNotificationRow[]>(initialData.notifications);
  const [household, setHousehold] = useState<ClientHouseholdDetail | null>(initialData.household);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(initialData.unreadNotificationsCount);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(initialData.unreadMessagesCount);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestCaseType, setRequestCaseType] = useState("hypotéka");
  const [requestDescription, setRequestDescription] = useState("");

  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [messageSearch, setMessageSearch] = useState("");
  const messageBottomRef = useRef<HTMLDivElement>(null);

  const [documentsSearch, setDocumentsSearch] = useState("");
  const [requestsFilter, setRequestsFilter] = useState<"all" | "open" | "done">("all");
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
          description: requestDescription.trim() || null,
        });
        if (!result.success) {
          setError("error" in result ? result.error : "Požadavek se nepodařilo vytvořit.");
          return;
        }
        setRequestModalOpen(false);
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
    if (requestsFilter === "all") return requests;
    if (requestsFilter === "open") return requests.filter((r) => r.statusKey !== "done");
    return requests.filter((r) => r.statusKey === "done");
  }, [requests, requestsFilter]);

  const navItems = [
    { id: "home", label: "Přehled", icon: LayoutDashboard },
    { id: "messages", label: "Zprávy", icon: MessageSquare, badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined },
    { id: "documents", label: "Dokumenty", icon: FileText },
    { id: "requests", label: "Požadavky", icon: ListTodo, badge: requests.filter((r) => r.statusKey !== "done").length || undefined },
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
        {error ? <ErrorState title={error} onRetry={() => router.refresh()} /> : null}
        {busy ? <LoadingSkeleton rows={2} /> : null}

        {tab === "home" && !onPortfolioRoute && !onNotificationsRoute && !onProfileRoute ? (
          <>
            <MobileSection title="Finanční přehled">
              <div className="grid grid-cols-2 gap-2">
                <MobileCard className="p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">AUM</p>
                  <p className="text-lg font-black mt-1">{quickStats.assetsUnderManagement.toLocaleString("cs-CZ")} Kč</p>
                </MobileCard>
                <MobileCard className="p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Měsíční investice</p>
                  <p className="text-lg font-black mt-1">{quickStats.monthlyInvestments.toLocaleString("cs-CZ")} Kč</p>
                </MobileCard>
                <MobileCard className="p-3 col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-black">Krytí rizik</p>
                  <p className="text-lg font-black mt-1">{quickStats.riskCoveragePercent}%</p>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${Math.max(0, Math.min(100, quickStats.riskCoveragePercent))}%` }} />
                  </div>
                </MobileCard>
              </div>
            </MobileSection>

            <MobileSection title="Rychlé akce">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setRequestModalOpen(true)} className="min-h-[52px] rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-bold">
                  Nový požadavek
                </button>
                <button type="button" onClick={() => router.push("/client/messages")} className="min-h-[52px] rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-bold">
                  Napsat poradci
                </button>
                <button type="button" onClick={() => router.push("/client/documents")} className="min-h-[52px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold">
                  Otevřít trezor
                </button>
                <button type="button" onClick={() => router.push("/client/portfolio")} className="min-h-[52px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold">
                  Moje portfolio
                </button>
              </div>
            </MobileSection>
          </>
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
              onChange={(id) => setRequestsFilter(id as "all" | "open" | "done")}
              options={[
                { id: "all", label: "Vše", badge: requests.length },
                { id: "open", label: "Otevřené", badge: requests.filter((r) => r.statusKey !== "done").length, tone: "warning" },
                { id: "done", label: "Dokončené", badge: requests.filter((r) => r.statusKey === "done").length },
              ]}
            />
            {filteredRequests.length === 0 ? (
              <EmptyState title="Žádné požadavky" description="Vytvořte nový požadavek pro poradce." />
            ) : (
              filteredRequests.map((request) => (
                <RequestStatusCard
                  key={request.id}
                  title={`${request.title} • ${request.caseTypeLabel}`}
                  description={request.description}
                  statusLabel={request.statusLabel}
                  done={request.statusKey === "done"}
                />
              ))
            )}
          </>
        ) : null}

        {onPortfolioRoute ? (
          <MobileSection title="Moje portfolio">
            {contracts.length === 0 ? (
              <EmptyState title="Žádné smlouvy" />
            ) : (
              contracts.map((contract) => (
                <MobileCard key={contract.id} className="p-3.5">
                  <p className="text-sm font-bold">{contract.productName || contract.partnerName || "Smlouva"}</p>
                  <p className="text-xs text-slate-500 mt-1">Segment: {contract.segment}</p>
                  <p className="text-xs text-slate-500">
                    {contract.premiumAnnual ? `${Number(contract.premiumAnnual).toLocaleString("cs-CZ")} Kč ročně` : "—"}
                  </p>
                </MobileCard>
              ))
            )}
          </MobileSection>
        ) : null}

        {onNotificationsRoute ? (
          <MobileSection title="Oznámení">
            {notifications.length === 0 ? (
              <EmptyState title="Žádná oznámení" />
            ) : (
              notifications.map((notification) => (
                <MobileCard key={notification.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{notification.title}</p>
                      {notification.body ? <p className="text-xs text-slate-500 mt-1">{notification.body}</p> : null}
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(notification.createdAt).toLocaleString("cs-CZ")}
                      </p>
                    </div>
                    {!notification.readAt ? (
                      <button
                        type="button"
                        onClick={() => markNotificationAsRead(notification.id)}
                        className="min-h-[32px] rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
                      >
                        Přečíst
                      </button>
                    ) : (
                      <StatusBadge tone="success">read</StatusBadge>
                    )}
                  </div>
                </MobileCard>
              ))
            )}
          </MobileSection>
        ) : null}

        {onProfileRoute || tab === "menu" ? (
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
          <button type="button" onClick={addHouseholdMember} className="w-full min-h-[44px] rounded-xl bg-aidv-create text-white text-sm font-bold">
            Přidat člena
          </button>
        </div>
      </BottomSheet>

      <button
        type="button"
        onClick={() => {
          if (tab === "requests") setRequestModalOpen(true);
          else if (tab === "messages") setComposeBody((prev) => prev || "Dobrý den, ");
          else router.push("/client/requests/new");
        }}
        className="fixed z-40 right-4 bottom-[calc(90px+var(--safe-area-bottom))] min-h-[52px] min-w-[52px] rounded-full bg-indigo-600 text-white shadow-lg"
        aria-label="Nová akce"
        title="Nová akce"
      >
        <Plus size={22} className="mx-auto" />
      </button>

      <MobileBottomNav items={navItems} activeId={tab} onSelect={(id) => navigate(id as TabId)} />

      <AiSupportButton anchorClassName="bottom-[calc(168px+var(--safe-area-bottom,0px))] right-4 max-[380px]:right-3" />
    </MobileAppShell>
  );
}
