"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Sparkles,
  Send,
  ChevronRight,
  RotateCcw,
  CheckSquare,
  User,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { EmptyState, LoadingSkeleton, MobileCard } from "@/app/shared/mobile-ui/primitives";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: Date;
  suggestedActions?: SuggestedAction[];
  referencedEntities?: ReferencedEntity[];
  warnings?: string[];
}

interface SuggestedAction {
  type: string;
  label: string;
  payload: Record<string, unknown>;
}

interface ReferencedEntity {
  type: string;
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Starters (quick prompts shown before first message)               */
/* ------------------------------------------------------------------ */

const QUICK_STARTERS = [
  { emoji: "📋", label: "Jaké úkoly mám dnes?" },
  { emoji: "⚠️", label: "Co je urgentní v mém portfoliu?" },
  { emoji: "📞", label: "Kteří klienti potřebují pozornost?" },
  { emoji: "💼", label: "Přehled aktivního pipeline" },
  { emoji: "📄", label: "Nejnovější smlouvy ke kontrole" },
];

/* ------------------------------------------------------------------ */
/*  Message bubble                                                     */
/* ------------------------------------------------------------------ */

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  function getEntityLink(entity: ReferencedEntity): string {
    switch (entity.type) {
      case "review": return `/portal/contracts/review/${entity.id}`;
      case "task": return `/portal/tasks`;
      case "client": return `/portal/contacts/${entity.id}`;
      default: return "#";
    }
  }

  function getEntityIcon(type: string) {
    switch (type) {
      case "review": return <FileText size={12} />;
      case "task": return <CheckSquare size={12} />;
      case "client": return <User size={12} />;
      default: return <ChevronRight size={12} />;
    }
  }

  function getEntityLabel(type: string): string {
    switch (type) {
      case "review": return "AI smlouva";
      case "task": return "Úkoly";
      case "client": return "Klient";
      default: return "Otevřít";
    }
  }

  return (
    <div className={cx("flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
          <Sparkles size={13} className="text-white" />
        </div>
      ) : null}

      <div className={cx("max-w-[85%] space-y-2", isUser ? "items-end" : "items-start")}>
        {/* Main bubble */}
        <div
          className={cx(
            "rounded-2xl px-3.5 py-2.5",
            isUser
              ? "bg-indigo-600 text-white rounded-tr-sm"
              : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
          )}
        >
          <p className={cx("text-sm leading-relaxed whitespace-pre-wrap", isUser ? "text-white" : "text-slate-800")}>
            {msg.text}
          </p>
          <p className={cx("text-[10px] mt-1", isUser ? "text-indigo-200" : "text-slate-400")}>
            {msg.timestamp.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        {/* Warnings */}
        {(msg.warnings ?? []).length > 0 ? (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
            {msg.warnings!.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 font-semibold">{w}</p>
            ))}
          </div>
        ) : null}

        {/* Referenced entities */}
        {(msg.referencedEntities ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {msg.referencedEntities!.map((entity, i) => (
              <Link
                key={`${entity.type}-${entity.id}-${i}`}
                href={getEntityLink(entity)}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg min-h-[28px]"
              >
                {getEntityIcon(entity.type)}
                <span>{getEntityLabel(entity.type)}</span>
                <ChevronRight size={10} />
              </Link>
            ))}
          </div>
        ) : null}

        {/* Suggested actions */}
        {(msg.suggestedActions ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {msg.suggestedActions!.slice(0, 4).map((action, i) => (
              <span
                key={i}
                className="text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg"
              >
                {action.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <div className="w-7 h-7 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={13} className="text-slate-600" />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Typing indicator                                                   */
/* ------------------------------------------------------------------ */

function TypingIndicator() {
  return (
    <div className="flex gap-2.5 justify-start">
      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
        <Sparkles size={13} className="text-white" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main screen                                                        */
/* ------------------------------------------------------------------ */

let msgIdCounter = 0;
function nextId() {
  return `msg-${++msgIdCounter}`;
}

export function AiAssistantChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  /** iOS: keep latest messages visible when the on-screen keyboard resizes the visual viewport. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const bump = () => {
      requestAnimationFrame(() => scrollToBottom());
    };
    vv.addEventListener("resize", bump);
    vv.addEventListener("scroll", bump);
    return () => {
      vv.removeEventListener("resize", bump);
      vv.removeEventListener("scroll", bump);
    };
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/assistant/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error ?? `Chyba ${res.status}`);
        }

        const assistantMsg: ChatMessage = {
          id: nextId(),
          role: "assistant",
          text: data.message ?? "Odpověď není k dispozici.",
          timestamp: new Date(),
          suggestedActions: data.suggestedActions ?? [],
          referencedEntities: data.referencedEntities ?? [],
          warnings: data.warnings ?? [],
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se kontaktovat asistenta.");
        const errMsg: ChatMessage = {
          id: nextId(),
          role: "assistant",
          text: "Omlouvám se, momentálně nejsem dostupný. Zkuste to prosím znovu.",
          timestamp: new Date(),
          warnings: [e instanceof Error ? e.message : "Neočekávaná chyba."],
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsTyping(false);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ---- Message list ---- */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Empty state / starters */}
        {isEmpty ? (
          <div className="space-y-6 pt-4">
            {/* Intro */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mx-auto shadow-lg">
                <Sparkles size={26} className="text-white" />
              </div>
              <h2 className="text-base font-black text-slate-900">AI Asistent</h2>
              <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                Zeptejte se na cokoliv z vašeho CRM. Asistent zná vaše kontakty, úkoly, pipeline a smlouvy.
              </p>
            </div>

            {/* Quick starters */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
                Rychlé otázky
              </p>
              {QUICK_STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => void sendMessage(starter.label)}
                  className="w-full text-left min-h-[48px] flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                >
                  <span className="text-xl flex-shrink-0">{starter.emoji}</span>
                  <span className="text-sm font-semibold text-slate-700 flex-1">{starter.label}</span>
                  <ChevronRight size={15} className="text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Messages */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Typing indicator */}
        {isTyping ? <TypingIndicator /> : null}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ---- Input bar ---- */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-3 pt-3 pb-[max(0.75rem,var(--safe-area-bottom))]">
        {!isEmpty ? (
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={clearChat}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-500 min-h-[28px] px-2"
            >
              <RotateCcw size={11} /> Nový chat
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onFocus={() => requestAnimationFrame(() => scrollToBottom())}
            onKeyDown={handleKeyDown}
            placeholder="Napište zprávu…"
            disabled={isTyping}
            className="flex-1 resize-none min-h-[44px] max-h-[120px] rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || isTyping}
            className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Send size={18} className="text-white" />
          </button>
        </div>

        {error ? (
          <p className="mt-1.5 text-xs font-bold text-rose-500 px-1">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
