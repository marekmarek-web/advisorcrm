"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import {
  Send,
  ChevronRight,
  RotateCcw,
  CheckSquare,
  User,
  FileText,
  Paperclip,
  Mail,
  Copy,
  Check,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { postAssistantChatStreaming } from "@/lib/ai/assistant-chat-client";
import {
  buildAssistantChatRequestBody,
  parsePortalContactIdFromPathname,
} from "@/lib/ai/assistant-chat-request";
import { mapActionPayloadsToSuggestedActions } from "@/lib/ai/map-action-payload-to-suggested";

const AI_ASSISTANT_API_SESSION_KEY = "aidvisora_ai_assistant_api_session_id";

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
  executionState?: {
    status: "draft" | "awaiting_confirmation" | "executing" | "completed" | "partial_failure";
    planId?: string;
    totalSteps?: number;
    pendingSteps?: number;
  } | null;
  contextState?: { channel: string | null; lockedClientId: string | null } | null;
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

function executionBadge(
  state: NonNullable<ChatMessage["executionState"]>,
): { text: string; className: string } {
  if (state.status === "awaiting_confirmation") {
    return { text: "Čeká na potvrzení", className: "text-amber-700 bg-amber-50 border-amber-200" };
  }
  if (state.status === "executing") {
    return { text: "Probíhá provedení", className: "text-indigo-700 bg-indigo-50 border-indigo-200" };
  }
  if (state.status === "partial_failure") {
    return { text: "Částečně selhalo", className: "text-rose-700 bg-rose-50 border-rose-200" };
  }
  if (state.status === "completed") {
    return { text: "Provedeno", className: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  }
  return { text: "Návrh akcí", className: "text-slate-700 bg-slate-50 border-slate-200" };
}

/* ------------------------------------------------------------------ */
/*  Starters (quick prompts shown before first message)               */
/* ------------------------------------------------------------------ */

const QUICK_STARTERS = [
  { emoji: "📋", label: "Jaké úkoly mám dnes?" },
  { emoji: "⚠️", label: "Co je urgentní v mém portfoliu?" },
  { emoji: "📞", label: "Kteří klienti potřebují pozornost?" },
  { emoji: "💼", label: "Přehled aktivních obchodů" },
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
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm p-1">
          <AiAssistantBrandIcon size={18} className="max-w-full max-h-full" />
        </div>
      ) : null}

      <div className={cx("max-w-[85%] space-y-2", isUser ? "items-end" : "items-start")}>
        {/* Main bubble */}
        <div
          className={cx(
            "rounded-2xl px-3.5 py-2.5",
            isUser
              ? "bg-indigo-600 text-white rounded-tr-sm"
              : "bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text)] rounded-tl-sm shadow-sm"
          )}
        >
          <p className={cx("text-sm leading-relaxed whitespace-pre-wrap", isUser ? "text-white" : "text-[color:var(--wp-text)]")}>
            {msg.text}
          </p>
          {!isUser && msg.executionState ? (
            <div className={cx("mt-2 inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-bold", executionBadge(msg.executionState).className)}>
              <span>{executionBadge(msg.executionState).text}</span>
              {msg.executionState.totalSteps ? <span>• {msg.executionState.totalSteps} kroků</span> : null}
              {(msg.executionState.pendingSteps ?? 0) > 0 ? <span>• čeká {msg.executionState.pendingSteps}</span> : null}
            </div>
          ) : null}
          {!isUser && msg.contextState?.lockedClientId ? (
            <p className="mt-1 text-[10px] text-[color:var(--wp-text-tertiary)] font-semibold">
              Zamčený klient: {msg.contextState.lockedClientId.slice(0, 8)}…
            </p>
          ) : null}
          <p className={cx("text-[10px] mt-1", isUser ? "text-indigo-200" : "text-[color:var(--wp-text-tertiary)]")}>
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
                className="text-[11px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] px-2.5 py-1 rounded-lg"
              >
                {action.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <div className="w-7 h-7 rounded-xl bg-[color:var(--wp-surface-card-border)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={13} className="text-[color:var(--wp-text-secondary)]" />
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
      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm p-1">
        <AiAssistantBrandIcon size={18} className="max-w-full max-h-full" />
      </div>
      <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
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

const SESSION_KEY = "aidvisora_ai_chat_session";

function migrateAiChatSession(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const old = sessionStorage.getItem("weplan_ai_chat_session");
    if (old) {
      sessionStorage.setItem(SESSION_KEY, old);
      sessionStorage.removeItem("weplan_ai_chat_session");
    }
  } catch {
    /* ignore */
  }
}

