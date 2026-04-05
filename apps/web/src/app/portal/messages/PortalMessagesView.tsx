"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getConversationsList,
  getMessages,
  getMessageAttachments,
  getChatContextPanelSnapshot,
  sendMessage,
  sendMessageWithAttachments,
  markMessagesRead,
  deleteConversationForContact,
  deleteMessageForAdvisor,
  type ChatContextPanelSnapshot,
  type MessageRow,
  type ConversationListItem,
  type MessageAttachmentRow,
} from "@/app/actions/messages";
import { getContact, getContactsList, type ContactRow } from "@/app/actions/contacts";
import { generateAdvisorChatContextSummary, generateAdvisorChatReplyDraft } from "@/app/actions/advisor-chat-ai";
import type { AdvisorChatAiSummary } from "@/lib/advisor-chat/advisor-chat-ai-types";
import { queryKeys } from "@/lib/query-keys";
import { ConversationList } from "./components/ConversationList";
import { ConversationHeader } from "./components/ConversationHeader";
import { ConversationQuickActions } from "./components/ConversationQuickActions";
import { MessageThread } from "./components/MessageThread";
import { MessageComposer } from "./components/MessageComposer";
import { ConversationContextPanel } from "./components/ConversationContextPanel";
import { NewAdvisorActionsMenu } from "./components/NewAdvisorActionsMenu";
import { ChatModal } from "./components/ChatModal";
import { ChatQuickScheduleOverlay } from "./components/ChatQuickScheduleOverlay";
import { formatLastActiveLabel, presenceFromLastMessageAt } from "./components/chat-format";
import { mergeConversationsWithSelection } from "./components/merge-conversations-with-selection";

const POLL_INTERVAL = 10_000;

function humanMessageError(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    if (e.message === "Forbidden") return "K této konverzaci nemáte přístup.";
    return e.message;
  }
  return fallback;
}

