"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Paperclip, User, Plus, Search, X } from "lucide-react";
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
import clsx from "clsx";
import { getContact, getContactsList, type ContactRow } from "@/app/actions/contacts";
import { portalPrimaryButtonClassName, portalPrimaryIconButtonClassName } from "@/lib/ui/create-action-button-styles";

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
                className={`block text-xs truncate max-w-full ${isOwn ? "text-white/90 underline" : "text-indigo-600 underline"}`}
                title={a.fileName}
              >
                📎 {a.fileName}
              </a>
            ))}
          </div>
        )}
        <p
          className={`text-[10px] mt-1 ${isOwn ? "text-white/70" : "text-[color:var(--wp-text-secondary)]"}`}
        >
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

export function PortalMessagesView({ initialContactId }: { initialContactId: string | null }) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(initialContactId);
  const [contactName, setContactName] = useState("");
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [msgAttachments, setMsgAttachments] = useState<Record<string, MessageAttachmentRow[]>>({});
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const list = await getConversationsList(searchQuery.trim() || undefined);
      setConversations(list);
    } catch {
      setConversations([]);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadConversations();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (initialContactId) setSelectedContactId(initialContactId);
  }, [initialContactId]);

  useEffect(() => {
    if (!selectedContactId) {
      setMsgs([]);
      setContactName("");
      return;
    }
    const conv = conversations.find((c) => c.contactId === selectedContactId);
    if (conv) {
      setContactName(conv.contactName);
    } else {
      getContact(selectedContactId).then((c) => {
        if (c) setContactName([c.firstName, c.lastName].filter(Boolean).join(" ") || "Kontakt");
      }).catch(() => {});
    }

    let cancelled = false;
    getMessages(selectedContactId).then((data) => {
      if (!cancelled) setMsgs(data);
    });
    markMessagesRead(selectedContactId).then(() => {
      window.dispatchEvent(new Event("portal-messages-badge-refresh"));
    }).catch(() => {});

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
          const list = await getMessageAttachments(id);
          next[id] = list;
        } catch {
          next[id] = [];
        }
      }
      setMsgAttachments((prev) => ({ ...prev, ...next }));
    };
    load();
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
        loadConversations();
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

  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<ContactRow[]>([]);
  const [contactSearch, setContactSearch] = useState("");

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

  return (
    <div className="flex flex-1 min-h-0 border border-[color:var(--wp-surface-card-border)] rounded-2xl bg-[color:var(--wp-surface-card)] overflow-hidden shadow-sm">
      {/* List: left on desktop, full on mobile when no selection */}
      <div
        className={`
          flex flex-col border-r border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 min-w-0
          md:w-[320px] md:shrink-0
          ${showList ? "flex md:flex" : "hidden md:flex"}
        `}
      >
        <div className="p-3 border-b border-[color:var(--wp-surface-card-border)] shrink-0 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Hledat v konverzacích…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2.5 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 min-h-[44px]"
              aria-label="Hledat v konverzacích"
            />
            <button
              type="button"
              onClick={openNewMessage}
              className={clsx(portalPrimaryIconButtonClassName, "shadow-sm")}
              title="Napsat zprávu"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {newMsgOpen && (
          <div className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-widest">Nová zpráva – vyberte klienta</p>
              <button type="button" onClick={() => setNewMsgOpen(false)} className="p-1 text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] min-h-[44px] min-w-[44px] inline-flex items-center justify-center">
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
              {filteredContacts.slice(0, 20).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    selectConversation(c.id);
                    setNewMsgOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 text-sm font-medium text-[color:var(--wp-text)] min-h-[44px] flex items-center gap-2 transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {[c.firstName?.[0], c.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
                  </span>
                  <span className="truncate">{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Kontakt"}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-[color:var(--wp-text-secondary)] text-center">
              Zatím žádné konverzace.
            </p>
          )}
          {conversations.map((c) => (
            <button
              key={c.contactId}
              type="button"
              onClick={() => selectConversation(c.contactId)}
              className={`
                w-full text-left px-4 py-3 border-b border-[color:var(--wp-surface-card-border)] min-h-[44px] flex items-center gap-3
                hover:bg-[color:var(--wp-surface-card)] transition-colors
                ${selectedContactId === c.contactId ? "bg-[color:var(--wp-surface-card)] border-l-4 border-l-indigo-600" : ""}
              `}
            >
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-[color:var(--wp-text)] truncate block">
                  {c.contactName}
                </span>
                <span className="text-xs text-[color:var(--wp-text-secondary)] truncate block">
                  {c.lastMessage?.slice(0, 60)}
                  {c.lastMessage && c.lastMessage.length > 60 ? "…" : ""}
                </span>
              </span>
              {c.unreadCount > 0 && (
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {c.unreadCount > 99 ? "99+" : c.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Chat: right on desktop, full on mobile when selected */}
      <div
        className={`
          flex flex-col flex-1 min-w-0 min-h-0
          ${showChat ? "flex" : "hidden md:flex md:flex-col"}
        `}
      >
        {selectedContactId ? (
          <>
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]">
              <button
                type="button"
                onClick={() => {
                  setSelectedContactId(null);
                  router.replace("/portal/messages", { scroll: false });
                }}
                className="md:hidden p-2 -ml-2 rounded-lg hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] min-w-[44px] flex items-center justify-center text-[color:var(--wp-text-secondary)]"
                aria-label="Zpět na seznam"
              >
                <ArrowLeft size={20} />
              </button>
              <span className="flex-1 font-semibold text-[color:var(--wp-text)] truncate">
                {contactName || "Kontakt"}
              </span>
              <Link
                href={`/portal/contacts/${selectedContactId}`}
                className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 min-h-[44px]"
              >
                <User size={18} />
                Otevřít profil
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {msgs.length === 0 && (
                <p className="text-center text-[color:var(--wp-text-secondary)] text-sm py-8">
                  Zatím žádné zprávy. Napište první zprávu.
                </p>
              )}
              {msgs.map((m) => (
                <MessageBubble
                  key={m.id}
                  m={m}
                  attachments={msgAttachments[m.id] ?? []}
                  isOwn={m.senderType === "advisor"}
                />
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 border-t border-[color:var(--wp-surface-card-border)] p-3 bg-[color:var(--wp-surface-card)]">
              {sendError ? (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-rose-800 font-semibold">{sendError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSendError(null);
                      handleSend();
                    }}
                    disabled={isPending}
                    className="shrink-0 min-h-[40px] px-4 rounded-lg bg-rose-600 text-white text-sm font-bold disabled:opacity-50"
                  >
                    Zkusit znovu
                  </button>
                </div>
              ) : null}
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((f, i) => (
                    <span
                      key={i}
                      className="text-xs bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] px-2 py-1 rounded-lg flex items-center gap-1"
                    >
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)]"
                        aria-label="Odstranit přílohu"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
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
                  className="shrink-0 rounded-xl p-2.5 text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text-secondary)] min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Přidat přílohu"
                >
                  <Paperclip size={20} />
                </button>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Napište zprávu… (Enter odeslat, Shift+Enter nový řádek)"
                  rows={2}
                  className="flex-1 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3 py-2.5 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 resize-none min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending || (body.trim() === "" && files.length === 0)}
                  className={clsx(portalPrimaryButtonClassName, "shrink-0 px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50")}
                >
                  Odeslat
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[color:var(--wp-text-secondary)] text-sm p-8 md:border-l border-[color:var(--wp-surface-card-border)]">
            Vyberte konverzaci v seznamu vlevo.
          </div>
        )}
      </div>
    </div>
  );
}
