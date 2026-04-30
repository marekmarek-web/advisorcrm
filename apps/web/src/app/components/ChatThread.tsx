"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getMessages, sendMessage, markMessagesRead } from "@/app/actions/messages";
import type { MessageRow } from "@/app/actions/messages";
import { ChatTypingIndicator } from "@/app/components/chat/ChatTypingIndicator";

const POLL_INTERVAL = 10_000;

export function ChatThread({
  contactId,
  currentUserType,
}: {
  contactId: string;
  /** "client" or "advisor" – determines which side messages appear on. */
  currentUserType: "client" | "advisor";
}) {
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const data = await getMessages(contactId);
      setMsgs(data);
      markMessagesRead(contactId).catch(() => {});
    } catch {}
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void load();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [contactId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, isPending]);

  function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBody("");
    startTransition(async () => {
      try {
        await sendMessage(contactId, trimmed);
        await load();
      } catch {}
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-monday-border bg-monday-surface overflow-hidden" style={{ height: 420 }}>
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <p className="text-center text-monday-text-muted text-sm py-8">Zatím žádné zprávy.</p>
        )}
        {msgs.map((m) => {
          const isOwn = m.senderType === currentUserType;
          return (
            <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                  isOwn
                    ? "bg-monday-blue text-white"
                    : "bg-monday-bg text-monday-text border border-monday-border"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-1 ${isOwn ? "text-white/70" : "text-monday-text-muted"}`}>
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
        })}
        {isPending ? (
          <ChatTypingIndicator role="user" label="Odesílám…" className="px-0" />
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-monday-border p-3 flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Napište zprávu…"
          className="flex-1 rounded-[6px] border border-monday-border bg-white px-3 py-2 text-sm text-monday-text focus:outline-none focus:border-monday-blue"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending || !body.trim()}
          className="rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