let msgIdCounter = 0;
function nextId() {
  return `msg-${++msgIdCounter}`;
}

function persistSession(messages: ChatMessage[]) {
  try {
    migrateAiChatSession();
    const serializable = messages.slice(-50).map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    }));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(serializable));
  } catch {}
}

function loadSession(): ChatMessage[] {
  try {
    migrateAiChatSession();
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<ChatMessage & { timestamp: string }>;
    return parsed.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  } catch {
    return [];
  }
}

export function AiAssistantChatScreen() {
  const pathname = usePathname();
  const routeContactId = parsePortalContactIdFromPathname(pathname) ?? null;
  const [assistantSessionId, setAssistantSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);
  const [draftCopied, setDraftCopied] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const restored = loadSession();
    if (restored.length > 0) setMessages(restored);
  }, []);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(AI_ASSISTANT_API_SESSION_KEY);
      if (s) setAssistantSessionId(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    persistSession(messages);
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const bump = () => {
      if (document.activeElement === inputRef.current) {
        requestAnimationFrame(scrollToBottom);
      }
    };
    vv.addEventListener("resize", bump);
    vv.addEventListener("scroll", bump);
    return () => {
      vv.removeEventListener("resize", bump);
      vv.removeEventListener("scroll", bump);
    };
  }, [scrollToBottom]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        timestamp: new Date(),
      },
    ]);
    setInput("");
    setIsTyping(true);
    setError(null);

    startTransition(async () => {
      try {
        const complete = await postAssistantChatStreaming(
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              buildAssistantChatRequestBody(trimmed, {
                sessionId: assistantSessionId,
                routeContactId,
                channel: "mobile",
              }),
            ),
          },
          (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + chunk } : m
              )
            );
          }
        );
        if (complete.sessionId) {
          setAssistantSessionId(complete.sessionId);
          try {
            sessionStorage.setItem(AI_ASSISTANT_API_SESSION_KEY, complete.sessionId);
          } catch {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: complete.message ?? "Odpověď není k dispozici.",
                  suggestedActions: mapActionPayloadsToSuggestedActions(complete.suggestedActions ?? []),
                  referencedEntities: complete.referencedEntities ?? [],
                  warnings: complete.warnings ?? [],
                  executionState: complete.executionState ?? null,
                  contextState: complete.contextState ?? null,
                }
              : m
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se kontaktovat asistenta.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
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

  async function handleFileUpload() {
    if (files.length === 0) return;
    setIsTyping(true);
    setError(null);
    let pendingStreamAssistantId: string | undefined;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: `📎 ${files.map((f) => f.name).join(", ")}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const lastClientRef = messages
        .flatMap((m) => m.referencedEntities ?? [])
        .filter((e) => e.type === "client")
        .pop();
      const clientId =
        (routeContactId?.trim() || lastClientRef?.id?.trim()) ?? "";
      if (!clientId) {
        setError(
          "Soubor lze nahrát do trezoru klienta jen v kontextu klienta. Otevřete detail klienta a nahrajte dokument v záložce Dokumenty, nebo v chatu použijte odkaz na klienta z odpovědi asistenta."
        );
        setFiles([]);
        setIsTyping(false);
        return;
      }

      const formData = new FormData();
      files.forEach((f) => formData.append("file", f));
      formData.set("contactId", clientId);
      formData.set("uploadSource", "ai_drawer");
      formData.set("visibleToClient", "false");
      const uploadRes = await fetch("/api/documents/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload selhal");
      const uploadData = await uploadRes.json();
      const docName = uploadData?.name ?? files[0]?.name ?? "soubor";

      const streamId = nextId();
      pendingStreamAssistantId = streamId;
      setMessages((prev) => [
        ...prev,
        {
          id: streamId,
          role: "assistant",
          text: "",
          timestamp: new Date(),
        },
      ]);
      const complete = await postAssistantChatStreaming(
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            buildAssistantChatRequestBody(`Analyzuj nahraný soubor: ${docName}`, {
              sessionId: assistantSessionId,
              routeContactId,
              channel: "mobile",
            }),
          ),
        },
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId ? { ...m, text: m.text + chunk } : m
            )
          );
        }
      );
      if (complete.sessionId) {
        setAssistantSessionId(complete.sessionId);
        try {
          sessionStorage.setItem(AI_ASSISTANT_API_SESSION_KEY, complete.sessionId);
        } catch {
          /* ignore */
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId
            ? {
                ...m,
                text: complete.message ?? `Soubor ${docName} byl nahrán.`,
                suggestedActions: mapActionPayloadsToSuggestedActions(complete.suggestedActions ?? []),
                referencedEntities: complete.referencedEntities ?? [],
                warnings: complete.warnings ?? [],
                executionState: complete.executionState ?? null,
                contextState: complete.contextState ?? null,
              }
            : m
        )
      );
    } catch (e) {
      if (pendingStreamAssistantId) {
        const rid = pendingStreamAssistantId;
        setMessages((prev) => prev.filter((m) => m.id !== rid));
      }
      setError(e instanceof Error ? e.message : "Nahrání souboru selhalo.");
    } finally {
      setFiles([]);
      setIsTyping(false);
    }
  }

  async function handleDraftEmail() {
    setDraftLoading(true);
    setDraftEmail(null);
    setDraftCopied(false);
    try {
      const lastClientRef = messages
        .flatMap((m) => m.referencedEntities ?? [])
        .filter((e) => e.type === "client")
        .pop();
      const clientId = routeContactId?.trim() || lastClientRef?.id || "";
      const res = await fetch("/api/ai/assistant/draft-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, context: "follow_up" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Draft email selhal");
      setDraftEmail(data.draft ?? data.email ?? "Nepodařilo se vygenerovat e-mail.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft email selhal.");
    } finally {
      setDraftLoading(false);
    }
  }

  function copyDraft() {
    if (!draftEmail) return;
    navigator.clipboard.writeText(draftEmail).then(() => {
      setDraftCopied(true);
      setTimeout(() => setDraftCopied(false), 2000);
    }).catch(() => {});
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
    setDraftEmail(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    inputRef.current?.focus();
  }

  const isEmpty = messages.length === 0;
  const latestContextState = [...messages]
    .reverse()
    .find((m) => m.contextState?.lockedClientId)?.contextState;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 sm:px-4 sm:py-4 space-y-4">
        {isEmpty ? (
          <div className="space-y-4 pt-1 sm:space-y-6 sm:pt-4">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mx-auto shadow-lg p-2">
                <AiAssistantBrandIcon size={36} className="max-w-full max-h-full" />
              </div>
              <h2 className="text-base font-black text-[color:var(--wp-text)]">AI Asistent</h2>
              <p className="text-sm text-[color:var(--wp-text-secondary)] max-w-xs mx-auto leading-relaxed">
                Zeptejte se na cokoliv z vašeho CRM. Asistent zná vaše kontakty, úkoly, obchody a smlouvy.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] text-center">
                Rychlé otázky
              </p>
              {QUICK_STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => void sendMessage(starter.label)}
                  className="w-full text-left min-h-[48px] flex items-center gap-3 px-4 py-3 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-2xl active:border-indigo-200 active:bg-indigo-50/40 transition-colors"
                >
                  <span className="text-xl flex-shrink-0">{starter.emoji}</span>
                  <span className="text-sm font-semibold text-[color:var(--wp-text-secondary)] flex-1">{starter.label}</span>
                  <ChevronRight size={15} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {latestContextState?.lockedClientId ? (
          <div className="sticky top-0 z-10">
            <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700">
              <span>Kontext lock</span>
              <span>•</span>
              <span>{latestContextState.lockedClientId.slice(0, 8)}…</span>
            </div>
          </div>
        ) : null}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {isTyping ? <TypingIndicator /> : null}

        {/* Draft email panel */}
        {draftEmail ? (
          <div className="bg-[color:var(--wp-surface-card)] border border-indigo-200 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
                <Mail size={16} />
                Draft e-mail
              </div>
              <button type="button" onClick={() => setDraftEmail(null)} className="p-1 text-[color:var(--wp-text-tertiary)] min-h-[36px] min-w-[36px] flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <pre className="text-xs text-[color:var(--wp-text-secondary)] whitespace-pre-wrap bg-[color:var(--wp-surface-muted)] rounded-xl p-3 max-h-[300px] overflow-y-auto">{draftEmail}</pre>
            <button
              type="button"
              onClick={copyDraft}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 min-h-[36px] px-3 rounded-lg active:bg-indigo-50"
            >
              {draftCopied ? <Check size={14} /> : <Copy size={14} />}
              {draftCopied ? "Zkopírováno!" : "Kopírovat do schránky"}
            </button>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 pt-2 pb-[max(0.75rem,var(--safe-area-bottom))]">
        {!isEmpty ? (
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={handleDraftEmail}
              disabled={draftLoading || isTyping}
              className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 min-h-[28px] px-2 disabled:opacity-50"
            >
              <Mail size={11} />
              {draftLoading ? "Generuji…" : "Draft e-mail"}
            </button>
            <button
              type="button"
              onClick={clearChat}
              className="flex items-center gap-1 text-[11px] font-bold text-[color:var(--wp-text-secondary)] min-h-[28px] px-2"
            >
              <RotateCcw size={11} /> Nový chat
            </button>
          </div>
        ) : null}

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {files.map((f, i) => (
              <span key={i} className="text-xs bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] px-2 py-1 rounded-lg flex items-center gap-1 max-w-[200px]">
                <Paperclip size={12} className="shrink-0" />
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-[color:var(--wp-text-tertiary)] ml-0.5" aria-label="Odstranit">×</button>
              </span>
            ))}
            <button type="button" onClick={handleFileUpload} disabled={isTyping} className="text-xs font-bold text-indigo-600 px-2 py-1 rounded-lg bg-indigo-50 min-h-[28px] disabled:opacity-50">
              Nahrát a analyzovat
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="sr-only"
            accept=".pdf,.doc,.docx,image/*,.csv"
            onChange={(e) => {
              const added = Array.from(e.target.files ?? []);
              setFiles((prev) => prev.concat(added));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 rounded-2xl border border-[color:var(--wp-surface-card-border)] flex items-center justify-center flex-shrink-0 text-[color:var(--wp-text-secondary)] active:bg-[color:var(--wp-surface-muted)]"
            aria-label="Nahrát soubor"
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onFocus={() => requestAnimationFrame(scrollToBottom)}
            onKeyDown={handleKeyDown}
            placeholder="Napište zprávu…"
            disabled={isTyping}
            className="flex-1 resize-none min-h-[44px] max-h-[120px] rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3.5 py-3 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:border-indigo-400 focus:bg-[color:var(--wp-surface-card)] transition-colors disabled:opacity-50"
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
