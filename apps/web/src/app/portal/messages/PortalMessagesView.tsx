"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getConversationsList,
  loadThreadMessages,
  loadThreadAttachmentsByContact,
  getChatContextPanelSnapshot,
  sendPortalMessage,
  sendPortalMessageWithAttachments,
  deleteConversationForContact,
  deleteMessageForAdvisor,
  type ChatContextPanelSnapshot,
  type MessageRow,
  type ConversationListItem,
  type MessageAttachmentRow,
} from "@/app/actions/messages";
import { getContact, getContactsList, type ContactRow } from "@/app/actions/contacts";
import { getOpenOpportunitiesList } from "@/app/actions/pipeline";
import { generateAdvisorChatContextSummary, generateAdvisorChatReplyDraft } from "@/app/actions/advisor-chat-ai";
import type { AdvisorChatAiSummary } from "@/lib/advisor-chat/advisor-chat-ai-types";
import { queryKeys } from "@/lib/query-keys";
import { ConversationList } from "./components/ConversationList";
import { ConversationHeader } from "./components/ConversationHeader";
import { ConversationQuickActions } from "./components/ConversationQuickActions";
import { MessageThread } from "./components/MessageThread";
import { MessageComposer } from "./components/MessageComposer";
import { ConversationContextPanel } from "./components/ConversationContextPanel";
import { useConfirm } from "@/app/components/ConfirmDialog";

const ChatModal = dynamic(
  () => import("./components/ChatModal").then((m) => ({ default: m.ChatModal })),
  { ssr: false },
);
const NewAdvisorActionsMenu = dynamic(
  () => import("./components/NewAdvisorActionsMenu").then((m) => ({ default: m.NewAdvisorActionsMenu })),
  { ssr: false },
);
const ChatQuickScheduleOverlay = dynamic(
  () => import("./components/ChatQuickScheduleOverlay").then((m) => ({ default: m.ChatQuickScheduleOverlay })),
  { ssr: false },
);
const ChatQuickTaskOverlay = dynamic(
  () => import("./components/ChatQuickTaskOverlay").then((m) => ({ default: m.ChatQuickTaskOverlay })),
  { ssr: false },
);
import { buildChatTaskDescriptionSeed, buildChatTaskSuggestedTitle } from "./components/chat-task-defaults";
import { formatLastActiveLabel, presenceFromLastMessageAt } from "./components/chat-format";
import { mergeConversationsWithSelection } from "./components/merge-conversations-with-selection";
import { getActionFriendlyErrorMessage } from "@/lib/observability/production-error-ui";
import { shouldAutoRunAdvisorChatAiSummary } from "@/lib/advisor-chat/advisor-chat-summary-gating";

const POLL_INTERVAL = 10_000;
/** Po opakovaných pollech bez změny dat prodloužit interval (šetří requesty). */
const POLL_INTERVAL_SLOW = 25_000;
const POLL_BACKOFF_AFTER = 3;

function humanMessageError(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message === "Forbidden") return "K této konverzaci nemáte přístup.";
  return getActionFriendlyErrorMessage(e, e instanceof Error ? e.message : fallback);
}

