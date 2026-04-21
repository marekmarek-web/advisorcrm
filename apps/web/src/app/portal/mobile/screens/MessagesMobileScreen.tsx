"use client";

import { useEffect, useRef, useState, useTransition, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Paperclip, Plus, Search, Send, Trash2, User, X, MessageSquare } from "lucide-react";
import {
  getConversationsList,
  loadThreadMessages,
  loadThreadAttachmentsByContact,
  sendPortalMessage,
  sendPortalMessageWithAttachments,
  deleteConversationForContact,
  deleteMessageForAdvisor,
  type MessageRow,
  type ConversationListItem,
  type MessageAttachmentRow,
} from "@/app/actions/messages";
import { getContact, getContactsList, type ContactRow } from "@/app/actions/contacts";
import { queryKeys } from "@/lib/query-keys";
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
} from "@/app/shared/mobile-ui/primitives";
import { getActionFriendlyErrorMessage } from "@/lib/observability/production-error-ui";

const POLL_INTERVAL = 10_000;
const POLL_INTERVAL_SLOW = 25_000;
const POLL_BACKOFF_AFTER = 3;

function MessageBubble({
  m,
  attachments,
  isOwn,
  onDeleteOne,
  deletePending,
}: {
  m: MessageRow;
  attachments: MessageAttachmentRow[];
  isOwn: boolean;
  onDeleteOne?: (messageId: string) => void;
  deletePending?: boolean;
}) {
  const showDel =
    "opacity-100 md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto";
  return (
    <div className={`group flex items-end gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
      {onDeleteOne && !isOwn ? (
        <button
          type="button"
          disabled={deletePending}
          onClick={() => onDeleteOne(m.id)}
          className={`shrink-0 mb-1 p-2 rounded-lg text-rose-500 active:bg-rose-50 min-h-[40px] min-w-[40px] flex items-center justify-center ${showDel}`}
          aria-label="Smazat zprávu"
        >
          <Trash2 size={18} />
        </button>
      ) : null}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm relative ${
          isOwn
            ? "bg-indigo-600 text-white"
            : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] border border-[color:var(--wp-surface-card-border)]"
        }`}
      >
        {onDeleteOne && isOwn ? (
          <button
            type="button"
            disabled={deletePending}
            onClick={() => onDeleteOne(m.id)}
            className={`absolute -top-1 -right-1 p-1.5 rounded-full bg-white text-rose-600 shadow border border-rose-100 min-h-[32px] min-w-[32px] flex items-center justify-center ${showDel}`}
            aria-label="Smazat zprávu"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        {attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={`/api/messages/attachments/${a.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1.5 text-xs truncate max-w-full rounded-lg px-2 py-1.5 min-h-[36px] ${
                  isOwn
                    ? "text-white/90 bg-[color:var(--wp-surface-card)]/10 active:bg-[color:var(--wp-surface-card)]/20"
                    : "text-indigo-600 bg-indigo-50 active:bg-indigo-100"
                }`}
                title={a.fileName}
              >
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{a.fileName}</span>
              </a>
            ))}
          </div>
        )}
        <p className={`text-[10px] mt-1 ${isOwn ? "text-white/70" : "text-[color:var(--wp-text-secondary)]"}`}>
          {new Date(m.createdAt).toLocaleString("cs-CZ", {
            day: "numeric",
            month: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
}: {
  conv: ConversationListItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  const initials = conv.contactName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full text-left px-4 py-3 min-h-[64px] flex items-center gap-3
        border-b border-[color:var(--wp-surface-card-border)] active:bg-[color:var(--wp-surface-muted)] transition-colors
        ${isActive ? "bg-indigo-50/60 border-l-4 border-l-indigo-600" : ""}
      `}
    >
      <span className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
        {initials || "?"}
      </span>
      <span className="flex-1 min-w-0">
        <span className="font-semibold text-[color:var(--wp-text)] truncate block text-sm">{conv.contactName}</span>
        <span className="text-xs text-[color:var(--wp-text-secondary)] truncate block mt-0.5">
          {conv.lastMessage?.slice(0, 60)}
          {conv.lastMessage && conv.lastMessage.length > 60 ? "…" : ""}
        </span>
      </span>
      {conv.unreadCount > 0 && (
        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white min-w-[22px] text-center">
          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
        </span>
      )}
    </button>
  );
}

export function MessagesMobileScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const contactFromQuery = searchParams.get("contact");
  const pollStableRef = useRef(0);

  const [searchQuery, setSearchQuery] = useState("");
  const conversationsSearchKey = searchQuery.trim();
  const {
    data: conversations = [],
    isPending: loadingConversations,
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

  const invalidateConversations = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.portalMessages.all });
  }, [queryClient]);

  const [selectedContactId, setSelectedContactId] = useState<string | null>(contactFromQuery?.trim() || null);
  const [contactName, setContactName] = useState("");
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [msgAttachments, setMsgAttachments] = useState<Record<string, MessageAttachmentRow[]>>({});
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  const [loadingMessages, setLoadingMessages] = useState(false);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactRow[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  useEffect(() => {
    if (contactFromQuery) setSelectedContactId(contactFromQuery.trim());
  }, [contactFromQuery]);

  useEffect(() => {
    if (!selectedContactId) return;
    const conv = conversations.find((c) => c.contactId === selectedContactId);
    if (conv) setContactName(conv.contactName);
  }, [conversations, selectedContactId]);

  useEffect(() => {
    if (!selectedContactId || loadingMessages) return;
    const conv = conversations.find((c) => c.contactId === selectedContactId);
    if (conv) return;
    let cancelled = false;
    getContact(selectedContactId)
      .then((c) => {
        if (cancelled || !c) return;
        setContactName([c.firstName, c.lastName].filter(Boolean).join(" ") || "Kontakt");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, loadingMessages, conversations]);

  useEffect(() => {
    if (!selectedContactId) {
      setMsgs([]);
      setMsgAttachments({});
      setContactName("");
      setThreadLoadError(null);
      setLoadingMessages(false);
      return;
    }
    setThreadLoadError(null);
    setMsgs([]);
    setMsgAttachments({});
    setLoadingMessages(true);
    let cancelled = false;
    loadThreadMessages(selectedContactId, { markRead: true })
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.ok) {
          setMsgs(outcome.messages);
          setLoadingMessages(false);
          window.dispatchEvent(new Event("portal-messages-badge-refresh"));
          invalidateConversations();
        } else {
          setThreadLoadError(outcome.error);
          setLoadingMessages(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setThreadLoadError(getActionFriendlyErrorMessage(e, "Konverzaci se nepodařilo načíst."));
          setLoadingMessages(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedContactId, invalidateConversations]);

  useEffect(() => {
    if (!selectedContactId) return;
    if (msgs.length === 0) {
      setMsgAttachments({});
      return;
    }
    const cid = selectedContactId;
    const idSet = new Set(msgs.map((m) => m.id));
    let cancelled = false;
    const load = async () => {
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
      } catch {
        if (!cancelled) setMsgAttachments({});
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
          const sent = await sendPortalMessageWithAttachments(selectedContactId, formData);
          if (!sent.ok) {
            setSendError(sent.error);
            return;
          }
          setFiles([]);
        } else {
          const sent = await sendPortalMessage(selectedContactId, trimmed);
          if (!sent.ok) {
            setSendError(sent.error);
            return;
          }
        }
        setBody("");
        const reload = await loadThreadMessages(selectedContactId, { markRead: true });
        if (reload.ok) setMsgs(reload.messages);
        else setSendError(reload.error);
        invalidateConversations();
      } catch (e) {
        setSendError(getActionFriendlyErrorMessage(e, "Zprávu se nepodařilo odeslat."));
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

  function goBackToList() {
    setSelectedContactId(null);
    router.replace("/portal/messages", { scroll: false });
  }

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
        const reload = await loadThreadMessages(cid, { markRead: true });
        if (reload.ok) setMsgs(reload.messages);
        else setSendError(reload.error);
        invalidateConversations();
        window.dispatchEvent(new Event("portal-messages-badge-refresh"));
      } catch {
        setSendError("Zprávu se nepodařilo smazat.");
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
        setMsgs([]);
        setMsgAttachments({});
        setBody("");
        setFiles([]);
        goBackToList();
        invalidateConversations();
        window.dispatchEvent(new Event("portal-messages-badge-refresh"));
      } catch {
        setSendError("Konverzaci se nepodařilo smazat.");
      }
    });
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

  /* ============================================================ */
  /*  MASTER VIEW — Conversation list (shown when no selection)    */
  /* ============================================================ */
  if (!selectedContactId) {
    if (loadingConversations) {
      return <LoadingSkeleton variant="list" rows={6} />;
    }
    if (conversationsError) {
      return <ErrorState title={conversationsError} onRetry={() => void refetchConversations()} />;
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Search + New message */}
        <div className="px-4 pt-3 pb-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] space-y-2 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] pointer-events-none" />
              <input
                type="text"
                placeholder="Hledat v konverzacích…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] pl-9 pr-3 py-2.5 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 min-h-[44px]"
              />
            </div>
            <button
              type="button"
              onClick={openNewMessage}
              className="shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white active:bg-indigo-700 transition-colors shadow-sm"
              title="Napsat zprávu"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* New message contact picker */}
        {newMsgOpen && (
          <div className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-widest">Nová zpráva</p>
              <button
                type="button"
                onClick={() => setNewMsgOpen(false)}
                className="p-1 text-[color:var(--wp-text-tertiary)] active:text-[color:var(--wp-text-secondary)] min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] pointer-events-none" />
              <input
                type="text"
                placeholder="Hledat klienta…"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] pl-9 pr-3 py-2.5 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-100 min-h-[44px]"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredContacts.length === 0 && (
                <p className="text-xs text-[color:var(--wp-text-secondary)] py-2 text-center">Žádní klienti</p>
              )}
              {filteredContacts.slice(0, 20).map((c) => {
                const initials = [c.firstName?.[0], c.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      selectConversation(c.id);
                      setNewMsgOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg active:bg-indigo-50 text-sm font-medium text-[color:var(--wp-text)] min-h-[44px] flex items-center gap-2 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {initials}
                    </span>
                    <span className="truncate">{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Kontakt"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <EmptyState
              title="Zatím žádné konverzace"
              description="Napište klientovi první zprávu."
              action={
                <button
                  type="button"
                  className="mt-3 min-h-[44px] w-full max-w-xs rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white"
                  onClick={openNewMessage}
                >
                  Nová zpráva
                </button>
              }
            />
          ) : (
            conversations.map((c) => (
              <ConversationItem
                key={c.contactId}
                conv={c}
                isActive={false}
                onSelect={() => selectConversation(c.contactId)}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  /* ============================================================ */
  /*  DETAIL VIEW — Message thread (full screen on mobile)         */
  /* ============================================================ */
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thread header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] min-h-[56px]">
        <button
          type="button"
          onClick={goBackToList}
          className="p-2 -ml-2 rounded-lg active:bg-[color:var(--wp-surface-muted)] min-h-[44px] min-w-[44px] flex items-center justify-center text-[color:var(--wp-text-secondary)]"
          aria-label="Zpět na seznam"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-[color:var(--wp-text)] truncate block text-sm">{contactName || "Kontakt"}</span>
        </span>
        <button
          type="button"
          onClick={() => router.push(`/portal/contacts/${selectedContactId}`)}
          className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-indigo-600 active:bg-indigo-50 min-h-[44px]"
        >
          <User size={16} />
          Profil
        </button>
        <button
          type="button"
          onClick={handleDeleteConversation}
          disabled={isPending}
          className="shrink-0 flex items-center justify-center rounded-xl p-2 text-rose-600 active:bg-rose-50 min-h-[44px] min-w-[44px] disabled:opacity-50"
          aria-label="Smazat konverzaci"
          title="Smazat konverzaci"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {threadLoadError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
            {threadLoadError}
          </div>
        ) : null}
        {loadingMessages ? (
          <LoadingSkeleton variant="list" rows={5} />
        ) : msgs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare size={40} className="text-[color:var(--wp-text-tertiary)] mb-3" />
            <p className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">Zatím žádné zprávy</p>
            <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">Napište první zprávu tomuto klientovi.</p>
          </div>
        ) : (
          <>
            {msgs.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                attachments={msgAttachments[m.id] ?? []}
                isOwn={m.senderType === "advisor"}
                onDeleteOne={handleDeleteOneMessage}
                deletePending={deletingMessageId === m.id}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Compose */}
      <div className="shrink-0 border-t border-[color:var(--wp-surface-card-border)] px-3 py-2 bg-[color:var(--wp-surface-card)] safe-area-bottom">
        {sendError && (
          <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-xs text-rose-800 font-semibold flex-1 min-w-0 truncate">{sendError}</p>
            <button
              type="button"
              onClick={() => {
                setSendError(null);
                handleSend();
              }}
              disabled={isPending}
              className="shrink-0 min-h-[36px] px-3 rounded-lg bg-rose-600 text-white text-xs font-bold disabled:opacity-50"
            >
              Znovu
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {files.map((f, i) => (
              <span
                key={i}
                className="text-xs bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] px-2 py-1 rounded-lg flex items-center gap-1 max-w-[200px]"
              >
                <Paperclip size={12} className="shrink-0" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-[color:var(--wp-text-tertiary)] active:text-[color:var(--wp-text-secondary)] ml-0.5"
                  aria-label="Odstranit"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            type="file"
            ref={fileInputRef}
            className="sr-only"
            multiple
            accept=".pdf,.doc,.docx,image/*"
            onChange={(e) => {
              const added = Array.from(e.target.files ?? []);
              setFiles((prev) => prev.concat(added));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-xl p-2.5 text-[color:var(--wp-text-secondary)] active:bg-[color:var(--wp-surface-muted)] active:text-[color:var(--wp-text-secondary)] min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Přidat přílohu"
          >
            <Paperclip size={20} />
          </button>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Napište zprávu…"
            rows={1}
            className="flex-1 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3 py-2.5 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 resize-none min-h-[44px] max-h-[120px]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || (body.trim() === "" && files.length === 0)}
            className="shrink-0 rounded-xl p-2.5 text-white bg-indigo-600 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Odeslat"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
