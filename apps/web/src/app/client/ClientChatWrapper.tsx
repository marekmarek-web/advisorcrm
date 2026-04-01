"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { getMessages, markMessagesRead, sendMessage } from "@/app/actions/messages";
import type { MessageRow } from "@/app/actions/messages";

const POLL_INTERVAL = 10_000;

type ClientChatWrapperProps = {
  contactId: string;
};

export function ClientChatWrapper({ contactId }: ClientChatWrapperProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    try {
      const data = await getMessages(contactId);
      setMessages(data);
      markMessagesRead(contactId).catch(() => {});
    } catch {}
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
    if (!trimmed) return;
    setBody("");
    startTransition(async () => {
      await sendMessage(contactId, trimmed);
      await loadMessages();
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30 client-hide-scrollbar">
      <div className="flex justify-center mb-6">
        <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
          Dnes
        </span>
      </div>

      <div className="space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500 text-center">Zatím žádné zprávy.</p>
        )}

        {messages.map((message) => {
          const isClientMessage = message.senderType === "client";
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
                    : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm"
                }`}
              >
                {message.body}
              </div>
              <span className="text-[10px] font-bold text-slate-400 mt-1.5 px-1">
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

      <div className="sticky bottom-0 pt-5 bg-gradient-to-t from-slate-50/80 to-transparent">
        <div className="flex items-end gap-3 bg-white border border-slate-200 rounded-[24px] p-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
          <textarea
            rows={1}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Napište zprávu svému poradci..."
            className="flex-1 bg-transparent border-none outline-none py-3 px-4 text-sm font-medium text-slate-700 resize-none max-h-32"
          />
          <button
            onClick={handleSubmit}
            disabled={isPending || !body.trim()}
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
