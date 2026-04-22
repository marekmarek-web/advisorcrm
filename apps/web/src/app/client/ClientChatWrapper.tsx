"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, RefreshCw, Send } from "lucide-react";
import {
  loadThreadMessages,
  loadThreadAttachmentsByContact,
  sendPortalMessage,
  sendPortalMessageWithAttachments,
  type MessageRow,
  type MessageAttachmentRow,
} from "@/app/actions/messages";

const POLL_INTERVAL = 10_000;

type ClientChatWrapperProps = {
  contactId: string;
};

export function ClientChatWrapper({ contactId }: ClientChatWrapperProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, MessageAttachmentRow[]>>({});
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadMessages(options?: { manual?: boolean }) {
    if (options?.manual) setIsReloading(true);
    try {
      const [msgRes, attRes] = await Promise.all([
        loadThreadMessages(contactId, { markRead: true }),
        loadThreadAttachmentsByContact(contactId),
      ]);
      if (msgRes.ok) setMessages(msgRes.messages);
      else if (msgRes.error) throw new Error(msgRes.error);
      if (attRes.ok) setAttachmentsByMessage(attRes.byMessageId);
      setPollError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nelze obnovit zprávy.";
      setPollError(msg);
      // eslint-disable-next-line no-console
      console.warn("[ClientChatWrapper] polling failed", e);
    } finally {
      if (options?.manual) setIsReloading(false);
    }
  }

  useEffect(() => {
    loadMessages();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadMessages();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [contactId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed && files.length === 0) return;
    setSendError(null);
    const toSendFiles = [...files];
    startTransition(async () => {
      try {
        if (toSendFiles.length > 0) {
          const formData = new FormData();
          formData.set("body", trimmed || "(příloha)");
          toSendFiles.forEach((f) => formData.append("file", f));
          const sent = await sendPortalMessageWithAttachments(contactId, formData);
          if (!sent.ok) {
            setSendError(sent.error);
            return;
          }
        } else {
          const sent = await sendPortalMessage(contactId, trimmed);
          if (!sent.ok) {
            setSendError(sent.error);
            return;
          }
        }
        setBody("");
        setFiles([]);
        await loadMessages();
      } catch (e) {
        setSendError(e instanceof Error ? e.message : "Odeslání se nezdařilo.");
      }
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-[color:var(--wp-main-scroll-bg)]/30 client-hide-scrollbar">
      {messages.length > 0 && (
        <div className="flex justify-center mb-6">
          <span className="px-3 py-1 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] text-[10px] font-black uppercase tracking-widest rounded-full">
            Dnes
          </span>
        </div>
      )}

      {pollError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
        >
          <span>Nelze obnovit zprávy — zobrazujeme poslední známý stav.</span>
          <button
            type="button"
            onClick={() => void loadMessages({ manual: true })}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            <RefreshCw size={12} className={isReloading ? "animate-spin" : ""} />
            Zkusit znovu
          </button>
        </div>
      )}

      <div className="space-y-4">
        {messages.length === 0 && !pollError && (
          <p className="text-sm text-[color:var(--wp-text-secondary)] text-center">Zatím žádné zprávy.</p>
        )}

        {messages.map((message) => {
          const isClientMessage = message.senderType === "client";
          const attachments = attachmentsByMessage[message.id] ?? [];
          return (
            <div
              key={message.id}
              className={`flex flex-col max-w-[80%] ${
                isClientMessage ? "ml-auto items-end" : "mr-auto items-start"
              }`}
            >
              <div
                className={`p-4 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                  isClientMessage
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-white border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text)] rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                {attachments.length > 0 ? (
                  <div className={`mt-3 space-y-2 ${isClientMessage ? "text-white" : ""}`}>
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          isClientMessage ? "border-white/25 bg-white/10" : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]"
                        }`}
                      >
                        <a
                          href={`/api/messages/attachments/${a.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-medium underline ${isClientMessage ? "text-white" : "text-indigo-600"}`}
                          title={a.fileName}
                        >
                          Příloha: {a.fileName}
                        </a>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1.5 px-1">
                {new Date(message.createdAt).toLocaleTimeString("cs-CZ", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          );
        })}
      </div>

      <div ref={bottomRef} />

      {sendError ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{sendError}</p>
      ) : null}

      <div className="sticky bottom-0 pt-5 bg-gradient-to-t from-slate-50/80 to-transparent">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          className="sr-only"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        {files.length > 0 ? (
          <p className="text-xs text-[color:var(--wp-text-secondary)] mb-2 px-1">
            {files.length === 1 ? `1 soubor vybrán` : `${files.length} soubory vybrány`}
          </p>
        ) : null}
        <div className="flex items-end gap-2 bg-white border border-[color:var(--wp-surface-card-border)] rounded-[24px] p-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-3 text-[color:var(--wp-text-secondary)] hover:text-indigo-600 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Přiložit soubor"
            title="Přiložit soubor"
          >
            <Paperclip size={20} />
          </button>
          <textarea
            rows={1}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Napište zprávu svému poradci..."
            className="flex-1 bg-transparent border-none outline-none py-3 px-2 text-sm font-medium text-[color:var(--wp-text)] resize-none max-h-32"
          />
          <button
            onClick={handleSubmit}
            disabled={isPending || (!body.trim() && files.length === 0)}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md shrink-0 mb-0.5 mr-0.5 disabled:opacity-50 min-h-[44px] min-w-[44px]"
            aria-label="Odeslat zprávu"
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
