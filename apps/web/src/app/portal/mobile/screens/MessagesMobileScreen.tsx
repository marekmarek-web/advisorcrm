"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Paperclip, Plus, Search, Send, User, X, MessageSquare } from "lucide-react";
import {
  getConversationsList,
  getMessages,
  getMessageAttachments,
  sendMessage,
  sendMessageWithAttachments,
  markMessagesRead,
  type MessageRow,
  type ConversationListItem,
  type MessageAttachmentRow,
} from "@/app/actions/messages";
import { getContact, getContactsList, type ContactRow } from "@/app/actions/contacts";
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
} from "@/app/shared/mobile-ui/primitives";

const POLL_INTERVAL = 10_000;

function MessageBubble({
  m,
  attachments,
  isOwn,
}: {
  m: MessageRow;
  attachments: MessageAttachmentRow[];
  isOwn: boolean;
}) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isOwn
            ? "bg-indigo-600 text-white"
            : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] border border-[color:var(--wp-surface-card-border)]"
        }`}
      >
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
  const contactFromQuery = searchParams.get("contact");

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(contactFromQuery?.trim() || null);
  const [contactName, setContactName] = useState("");
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [msgAttachments, setMsgAttachments] = useState<Record<string, MessageAttachmentRow[]>>({});
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactRow[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  const loadConversations = useCallback(async (isInitial = false) => {
    if (isInitial) setLoadingConversations(true);
    setConversationsError(null);
    try {
      const list = await getConversationsList(searchQuery.trim() || undefined);
      setConversations(list);
    } catch (e) {
      if (isInitial) setConversationsError(e instanceof Error ? e.message : "Nepodařilo se načíst konverzace.");
      setConversations([]);
    } finally {
      if (isInitial) setLoadingConversations(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadConversations(true);
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadConversations(false);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (contactFromQuery) setSelectedContactId(contactFromQuery.trim());
  }, [contactFromQuery]);

  useEffect(() => {
    if (!selectedContactId) {
      setMsgs([]);
      setContactName("");
      return;
    }
    setLoadingMessages(true);
    const conv = conversations.find((c) => c.contactId === selectedContactId);
    if (conv) {
      setContactName(conv.contactName);
    } else {
      getContact(selectedContactId)
        .then((c) => {
          if (c) setContactName([c.firstName, c.lastName].filter(Boolean).join(" ") || "Kontakt");
        })
        .catch(() => {});
    }

    let cancelled = false;
    getMessages(selectedContactId)
      .then((data) => {
        if (!cancelled) {
          setMsgs(data);
          setLoadingMessages(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    markMessagesRead(selectedContactId)
      .then(() => window.dispatchEvent(new Event("portal-messages-badge-refresh")))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedContactId, conversations]);

  const msgIds = msgs.map((m) => m.id).join(",");
  useEffect(() => {
    if (msgs.length === 0) {
      setMsgAttachments({});
      return;
    }
    const ids = msgs.map((m) => m.id);
    const load = async () => {
      const next: Record<string, MessageAttachmentRow[]> = {};
      for (const id of ids) {
        try {
          next[id] = await getMessageAttachments(id);
        } catch {
          next[id] = [];
        }
      }
      setMsgAttachments((prev) => ({ ...prev, ...next }));
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgIds]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
          await sendMessageWithAttachments(selectedContactId, formData);
          setFiles([]);
        } else {
          await sendMessage(selectedContactId, trimmed);
        }
        setBody("");
        const data = await getMessages(selectedContactId);
        setMsgs(data);
        loadConversations(false);
      } catch (e) {
        setSendError(e instanceof Error ? e.message : "Zprávu se nepodařilo odeslat.");
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
      return <ErrorState title={conversationsError} onRetry={() => loadConversations(true)} />;
    }
    return (
      <div className="-mx-4 -mt-4 flex flex-col min-h-[calc(100dvh-8rem)]">
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
    <div className="-mx-4 -mt-4 flex flex-col h-[calc(100dvh-4rem)]">
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