export function PortalMessagesView({ initialContactId }: { initialContactId: string | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const conversationsRef = useRef<ConversationListItem[]>([]);
  const pollStableRef = useRef(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const conversationsSearchKey = debouncedSearch;
  const {
    data: conversations = [],
    isPending: conversationsLoading,
    error: conversationsQueryError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: queryKeys.portalMessages.conversations(conversationsSearchKey),
    queryFn: async () => {
      const outcome = await getConversationsList(conversationsSearchKey || undefined);
      if (!outcome.ok) throw new Error(outcome.error);
      return outcome.list;
    },
    staleTime: 30_000,
    refetchInterval: () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return false;
      return pollStableRef.current >= POLL_BACKOFF_AFTER ? POLL_INTERVAL_SLOW : POLL_INTERVAL;
    },
  });

  const conversationsError =
    conversationsQueryError instanceof Error
      ? conversationsQueryError.message
      : conversationsQueryError
        ? String(conversationsQueryError)
        : null;

  const [selectedContactId, setSelectedContactId] = useState<string | null>(initialContactId);
  const [contactName, setContactName] = useState("");
  const [contactDetail, setContactDetail] = useState<ContactRow | null>(null);

  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  const [msgAttachments, setMsgAttachments] = useState<Record<string, MessageAttachmentRow[]>>({});
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactRow[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [meetingSheetOpen, setMeetingSheetOpen] = useState(false);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [crmSnapshot, setCrmSnapshot] = useState<ChatContextPanelSnapshot | null>(null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<AdvisorChatAiSummary | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);
  const [aiDraftText, setAiDraftText] = useState("");
  const [crmSnapshotNonce, setCrmSnapshotNonce] = useState(0);

  /** Brání opakovanému LLM volání, pokud se vlákno reálně nezměnilo. */
  const aiSummaryThreadSigRef = useRef<string | null>(null);
  const aiSummaryLastRunAtRef = useRef<number>(0);
  const AI_SUMMARY_COOLDOWN_MS = 60_000;

  const pickerContactsEnabled =
    (meetingSheetOpen || taskSheetOpen) && Boolean(selectedContactId);
  const { data: pickerContacts = [], isPending: pickerContactsLoading } = useQuery({
    queryKey: queryKeys.contacts.list(),
    queryFn: getContactsList,
    enabled: pickerContactsEnabled,
    staleTime: 120_000,
  });

  const { data: taskOpportunities = [], isPending: taskOpportunitiesLoading } = useQuery({
    queryKey: queryKeys.pipeline.openListWithContact,
    queryFn: async () => {
      try {
        return await getOpenOpportunitiesList();
      } catch {
        return [] as Awaited<ReturnType<typeof getOpenOpportunitiesList>>;
      }
    },
    enabled: taskSheetOpen && Boolean(selectedContactId),
    staleTime: 120_000,
  });

  const suggestedMeetingTitle = useMemo(() => {
    const name = (contactName || "Klient").trim();
    const oppTitle = crmSnapshot?.primaryOpportunity?.title?.trim();
    if (oppTitle) return `Schůzka: ${oppTitle}`;
    return `Schůzka s ${name}`;
  }, [contactName, crmSnapshot?.primaryOpportunity?.title]);

  const scheduleOpportunityId = crmSnapshot?.primaryOpportunity?.id ?? null;

  const invalidateConversations = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalMessages.all });
  }, [queryClient]);

  const conversationsListSig = useMemo(
    () => JSON.stringify(conversations.map((c) => [c.contactId, c.lastMessageAt, c.unreadCount])),
    [conversations],
  );
  const prevConversationsSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevConversationsSigRef.current !== null && conversationsListSig === prevConversationsSigRef.current) {
      pollStableRef.current = Math.min(pollStableRef.current + 1, 999);
    } else {
      pollStableRef.current = 0;
    }
    prevConversationsSigRef.current = conversationsListSig;
  }, [conversationsListSig]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (initialContactId) setSelectedContactId(initialContactId);
  }, [initialContactId]);

  const reloadActiveThread = useCallback(async () => {
    if (!selectedContactId) return;
    const cid = selectedContactId;
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const outcome = await loadThreadMessages(cid, { markRead: true });
      if (outcome.ok) {
        setMsgs(outcome.messages);
        setMessagesLoading(false);
        window.dispatchEvent(new Event("portal-messages-badge-refresh"));
        invalidateConversations();
      } else {
        setMessagesError(outcome.error);
        setMessagesLoading(false);
      }
    } catch (e) {
      setMessagesError(humanMessageError(e, "Konverzaci se nepodařilo načíst."));
      setMessagesLoading(false);
    }
  }, [selectedContactId, invalidateConversations]);

  useEffect(() => {
    if (!selectedContactId) {
      setMsgs([]);
      setMsgAttachments({});
      setMessagesError(null);
      setMessagesLoading(false);
      setAttachmentsLoading(false);
      setContactDetail(null);
      setContactName("");
      return;
    }
    // Clear stale content immediately so old thread never flashes during load
    setMsgs([]);
    setMsgAttachments({});
    setMessagesError(null);
    void reloadActiveThread();
  }, [selectedContactId, reloadActiveThread]);

  useEffect(() => {
    if (!selectedContactId) {
      setCrmSnapshot(null);
      setCrmLoading(false);
      return;
    }
    if (messagesLoading) {
      setCrmSnapshot(null);
      setCrmLoading(false);
      return;
    }
    let cancelled = false;
    setCrmLoading(true);
    void getChatContextPanelSnapshot(selectedContactId)
      .then((snap) => {
        if (!cancelled) {
          setCrmSnapshot(snap);
          setCrmLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCrmSnapshot(null);
          setCrmLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, messagesLoading, msgs.length, crmSnapshotNonce]);

  useEffect(() => {
    // Reset thread signature — nový kontakt vždy spustí summary znovu.
    aiSummaryThreadSigRef.current = null;
    aiSummaryLastRunAtRef.current = 0;
    if (!selectedContactId) {
      setAiSummary(null);
      setAiSummaryError(null);
      setAiSummaryLoading(false);
      setAiDraftText("");
      setAiDraftError(null);
      setAiDraftLoading(false);
      return;
    }
    setAiSummary(null);
    setAiSummaryError(null);
    setAiDraftText("");
    setAiDraftError(null);
  }, [selectedContactId]);

  useEffect(() => {
    if (!selectedContactId || messagesLoading) return;
    if (crmLoading) return;
    if (!shouldAutoRunAdvisorChatAiSummary(msgs)) {
      setAiSummary(null);
      setAiSummaryError(null);
      setAiSummaryLoading(false);
      return;
    }
    // Přeskočit LLM call, pokud se vlákno ani CRM snapshot reálně nezměnily.
    const lastMsgId = msgs[msgs.length - 1]?.id ?? "";
    const sig = `${selectedContactId}:${lastMsgId}:${msgs.length}:${crmSnapshotNonce}`;
    const now = Date.now();
    if (sig === aiSummaryThreadSigRef.current && now - aiSummaryLastRunAtRef.current < AI_SUMMARY_COOLDOWN_MS) return;
    aiSummaryThreadSigRef.current = sig;
    aiSummaryLastRunAtRef.current = now;

    let cancelled = false;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    void generateAdvisorChatContextSummary(selectedContactId, crmSnapshot ? { crmSnapshot } : undefined).then(
      (r) => {
        if (cancelled) return;
        setAiSummaryLoading(false);
        if (r.ok) {
          setAiSummary(r.summary);
        } else {
          setAiSummary(null);
          setAiSummaryError(r.error);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContactId, msgs, messagesLoading, crmLoading, crmSnapshot, crmSnapshotNonce]);

  useEffect(() => {
    if (!selectedContactId) return;
    if (messagesLoading) return;
    let cancelled = false;
    const cid = selectedContactId;
    getContact(cid)
      .then((row) => {
        if (cancelled || !row) return;
        setContactDetail(row);
        const inList = conversationsRef.current.some((c) => c.contactId === cid);
        if (!inList) {
          setContactName([row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Kontakt");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, messagesLoading]);

  useEffect(() => {
    if (!selectedContactId) return;
    const conv = conversations.find((c) => c.contactId === selectedContactId);
    if (conv) setContactName(conv.contactName);
  }, [conversations, selectedContactId]);

  useEffect(() => {
    if (!selectedContactId) return;
    if (msgs.length === 0) {
      setMsgAttachments({});
      setAttachmentsLoading(false);
      return;
    }
    const cid = selectedContactId;
    const idSet = new Set(msgs.map((m) => m.id));
    let cancelled = false;
    const load = async () => {
      setAttachmentsLoading(true);
      try {
        const r = await loadThreadAttachmentsByContact(cid);
        if (cancelled) return;
        if (!r.ok) {
          setMsgAttachments({});
          return;
        }
        const filtered: Record<string, MessageAttachmentRow[]> = {};
        for (const id of idSet) {
          filtered[id] = r.byMessageId[id] ?? [];
        }
        setMsgAttachments(filtered);
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    };
    const frame = requestAnimationFrame(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [msgs, selectedContactId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [msgs.length]);

  async function handleDeleteOneMessage(messageId: string) {
    if (!selectedContactId) return;
    const ok = await confirm({
      title: "Smazat zprávu?",
      message: "Smazat tuto zprávu? Tuto akci nelze vrátit zpět.",
      confirmLabel: "Smazat",
      variant: "destructive",
    });
    if (!ok) return;
    const cid = selectedContactId;
    setDeletingMessageId(messageId);
    startTransition(async () => {
      try {
        await deleteMessageForAdvisor(messageId);
        setMsgAttachments((prev) => {
          const next = { ...prev };
          delete next[messageId];
          return next;
        });
        const reload = await loadThreadMessages(cid, { markRead: true });
        if (reload.ok) setMsgs(reload.messages);
        else throw new Error(reload.error);
        invalidateConversations();
        window.dispatchEvent(new Event("portal-messages-badge-refresh"));
      } catch (e) {
        setSendError(humanMessageError(e, "Zprávu se nepodařilo smazat."));
      } finally {
        setDeletingMessageId(null);
      }
    });
  }

  async function handleDeleteConversation() {
    if (!selectedContactId) return;
    const ok = await confirm({
      title: "Smazat celou konverzaci?",
      message:
        "Smazat celou konverzaci s tímto klientem? Všechny zprávy a přílohy budou trvale odstraněny. Tuto akci nelze vrátit zpět.",
      confirmLabel: "Smazat konverzaci",
      variant: "destructive",
    });
    if (!ok) return;
    const id = selectedContactId;
    startTransition(async () => {
      try {
        await deleteConversationForContact(id);
        setSelectedContactId(null);
        setMsgs([]);
        setMsgAttachments({});
        setContactDetail(null);
        router.replace("/portal/messages", { scroll: false });
        invalidateConversations();
        window.dispatchEvent(new Event("portal-messages-badge-refresh"));
      } catch (e) {
        setSendError(humanMessageError(e, "Konverzaci se nepodařilo smazat."));
      }
    });
  }

  function handleSend() {
    const trimmed = body.trim();
    if (!selectedContactId) return;
    if (!trimmed && files.length === 0) return;
    const cid = selectedContactId;

    startTransition(async () => {
      setSendError(null);
      try {
        if (files.length > 0) {
          const formData = new FormData();
          formData.set("body", trimmed || "(příloha)");
          files.forEach((f) => formData.append("file", f));
          const sent = await sendPortalMessageWithAttachments(cid, formData);
          if (!sent.ok) {
            setSendError(sent.error);
            return;
          }
          setFiles([]);
        } else {
          const sent = await sendPortalMessage(cid, trimmed);
          if (!sent.ok) {
            setSendError(sent.error);
            return;
          }
          // Optimisticky zobrazit zprávu před potvrzením reloadu.
          setMsgs((prev) => [
            ...prev,
            {
              id: `optimistic-${Date.now()}`,
              senderType: "advisor",
              senderId: "me",
              body: trimmed,
              readAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        setBody("");
        const reload = await loadThreadMessages(cid, { markRead: true });
        if (reload.ok) setMsgs(reload.messages);
        else setSendError(reload.error);
        invalidateConversations();
      } catch (e) {
        setSendError(humanMessageError(e, "Zprávu se nepodařilo odeslat."));
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function selectConversation(contactId: string) {
    setSelectedContactId(contactId);
    router.replace(`/portal/messages?contact=${contactId}`, { scroll: false });
  }

  const openNewMessage = useCallback(async () => {
    setNewMsgOpen(true);
    setContactSearch("");
    try {
      const list = await getContactsList();
      setAllContacts(list);
    } catch {
      setAllContacts([]);
    }
  }, []);

  const filteredContacts = allContacts.filter((c) => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
    const q = contactSearch.toLowerCase();
    return name.includes(q) || (c.email?.toLowerCase().includes(q) ?? false);
  });

  const showList = !selectedContactId;
  const showChat = !!selectedContactId;

  const conversationsForList = useMemo(
    () => mergeConversationsWithSelection(conversations, selectedContactId, contactName),
    [conversations, selectedContactId, contactName],
  );

  const activeConv = selectedContactId ? conversations.find((c) => c.contactId === selectedContactId) : undefined;
  const lastActivitySource =
    msgs.length > 0
      ? new Date(msgs[msgs.length - 1]!.createdAt)
      : activeConv
        ? new Date(activeConv.lastMessageAt)
        : null;

  const lastClientSnippet =
    [...msgs].reverse().find((m) => m.senderType === "client")?.body?.trim() ||
    activeConv?.lastMessage?.trim() ||
    "";

  const suggestedTaskTitle = useMemo(
    () =>
      buildChatTaskSuggestedTitle(
        contactName || "Kontakt",
        lastClientSnippet,
        aiSummary,
        crmSnapshot?.primaryOpportunity?.title?.trim() ?? null,
      ),
    [contactName, lastClientSnippet, aiSummary, crmSnapshot?.primaryOpportunity?.title],
  );

  const taskDescriptionSeed = useMemo(
    () => buildChatTaskDescriptionSeed(contactName || "Kontakt", lastClientSnippet),
    [contactName, lastClientSnippet],
  );

  const aiSummaryIdleHint = useMemo(() => {
    if (!selectedContactId) return null;
    if (aiSummaryLoading || aiSummary || aiSummaryError) return null;
    if (messagesLoading) {
      return "Krátce počkejte — souhrn doplníme po načtení konverzace.";
    }
    if (crmLoading) {
      return "Načítám kontext ke klientovi…";
    }
    if (msgs.length === 0) {
      return "V této konverzaci zatím nejsou žádné zprávy.";
    }
    if (!shouldAutoRunAdvisorChatAiSummary(msgs)) {
      return "Souhrn zatím není k dispozici. Vygenerujete ho tlačítkem Obnovit.";
    }
    return null;
  }, [
    selectedContactId,
    messagesLoading,
    msgs,
    aiSummaryLoading,
    aiSummary,
    aiSummaryError,
    crmLoading,
  ]);

  const refreshAiSummary = useCallback(() => {
    if (!selectedContactId) return;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    void generateAdvisorChatContextSummary(
      selectedContactId,
      crmSnapshot ? { crmSnapshot } : undefined,
    ).then((r) => {
      setAiSummaryLoading(false);
      if (r.ok) {
        setAiSummary(r.summary);
      } else {
        setAiSummary(null);
        setAiSummaryError(r.error);
      }
    });
  }, [selectedContactId, crmSnapshot]);

  const runAiDraft = useCallback(
    async (variantHint?: string) => {
      if (!selectedContactId) return;
      setAiSheetOpen(true);
      setContextSheetOpen(false);
      setAiDraftLoading(true);
      setAiDraftError(null);
      if (!variantHint) setAiDraftText("");
      const r = await generateAdvisorChatReplyDraft(selectedContactId, { variantHint });
      setAiDraftLoading(false);
      if (r.ok) setAiDraftText(r.draft);
      else setAiDraftError(r.error);
    },
    [selectedContactId],
  );

  const openMeeting = () => {
    setMeetingSheetOpen(true);
    setContextSheetOpen(false);
  };
  const openTask = () => {
    setTaskSheetOpen(true);
    setContextSheetOpen(false);
  };

  const contextPanelProps = useMemo(() => {
    if (!selectedContactId) return null;
    return {
      contactId: selectedContactId,
      contactName: contactName || "Kontakt",
      contact: contactDetail,
      lastMessagePreview: lastClientSnippet,
      lastThreadActivityAt: lastActivitySource,
      crmSnapshot,
      crmLoading,
      aiSummary,
      aiSummaryLoading,
      aiSummaryError,
      aiSummaryIdleHint,
      onRefreshAiSummary: refreshAiSummary,
      onNavigate: (href: string) => {
        setContextSheetOpen(false);
        router.push(href);
      },
    };
  }, [
    selectedContactId,
    contactName,
    contactDetail,
    lastClientSnippet,
    lastActivitySource,
    crmSnapshot,
    crmLoading,
    aiSummary,
    aiSummaryLoading,
    aiSummaryError,
    aiSummaryIdleHint,
    refreshAiSummary,
    router,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4f6fb] p-4 md:min-h-[calc(100vh-8rem)] md:p-5 dark:bg-slate-950">
      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-4 xl:grid xl:min-h-0 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(260px,300px)]">
        <div
          className={`min-h-0 min-w-0 xl:flex xl:flex-col ${showList ? "flex flex-1 flex-col" : "hidden xl:flex"} ${showList ? "max-xl:min-h-[50vh]" : ""}`}
        >
          <ConversationList
            conversations={conversationsForList}
            selectedContactId={selectedContactId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectConversation={selectConversation}
            newMsgOpen={newMsgOpen}
            onCloseNewMsg={() => setNewMsgOpen(false)}
            onOpenNewMsg={openNewMessage}
            contactSearch={contactSearch}
            onContactSearchChange={setContactSearch}
            filteredContacts={filteredContacts}
            onPickNewContact={(id) => {
              selectConversation(id);
              setNewMsgOpen(false);
            }}
            listLoading={conversationsLoading}
            listError={conversationsError}
            onRetryList={() => void refetchConversations()}
          />
        </div>

        <main
          className={`min-h-0 min-w-0 flex flex-col overflow-hidden rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm ${
            showChat ? "flex flex-1" : "hidden xl:flex"
          }`}
        >
          {selectedContactId ? (
            <>
              <ConversationHeader
                contactName={contactName || "Kontakt"}
                contactId={selectedContactId}
                presenceTier={lastActivitySource ? presenceFromLastMessageAt(lastActivitySource) : "offline"}
                lastActiveLabel={lastActivitySource ? formatLastActiveLabel(lastActivitySource) : "Žádná aktivita"}
                onBack={() => {
                  setSelectedContactId(null);
                  router.replace("/portal/messages", { scroll: false });
                }}
                onNewAction={() => setActionsMenuOpen(true)}
                showMobileBack
                showContextTrigger
                onOpenContext={() => setContextSheetOpen(true)}
              />
              <ConversationQuickActions
                onAiSuggest={() => void runAiDraft()}
                onScheduleMeeting={openMeeting}
                onCreateTask={openTask}
                aiBusy={aiDraftLoading}
              />

              <div className="flex min-h-0 flex-1 flex-col">
                <MessageThread
                  msgs={msgs}
                  msgAttachments={msgAttachments}
                  onDeleteOne={handleDeleteOneMessage}
                  deletingMessageId={deletingMessageId}
                  bottomRef={bottomRef}
                  loading={messagesLoading}
                  loadError={messagesError}
                  onRetryLoad={() => void reloadActiveThread()}
                  attachmentsLoading={attachmentsLoading}
                />
                <MessageComposer
                  body={body}
                  onBodyChange={setBody}
                  onKeyDown={handleKeyDown}
                  onSend={handleSend}
                  files={files}
                  onRemoveFile={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  fileInputRef={fileInputRef}
                  onAttachClick={() => fileInputRef.current?.click()}
                  onFilesPicked={(picked) => setFiles((prev) => prev.concat(picked))}
                  sendError={sendError}
                  onDismissError={() => setSendError(null)}
                  onRetrySend={handleSend}
                  isPending={isPending}
                  canSend={body.trim().length > 0 || files.length > 0}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-[color:var(--wp-text-secondary)]">
              Vyberte konverzaci vlevo nebo začněte novou zprávu.
            </div>
          )}
        </main>

        <div className="hidden min-h-0 min-w-0 xl:block">
          {selectedContactId && contextPanelProps ? (
            <ConversationContextPanel {...contextPanelProps} />
          ) : (
            <aside className="flex h-full min-h-[240px] items-center justify-center rounded-[var(--wp-radius-card)] border border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80 px-6 text-center text-sm text-[color:var(--wp-text-secondary)] shadow-sm">
              Vyberte konverzaci pro zobrazení rychlého kontextu, úkolů a kontaktu.
            </aside>
          )}
        </div>
      </div>

      <ChatModal open={contextSheetOpen} title="Kontext konverzace" onClose={() => setContextSheetOpen(false)}>
        {selectedContactId && contextPanelProps ? <ConversationContextPanel {...contextPanelProps} asDiv /> : null}
      </ChatModal>

      {selectedContactId ? (
        <NewAdvisorActionsMenu
          open={actionsMenuOpen}
          onClose={() => setActionsMenuOpen(false)}
          contactId={selectedContactId}
          onDeleteConversation={handleDeleteConversation}
        />
      ) : null}

      <ChatModal
        open={aiSheetOpen}
        title="Navrhnout odpověď AI"
        onClose={() => setAiSheetOpen(false)}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              disabled={aiDraftLoading || !aiDraftText.trim()}
              onClick={() => {
                setBody(aiDraftText);
                setAiSheetOpen(false);
              }}
              className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
            >
              Vložit do zprávy
            </button>
            <button
              type="button"
              disabled={aiDraftLoading || !selectedContactId}
              onClick={() => void runAiDraft(`variant-${Date.now()}`)}
              className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] py-2.5 text-sm font-medium text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-card)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
            >
              Znovu vygenerovat
            </button>
            <button
              type="button"
              onClick={() => setAiSheetOpen(false)}
              className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:opacity-95 sm:w-auto sm:min-w-[100px]"
            >
              Zavřít
            </button>
          </div>
        }
      >
        <p className="text-xs text-[color:var(--wp-text-tertiary)]">
          Návrh vychází z aktuálního vlákna a CRM dat. Před odesláním ho upravte — zpráva se nikdy neodešle automaticky.
        </p>
        {aiDraftLoading ? (
          <div className="mt-4 flex items-center gap-2 text-[color:var(--wp-text-secondary)]">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
            Generuji návrh…
          </div>
        ) : null}
        {aiDraftError ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{aiDraftError}</p> : null}
        {aiDraftText && !aiDraftLoading ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-3 text-[color:var(--wp-text)]">
            <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">Návrh odpovědi</div>
            <p className="mt-2 max-h-[min(40vh,320px)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{aiDraftText}</p>
          </div>
        ) : null}
      </ChatModal>

      {selectedContactId ? (
        <ChatQuickScheduleOverlay
          open={meetingSheetOpen}
          onClose={() => setMeetingSheetOpen(false)}
          contactId={selectedContactId}
          suggestedTitle={suggestedMeetingTitle}
          opportunityId={scheduleOpportunityId}
          contacts={pickerContacts}
          contactsLoading={pickerContactsLoading}
        />
      ) : null}

      {selectedContactId ? (
        <ChatQuickTaskOverlay
          open={taskSheetOpen}
          onClose={() => setTaskSheetOpen(false)}
          contactId={selectedContactId}
          suggestedTitle={suggestedTaskTitle}
          descriptionSeed={taskDescriptionSeed}
          initialOpportunityId={scheduleOpportunityId}
          contacts={pickerContacts}
          contactsLoading={pickerContactsLoading}
          opportunities={taskOpportunities}
          opportunitiesLoading={taskOpportunitiesLoading}
          onTaskCreated={() => setCrmSnapshotNonce((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}