export function PortalMessagesView({ initialContactId }: { initialContactId: string | null }) {
  const router = useRouter();
  const searchRef = useRef("");
  const conversationsRef = useRef<ConversationListItem[]>([]);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
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

  const { data: scheduleContacts = [], isPending: scheduleContactsLoading } = useQuery({
    queryKey: queryKeys.contacts.list(),
    queryFn: getContactsList,
    enabled: meetingSheetOpen && Boolean(selectedContactId),
    staleTime: 120_000,
  });

  const suggestedMeetingTitle = useMemo(() => {
    const name = (contactName || "Klient").trim();
    const oppTitle = crmSnapshot?.primaryOpportunity?.title?.trim();
    if (oppTitle) return `Schůzka: ${oppTitle}`;
    return `Schůzka s ${name}`;
  }, [contactName, crmSnapshot?.primaryOpportunity?.title]);

  const scheduleOpportunityId = crmSnapshot?.primaryOpportunity?.id ?? null;

  searchRef.current = searchQuery.trim();
  conversationsRef.current = conversations;

  const runListFetch = useCallback(async (mode: "initial" | "poll") => {
    const q = searchRef.current || undefined;
    try {
      const list = await getConversationsList(q);
      setConversations(list);
      if (mode === "initial") setConversationsError(null);
    } catch (e) {
      if (mode === "initial") {
        setConversationsError(humanMessageError(e, "Konverzace se nepodařilo načíst."));
        setConversations([]);
      }
    } finally {
      if (mode === "initial") setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    setConversationsLoading(true);
    void runListFetch("initial");
  }, [searchQuery, runListFetch]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void runListFetch("poll");
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [runListFetch]);

  useEffect(() => {
    if (initialContactId) setSelectedContactId(initialContactId);
  }, [initialContactId]);

  const reloadActiveThread = useCallback(async () => {
    if (!selectedContactId) return;
    const cid = selectedContactId;
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const data = await getMessages(cid);
      setMsgs(data);
      try {
        await markMessagesRead(cid);
        window.dispatchEvent(new Event("portal-messages-badge-refresh"));
        await runListFetch("poll");
      } catch {
        /* označení přečtení nesmí zablokovat zobrazení vlákna */
      }
    } catch (e) {
      setMessagesError(humanMessageError(e, "Konverzaci se nepodařilo načíst."));
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedContactId, runListFetch]);

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
    void reloadActiveThread();
  }, [selectedContactId, reloadActiveThread]);

  useEffect(() => {
    if (!selectedContactId) {
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
  }, [selectedContactId, msgs.length]);

  useEffect(() => {
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
    let cancelled = false;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    void generateAdvisorChatContextSummary(selectedContactId).then((r) => {
      if (cancelled) return;
      setAiSummaryLoading(false);
      if (r.ok) {
        setAiSummary(r.summary);
      } else {
        setAiSummary(null);
        setAiSummaryError(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, msgs.length, messagesLoading]);

  useEffect(() => {
    if (!selectedContactId) return;
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
  }, [selectedContactId]);

  useEffect(() => {
    if (!selectedContactId) return;
    const conv = conversations.find((c) => c.contactId === selectedContactId);
    if (conv) setContactName(conv.contactName);
  }, [conversations, selectedContactId]);

  useEffect(() => {
    if (msgs.length === 0) {
      setMsgAttachments({});
      setAttachmentsLoading(false);
      return;
    }
    let cancelled = false;
    setAttachmentsLoading(true);
    const ids = msgs.map((m) => m.id);
    const load = async () => {
      const next: Record<string, MessageAttachmentRow[]> = {};
      for (const id of ids) {
        try {
          const list = await getMessageAttachments(id);
          next[id] = list;
        } catch {
          next[id] = [];
        }
      }
      if (!cancelled) {
        setMsgAttachments((prev) => ({ ...prev, ...next }));
        setAttachmentsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [msgs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  function handleDeleteOneMessage(messageId: string) {
    if (!window.confirm("Smazat tuto zprávu? Tuto akci nelze vrátit zpět.")) return;
    if (!selectedContactId) return;
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
        const data = await getMessages(cid);
        setMsgs(data);
        await runListFetch("poll");
        window.dispatchEvent(new Event("portal-messages-badge-refresh"));
      } catch (e) {
        setSendError(humanMessageError(e, "Zprávu se nepodařilo smazat."));
      } finally {
        setDeletingMessageId(null);
      }
    });
  }

  function handleDeleteConversation() {
    if (!selectedContactId) return;
    if (
      !window.confirm(
        "Smazat celou konverzaci s tímto klientem? Všechny zprávy a přílohy budou trvale odstraněny. Tuto akci nelze vrátit zpět.",
      )
    ) {
      return;
    }
    const id = selectedContactId;
    startTransition(async () => {
      try {
        await deleteConversationForContact(id);
        setSelectedContactId(null);
        setMsgs([]);
        setMsgAttachments({});
        setContactDetail(null);
        router.replace("/portal/messages", { scroll: false });
        await runListFetch("poll");
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

    startTransition(async () => {
      setSendError(null);
      try {
        if (files.length > 0) {
          const formData = new FormData();
          formData.set("body", trimmed || "(příloha)");
          files.forEach((f) => formData.append("file", f));
          await sendMessageWithAttachments(selectedContactId, formData);
          setFiles([]);
        } else {
          await sendMessage(selectedContactId, trimmed);
        }
        setBody("");
        const data = await getMessages(selectedContactId);
        setMsgs(data);
        await runListFetch("poll");
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

  const refreshAiSummary = useCallback(() => {
    if (!selectedContactId) return;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    void generateAdvisorChatContextSummary(selectedContactId).then((r) => {
      setAiSummaryLoading(false);
      if (r.ok) {
        setAiSummary(r.summary);
      } else {
        setAiSummary(null);
        setAiSummaryError(r.error);
      }
    });
  }, [selectedContactId]);

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
    refreshAiSummary,
    router,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4f6fb] p-3 md:min-h-[calc(100vh-8rem)] md:p-4 dark:bg-slate-950">
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
            onRetryList={() => {
              setConversationsLoading(true);
              void runListFetch("initial");
            }}
          />
        </div>

        <main
          className={`min-h-0 min-w-0 flex flex-col overflow-hidden rounded-[28px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm ${
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
            <aside className="flex h-full min-h-[240px] items-center justify-center rounded-[28px] border border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80 px-6 text-center text-sm text-[color:var(--wp-text-secondary)] shadow-sm">
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
          contacts={scheduleContacts}
          contactsLoading={scheduleContactsLoading}
        />
      ) : null}

      <ChatModal
        open={taskSheetOpen}
        title="Vytvořit úkol"
        onClose={() => setTaskSheetOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setTaskSheetOpen(false)}
            className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:opacity-95"
          >
            Zavřít
          </button>
        }
      >
        <p>Formulář úkolu vázaný na klienta doplníme v další iteraci.</p>
      </ChatModal>
    </div>
  );
}
