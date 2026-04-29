"use client";

import { useEffect, useRef, useState, useTransition, useCallback, useMemo } from "react";
import {
  Send,
  ChevronRight,
  Loader2,
  RotateCcw,
  CheckSquare,
  User,
  FileText,
  Paperclip,
  History,
  Mail,
  Copy,
  Check,
  X,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { useToast } from "@/app/components/Toast";
import { useConfirm } from "@/app/components/ConfirmDialog";
import {
  postAssistantChatStreaming,
  buildAssistantChatRequestBody,
  buildAssistantConfirmExecutionBody,
  buildAssistantCancelPlanBody,
  parsePortalContactIdFromPathname,
  parsePortalOpportunityIdFromPathname,
} from "@/lib/ai/assistant-chat-client";
import type { ImageAssetPayload } from "@/lib/ai/assistant-chat-client";
import {
  mergePendingImageAssets,
  removePendingImageAssetAt,
} from "@/lib/ai/assistant-composer-pending-images";
import {
  extractImageFilesFromClipboardData,
  logAssistantImagePipelineClient,
} from "@/lib/ai/assistant-clipboard-image-paste";
import type { AssistantResponse } from "@/lib/ai/assistant-tool-router";
import { mapActionPayloadsToSuggestedActions } from "@/lib/ai/map-action-payload-to-suggested";
import {
  ExecutionBadge,
  ContextLockBadge,
  ConfirmationPreviewPanel,
  StepOutcomeCard,
  SuggestedNextStepsChips,
  WarningsBlock,
} from "@/app/portal/AssistantExecutionUI";
import type { StepOutcomeSummary, StepPreviewItem } from "@/lib/ai/assistant-execution-ui";
import {
  listAdvisorAssistantConversations,
  loadAdvisorAssistantConversationHistory,
  renameAdvisorAssistantConversation,
  deleteAdvisorAssistantConversation,
  type AdvisorAssistantConversationListItemDto,
} from "@/app/actions/assistant-conversations";
import {
  formatAdvisorAssistantConversationListLabel,
  ASSISTANT_CONVERSATION_DISPLAY_TITLE_MAX_LEN,
} from "@/lib/ai/assistant-conversation-label";
import type { AdvisorAssistantHistoryMessageDto } from "@/lib/ai/assistant-history-mapper";
import { AssistantUserMessageImages } from "@/app/components/AssistantUserMessageImages";

const AI_ASSISTANT_API_SESSION_KEY = "aidvisora_ai_assistant_api_session_id";

function imageMimeForAssistantFile(file: File): string {
  if (file.type && file.type.startsWith("image/")) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".heif")) return "image/heif";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return file.type || "application/octet-stream";
}

function isLikelyAssistantImageFile(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  const n = file.name.toLowerCase();
  return /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(n);
}

function readImageFilesAsPayloads(files: File[]): Promise<ImageAssetPayload[]> {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<ImageAssetPayload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              url: reader.result as string,
              mimeType: imageMimeForAssistantFile(file),
              filename: file.name || null,
              sizeBytes: file.size,
            });
          };
          reader.onerror = () => reject(new Error("read_failed"));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

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
  imageAssets?: ImageAssetPayload[];
  chatImagesTruncatedForStorage?: boolean;
  suggestedActions?: SuggestedAction[];
  referencedEntities?: ReferencedEntity[];
  warnings?: string[];
  executionState?: {
    status: "draft" | "awaiting_confirmation" | "executing" | "completed" | "partial_failure";
    planId?: string;
    totalSteps?: number;
    pendingSteps?: number;
    stepPreviews?: StepPreviewItem[];
    clientLabel?: string;
  } | null;
  contextState?: {
    channel: string | null;
    lockedClientId: string | null;
    lockedClientLabel?: string | null;
  } | null;
  stepOutcomes?: StepOutcomeSummary[];
  suggestedNextSteps?: string[];
  suggestedNextStepItems?: AssistantResponse["suggestedNextStepItems"];
  hasPartialFailure?: boolean;
}

function historyDtoToMobileMessages(dtos: AdvisorAssistantHistoryMessageDto[]): ChatMessage[] {
  return dtos.map((d) => {
    if (d.kind === "user") {
      return {
        id: `db-${d.stableKey}`,
        role: "user",
        text: d.content,
        timestamp: new Date(d.createdAtIso),
        ...(d.imageAssets?.length ? { imageAssets: d.imageAssets } : {}),
        ...(d.chatImagesTruncatedForStorage ? { chatImagesTruncatedForStorage: true } : {}),
      };
    }
    return {
      id: `db-${d.stableKey}`,
      role: "assistant",
      text: d.content,
      timestamp: new Date(d.createdAtIso),
      warnings: d.warnings,
      executionState: d.executionState ?? undefined,
      contextState: d.contextState ?? undefined,
    };
  });
}

interface SuggestedAction {
  type: string;
  label: string;
  payload: Record<string, unknown>;
}

interface ReferencedEntity {
  type: string;
  id: string;
  label?: string;
}

// executionBadge moved to AssistantExecutionUI.tsx (ExecutionBadge component)

/* ------------------------------------------------------------------ */
/*  Starters (quick prompts shown before first message)               */
/* ------------------------------------------------------------------ */

const QUICK_STARTERS = [
  {
    label: "Úkoly na dnes",
    prompt: "Jaké úkoly mám dnes a co mám řešit jako první?",
    icon: CheckSquare,
    iconClass: "bg-violet-50 text-violet-600 ring-violet-100",
  },
  {
    label: "Urgentní věci",
    prompt: "Co je dnes urgentní v mém portfoliu?",
    icon: Mail,
    iconClass: "bg-amber-50 text-amber-600 ring-amber-100",
  },
  {
    label: "Klienti k řešení",
    prompt: "Kteří klienti potřebují moji pozornost?",
    icon: User,
    iconClass: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  },
  {
    label: "Aktivní obchody",
    prompt: "Ukaž mi přehled aktivních obchodů a další kroky.",
    icon: ChevronRight,
    iconClass: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  },
  {
    label: "Smlouvy ke kontrole",
    prompt: "Jaké smlouvy čekají na kontrolu?",
    icon: FileText,
    iconClass: "bg-slate-100 text-slate-500 ring-slate-200",
  },
];

/* ------------------------------------------------------------------ */
/*  Message bubble                                                     */
/* ------------------------------------------------------------------ */

function MessageBubble({
  msg,
  onSuggestedAction,
  onNextStep,
  onFocusComposer,
  stepSelectionByPlanId,
  onToggleStepForPlan,
  stickyLockedClientId,
}: {
  msg: ChatMessage;
  onSuggestedAction?: (action: SuggestedAction) => void;
  onNextStep?: (text: string) => void;
  onFocusComposer?: () => void;
  stepSelectionByPlanId?: Record<string, Record<string, boolean>>;
  onToggleStepForPlan?: (planId: string, stepId: string) => void;
  /** Stejný klient jako horní sticky badge — duplicitní chip v bublině neukazujeme (6E). */
  stickyLockedClientId?: string | null;
}) {
  const isUser = msg.role === "user";

  function getEntityLink(entity: ReferencedEntity): string {
    switch (entity.type) {
      case "review":
      case "contract_review":
      case "ai_review":
        return `/portal/contracts/review/${entity.id}`;
      case "task":
      case "createTask":
      case "createFollowUp":
      case "createReminder":
        return `/portal/tasks`;
      case "client":
      case "contact":
      case "createContact":
      case "updateContact":
        return `/portal/contacts/${entity.id}`;
      case "opportunity":
      case "createOpportunity":
      case "updateOpportunity":
      case "createServiceCase":
      case "createClientRequest":
        return `/portal/pipeline/${entity.id}`;
      default:
        return "#";
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
      case "review":
      case "contract_review":
      case "ai_review":
        return "AI smlouva";
      case "task":
      case "createTask":
      case "createFollowUp":
      case "createReminder":
        return "Úkoly";
      case "client":
      case "contact":
      case "createContact":
      case "updateContact":
        return "Klient";
      case "opportunity":
      case "createOpportunity":
      case "updateOpportunity":
      case "createServiceCase":
      case "createClientRequest":
        return "Obchod";
      default:
        return "Otevřít";
    }
  }

  return (
    <div className={cx("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[14px] border border-indigo-100 bg-white p-1 shadow-[0_14px_28px_-22px_rgba(79,70,229,.38)]">
          <AiAssistantBrandIcon size={24} variant="colorOnWhite" className="max-h-full max-w-full" />
        </div>
      ) : null}

      <div className={cx("max-w-[85%] space-y-2", isUser ? "items-end" : "items-start")}>
        {/* Main bubble */}
        <div
          className={cx(
            "px-4 py-3 shadow-[0_18px_34px_-30px_rgba(15,23,42,.34)]",
            isUser
              ? "rounded-[22px] rounded-br-[10px] border border-indigo-100 bg-indigo-50 text-indigo-950"
              : "relative overflow-hidden rounded-[24px] border border-white/85 bg-white/95 text-slate-700 ring-1 ring-slate-200/40 backdrop-blur-xl"
          )}
        >
          {!isUser ? (
            <div className="absolute inset-x-0 top-0 h-[5px] rounded-t-[24px] bg-gradient-to-r from-violet-400 via-indigo-400 to-emerald-300" />
          ) : null}
          <p className={cx("whitespace-pre-wrap text-[13px] font-semibold leading-6", isUser ? "text-indigo-950" : "text-slate-600")}>
            {msg.text}
          </p>
          {isUser &&
            ((msg.imageAssets?.length ?? 0) > 0 || msg.chatImagesTruncatedForStorage) && (
              <AssistantUserMessageImages
                imageAssets={msg.imageAssets ?? []}
                truncatedNote={
                  msg.chatImagesTruncatedForStorage
                    ? "Část náhledů se nevešla do úložiště konverzace — původní soubory mějte případně u sebe."
                    : null
                }
              />
            )}
          {!isUser && msg.executionState ? (
            <>
              <ExecutionBadge
                status={msg.executionState.status}
                totalSteps={msg.executionState.totalSteps}
                pendingSteps={msg.executionState.pendingSteps}
                inline
              />
              {(msg.executionState.status === "awaiting_confirmation" || msg.executionState.status === "draft") &&
                (msg.executionState.stepPreviews?.length ?? 0) > 0 && (
                  <ConfirmationPreviewPanel
                    stepPreviews={msg.executionState.stepPreviews!}
                    clientLabel={msg.executionState.clientLabel}
                    isDraft={msg.executionState.status === "draft"}
                    selectable={msg.executionState.status === "awaiting_confirmation"}
                    stepSelection={
                      msg.executionState.planId
                        ? stepSelectionByPlanId?.[msg.executionState.planId]
                        : undefined
                    }
                    onToggleStep={
                      msg.executionState.planId && onToggleStepForPlan
                        ? (stepId) => onToggleStepForPlan(msg.executionState!.planId!, stepId)
                        : undefined
                    }
                    advisoryHints={(msg.executionState.stepPreviews ?? [])
                      .filter(s => (s.validationWarnings?.length ?? 0) > 0)
                      .flatMap(s => s.validationWarnings!.map(w => `${s.label}: ${w}`))}
                  />
                )}
            </>
          ) : null}
          {!isUser &&
          msg.contextState?.lockedClientId &&
          !(stickyLockedClientId && msg.contextState.lockedClientId === stickyLockedClientId) &&
          !(
            (msg.executionState?.stepPreviews?.length ?? 0) > 0 && Boolean(msg.executionState?.clientLabel)
          ) ? (
            <div className="mt-1">
              <ContextLockBadge
                lockedClientId={msg.contextState.lockedClientId}
                lockedClientLabel={msg.contextState.lockedClientLabel}
                className="text-[10px]"
              />
            </div>
          ) : null}
          <p className={cx("mt-2 text-[10px] font-bold", isUser ? "text-indigo-300" : "text-slate-400")}>
            {msg.timestamp.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        {/* Warnings */}
        {(msg.warnings ?? []).length > 0 ? (
          <WarningsBlock warnings={msg.warnings!} />
        ) : null}

        {/* Step outcomes */}
        {(msg.stepOutcomes ?? []).length > 0 ? (
          <StepOutcomeCard outcomes={msg.stepOutcomes!} hasPartialFailure={msg.hasPartialFailure} />
        ) : null}

        {/* Suggested next steps */}
        {((msg.suggestedNextStepItems?.length ?? 0) > 0 || (msg.suggestedNextSteps ?? []).length > 0) &&
        (onNextStep || onFocusComposer) ? (
          <SuggestedNextStepsChips
            stepItems={msg.suggestedNextStepItems}
            steps={msg.suggestedNextSteps}
            onSend={onNextStep}
            onFocusComposer={onFocusComposer}
          />
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
                <span>{entity.label?.trim() || getEntityLabel(entity.type)}</span>
                <ChevronRight size={10} />
              </Link>
            ))}
          </div>
        ) : null}

        {/* Suggested actions */}
        {(msg.suggestedActions ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {msg.suggestedActions!.slice(0, 6).map((action, i) =>
              onSuggestedAction ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSuggestedAction(action)}
                  className="text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg min-h-[36px] text-left active:bg-indigo-100"
                >
                  {action.label.length > 40 ? `${action.label.slice(0, 38)}…` : action.label}
                </button>
              ) : (
                <span
                  key={i}
                  className="text-[11px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] px-2.5 py-1 rounded-lg"
                >
                  {action.label}
                </span>
              ),
            )}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-slate-200 text-slate-500">
          <User size={14} />
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
    <div className="flex justify-start gap-3">
      <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[14px] border border-indigo-100 bg-white p-1 shadow-[0_14px_28px_-22px_rgba(79,70,229,.38)]">
        <AiAssistantBrandIcon size={24} variant="colorOnWhite" className="max-h-full max-w-full" />
      </div>
      <div className="rounded-[24px] border border-white/85 bg-white/95 px-4 py-3 shadow-[0_18px_34px_-30px_rgba(15,23,42,.34)] ring-1 ring-slate-200/40 backdrop-blur-xl">
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

/** M25: how many image refs to keep per message in sessionStorage. */
const PERSIST_IMAGE_ASSETS_PER_MESSAGE = 4;
/** M25: max data-URL length (approx bytes) allowed per persisted thumb. Larger
 * URLs are replaced by `chatImagesTruncatedForStorage = true` so the bubble
 * still tells the user "images were sent" without blowing sessionStorage. */
const PERSIST_IMAGE_ASSET_MAX_URL_CHARS = 80_000;

function persistSession(messages: ChatMessage[]) {
  try {
    migrateAiChatSession();
    const serializable = messages.slice(-50).map((m) => {
      // M25: keep small thumbnail/urls so reloaded sessions don't lose the
      // "user sent a photo" affordance. Drop any payload that is too big to
      // store safely and mark the bubble with `chatImagesTruncatedForStorage`.
      let imageAssets: ImageAssetPayload[] | undefined;
      let truncated = m.chatImagesTruncatedForStorage === true;
      if (m.imageAssets && m.imageAssets.length > 0) {
        const capped = m.imageAssets.slice(0, PERSIST_IMAGE_ASSETS_PER_MESSAGE);
        if (m.imageAssets.length > PERSIST_IMAGE_ASSETS_PER_MESSAGE) {
          truncated = true;
        }
        const safe = capped.filter((a) => {
          if (typeof a.url !== "string") return false;
          if (a.url.length > PERSIST_IMAGE_ASSET_MAX_URL_CHARS) {
            truncated = true;
            return false;
          }
          return true;
        });
        if (safe.length > 0) imageAssets = safe;
      }
      const { imageAssets: _drop, chatImagesTruncatedForStorage: _t, ...rest } = m;
      return {
        ...rest,
        timestamp: m.timestamp.toISOString(),
        ...(imageAssets ? { imageAssets } : {}),
        ...(truncated ? { chatImagesTruncatedForStorage: true } : {}),
      };
    });
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
  const toast = useToast();
  const confirm = useConfirm();
  const pathname = usePathname();
  const router = useRouter();
  const routeContactId = parsePortalContactIdFromPathname(pathname) ?? null;
  const routeOpportunityId = parsePortalOpportunityIdFromPathname(pathname) ?? null;
  const [assistantSessionId, setAssistantSessionId] = useState<string | undefined>(undefined);
  const assistantSessionIdRef = useRef<string | undefined>(undefined);
  assistantSessionIdRef.current = assistantSessionId;
  const [assistantConversationsList, setAssistantConversationsList] = useState<
    AdvisorAssistantConversationListItemDto[]
  >([]);
  const [conversationPickerLoading, setConversationPickerLoading] = useState(false);
  const [historyHydrationLoading, setHistoryHydrationLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** 6C: výběr kroků pro potvrzení podle planId (parita s AiAssistantDrawer). */
  const [stepSelectionByPlanId, setStepSelectionByPlanId] = useState<
    Record<string, Record<string, boolean>>
  >({});
  /** M3: inline param overrides per plan/step. Parity with desktop drawer so
   * confirmation can carry edited values through to the server. */
  const [inlineValuesByPlanId, setInlineValuesByPlanId] = useState<
    Record<string, Record<string, Record<string, string>>>
  >({});
  const chatSubmitLockRef = useRef(false);
  // B3.5 — AbortController parity s `AiAssistantDrawer`. Dříve mobilní chat
  // nezrušil běžící stream při unmountu ani při přepnutí kontaktu, takže
  // dokončený request přepsal state už odmountované obrazovky (setState na
  // unmounted component warning + potenciální data leak mezi kontakty).
  const chatAbortRef = useRef<AbortController | null>(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [planConfirmBusy, setPlanConfirmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pendingImageAssets, setPendingImageAssets] = useState<ImageAssetPayload[]>([]);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);
  const [draftCopied, setDraftCopied] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendMessageRef = useRef<
    ((text: string, imageAssets?: ImageAssetPayload[]) => Promise<void>) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setConversationPickerLoading(true);
    setHistoryHydrationLoading(true);
    void (async () => {
      try {
        let sid: string | undefined;
        try {
          sid = sessionStorage.getItem(AI_ASSISTANT_API_SESSION_KEY) ?? undefined;
        } catch {
          /* ignore */
        }
        if (sid) setAssistantSessionId(sid);

        const list = await listAdvisorAssistantConversations();
        if (cancelled) return;
        setAssistantConversationsList(list);

        if (sid) {
          const hist = await loadAdvisorAssistantConversationHistory(sid);
          if (!cancelled && hist.ok && hist.messages.length > 0) {
            setMessages(historyDtoToMobileMessages(hist.messages));
            return;
          }
        }

        const restored = loadSession();
        if (!cancelled && restored.length > 0) setMessages(restored);
      } finally {
        if (!cancelled) {
          setConversationPickerLoading(false);
          setHistoryHydrationLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const prevRouteContactIdRef = useRef<string | null>(routeContactId);
  useEffect(() => {
    const prev = prevRouteContactIdRef.current;
    prevRouteContactIdRef.current = routeContactId;
    if (prev == null || routeContactId == null) return;
    if (prev !== routeContactId) {
      // B3.5 — zrušit běžící stream, jinak nová kontakt-switch dostane
      // odpověď z předchozího requestu a state se promíchá.
      try {
        chatAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
      chatAbortRef.current = null;
      setMessages([]);
      setPendingImageAssets([]);
      setAssistantSessionId(undefined);
      try { sessionStorage.removeItem(AI_ASSISTANT_API_SESSION_KEY); } catch { /* ignore */ }
    }
  }, [routeContactId]);

  // B3.5 — abort při unmount, aby se dokončený fetch neuložil do
  // nezamontované obrazovky.
  useEffect(() => {
    return () => {
      try {
        chatAbortRef.current?.abort();
      } catch {
        /* ignore */
      }
      chatAbortRef.current = null;
    };
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

  const awaitingConfirmationFromLatestTurn = useMemo(() => {
    const last = messages[messages.length - 1];
    return (
      last?.role === "assistant" && last.executionState?.status === "awaiting_confirmation"
    );
  }, [messages]);

  const awaitingPlanId = useMemo(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || last.executionState?.status !== "awaiting_confirmation") {
      return undefined;
    }
    return last.executionState.planId;
  }, [messages]);

  const confirmSelectionInvalid = useMemo(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || last.executionState?.status !== "awaiting_confirmation") {
      return false;
    }
    const previews = last.executionState.stepPreviews ?? [];
    const pid = last.executionState.planId;
    if (!pid || !previews.length || !previews.every((p) => p.stepId)) return false;
    const n = Object.values(stepSelectionByPlanId[pid] ?? {}).filter(Boolean).length;
    return n === 0;
  }, [messages, stepSelectionByPlanId]);

  useEffect(() => {
    if (!awaitingPlanId) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || last.executionState?.planId !== awaitingPlanId) return;
    const previews = last.executionState?.stepPreviews ?? [];
    setStepSelectionByPlanId((prev) => {
      if (prev[awaitingPlanId]) return prev;
      const init: Record<string, boolean> = {};
      for (const p of previews) {
        if (p.stepId) init[p.stepId] = true;
      }
      return { ...prev, [awaitingPlanId]: init };
    });
  }, [messages, awaitingPlanId]);

  const runDraftEmailForClient = useCallback(async (clientId: string) => {
    const cid = clientId.trim();
    if (!cid) return;
    setDraftLoading(true);
    setDraftEmail(null);
    setDraftCopied(false);
    setError(null);
    try {
      const res = await fetch("/api/ai/assistant/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: cid, context: "follow_up" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Draft email selhal");
      setDraftEmail(data.draft ?? data.email ?? "Nepodařilo se vygenerovat e-mail.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft email selhal.");
    } finally {
      setDraftLoading(false);
    }
  }, []);

  const handleSuggestedAction = useCallback(
    (action: SuggestedAction) => {
      if (action.type === "open_review" && typeof action.payload.reviewId === "string") {
        router.push(`/portal/contracts/review/${action.payload.reviewId}`);
        return;
      }
      if (action.type === "open_portal_path" && typeof action.payload.path === "string") {
        const p = action.payload.path;
        if (p.startsWith("/portal/")) router.push(p);
        return;
      }
      if (action.type === "view_client" && typeof action.payload.clientId === "string") {
        router.push(`/portal/contacts/${action.payload.clientId}`);
        return;
      }
      if (action.type === "open_task") {
        router.push("/portal/tasks");
        return;
      }
      if (action.type === "create_task") {
        router.push("/portal/tasks");
        return;
      }
      if (action.type === "draft_email" && typeof action.payload.clientId === "string") {
        void runDraftEmailForClient(action.payload.clientId);
      }
    },
    [router, runDraftEmailForClient],
  );

  const handlePasteOnComposer = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      const cd = e.clipboardData;
      logAssistantImagePipelineClient("paste_fired", {
        surface: "AiAssistantChatScreen",
        targetTag: (e.target as HTMLElement).tagName,
        activeElementTag: document.activeElement?.tagName,
      });
      const { files, truncated } = extractImageFilesFromClipboardData(cd, { max: 4 });
      logAssistantImagePipelineClient("paste_clipboard", {
        itemCount: cd.items.length,
        fileCount: cd.files.length,
        types: Array.from(cd.types),
        imageFiles: files.length,
        truncated,
      });
      if (files.length === 0) return;
      e.preventDefault();
      if (isTyping || chatSubmitLockRef.current) {
        toast.showToast("Počkejte na dokončení aktuální zprávy.", "error");
        return;
      }
      if (truncated) {
        toast.showToast("Ve schránce bylo hodně obrázků — načtou se jen první 4.", "error");
      }

      const accompanying = inputRef.current?.value.trim() ?? "";

      void readImageFilesAsPayloads(files)
        .then((assets) => {
          logAssistantImagePipelineClient("paste_pending", {
            accompanyingLen: accompanying.length,
            assetCount: assets.length,
          });
          setPendingImageAssets((prev) => {
            const { next, truncatedFromIncoming } = mergePendingImageAssets(prev, assets);
            if (truncatedFromIncoming) {
              toast.showToast(
                "Do fronty se vejde nejvýše 4 obrázky — zbytek byl vynechán.",
                "error",
              );
            }
            return next;
          });
        })
        .catch(() => {
          toast.showToast("Obrázky z schránky se nepodařilo načíst.", "error");
        });
    },
    [toast, isTyping],
  );

  /** "Upravit zadání": předvyplní input textem poslední uživatelské zprávy a přesune fokus. */
  const handleEditIntent = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) setInput(lastUserMsg.text);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [messages]);

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

  async function sendMessage(text: string, imageAssets?: ImageAssetPayload[]) {
    const trimmed = text.trim();
    const hasImages = (imageAssets?.length ?? 0) > 0;
    if ((!trimmed && !hasImages) || isTyping || chatSubmitLockRef.current) return;
    chatSubmitLockRef.current = true;

    const displayText = trimmed || (hasImages ? "📎 obrázek" : "");
    logAssistantImagePipelineClient("sendMessage", {
      textLen: trimmed.length,
      imageAssetsCount: imageAssets?.length ?? 0,
    });

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: displayText,
      timestamp: new Date(),
      ...(hasImages && imageAssets?.length
        ? { imageAssets: imageAssets.map((a) => ({ ...a })) }
        : {}),
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

    // B3.5 — čerstvý AbortController; pokud ještě běží předchozí stream,
    // abortujeme ho (parity s AiAssistantDrawer L622-624).
    try {
      chatAbortRef.current?.abort();
    } catch {
      /* ignore */
    }
    const abort = new AbortController();
    chatAbortRef.current = abort;

    startTransition(async () => {
      try {
        const complete = await postAssistantChatStreaming(
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              buildAssistantChatRequestBody(trimmed, {
                sessionId: assistantSessionIdRef.current,
                routeContactId,
                routeOpportunityId,
                channel: "mobile",
                imageAssets,
              }),
            ),
          },
          (chunk) => {
            if (abort.signal.aborted) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + chunk } : m
              )
            );
          },
          abort.signal,
        );
        if (abort.signal.aborted) return;
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
                  stepOutcomes: complete.stepOutcomes ?? undefined,
                  suggestedNextSteps: complete.suggestedNextSteps ?? undefined,
                  suggestedNextStepItems: complete.suggestedNextStepItems ?? undefined,
                  hasPartialFailure: complete.hasPartialFailure ?? undefined,
                }
              : m
          )
        );
        setPendingImageAssets([]);
      } catch (e) {
        if (abort.signal.aborted) {
          // B3.5 — tichý abort (unmount / contact switch); nic neukazujeme.
          return;
        }
        setError(e instanceof Error ? e.message : "Nepodařilo se kontaktovat asistenta.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
        setInput(trimmed);
        if (hasImages) setPendingImageAssets(imageAssets ?? []);
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
        chatSubmitLockRef.current = false;
        if (chatAbortRef.current === abort) {
          chatAbortRef.current = null;
        }
      }
    });
  }

  sendMessageRef.current = sendMessage;

  /** 6F / 6C — potvrdit plán bez psaní „ano"; provede jen zaškrtnuté kroky. */
  const submitPlanConfirmation = useCallback(async () => {
    if (isTyping || chatSubmitLockRef.current) return;
    const last = messages[messages.length - 1];
    const pid = last?.role === "assistant" ? last.executionState?.planId : undefined;
    const previews = last?.role === "assistant" ? (last.executionState?.stepPreviews ?? []) : [];
    if (last?.role !== "assistant" || last.executionState?.status !== "awaiting_confirmation" || !pid) {
      return;
    }

    const canSelect = previews.length > 0 && previews.every((p) => p.stepId);
    const picked = canSelect
      ? Object.entries(stepSelectionByPlanId[pid] ?? {})
          .filter(([, on]) => on)
          .map(([id]) => id)
      : undefined;
    if (canSelect && (!picked || picked.length === 0)) return;

    setPlanConfirmBusy(true);
    chatSubmitLockRef.current = true;
    const streamAssistantId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: streamAssistantId, role: "assistant", text: "", timestamp: new Date() },
    ]);
    setIsTyping(true);
    setError(null);
    try {
      const stepParamOverrides =
        pid && inlineValuesByPlanId[pid] ? inlineValuesByPlanId[pid] : undefined;
      const complete = await postAssistantChatStreaming(
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            buildAssistantConfirmExecutionBody({
              sessionId: assistantSessionIdRef.current,
              routeContactId,
              routeOpportunityId,
              channel: "mobile",
              selectedStepIds: canSelect ? picked : undefined,
              stepParamOverrides,
            }),
          ),
        },
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === streamAssistantId ? { ...m, text: m.text + chunk } : m)),
          );
        },
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
          m.id === streamAssistantId
            ? {
                ...m,
                text: complete.message ?? "Odpověď není k dispozici.",
                suggestedActions: mapActionPayloadsToSuggestedActions(complete.suggestedActions ?? []),
                referencedEntities: complete.referencedEntities ?? [],
                warnings: complete.warnings ?? [],
                executionState: complete.executionState ?? null,
                contextState: complete.contextState ?? null,
                stepOutcomes: complete.stepOutcomes ?? undefined,
                suggestedNextSteps: complete.suggestedNextSteps ?? undefined,
                suggestedNextStepItems: complete.suggestedNextStepItems ?? undefined,
                hasPartialFailure: complete.hasPartialFailure ?? undefined,
              }
            : m,
        ),
      );
      setStepSelectionByPlanId((prev) => {
        const { [pid]: _removed, ...rest } = prev;
        return rest;
      });
      setInlineValuesByPlanId((prev) => {
        if (!prev[pid]) return prev;
        const { [pid]: _removed, ...rest } = prev;
        return rest;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se potvrdit plán.");
      setMessages((prev) => prev.filter((m) => m.id !== streamAssistantId));
    } finally {
      setIsTyping(false);
      setPlanConfirmBusy(false);
      chatSubmitLockRef.current = false;
    }
  }, [
    isTyping,
    messages,
    routeContactId,
    routeOpportunityId,
    stepSelectionByPlanId,
    inlineValuesByPlanId,
  ]);

  const submitCancelPlan = useCallback(async () => {
    if (isTyping || chatSubmitLockRef.current) return;
    const last = messages[messages.length - 1];
    const pid = last?.role === "assistant" ? last.executionState?.planId : undefined;
    if (last?.role !== "assistant" || last.executionState?.status !== "awaiting_confirmation") return;

    chatSubmitLockRef.current = true;
    const streamAssistantId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: streamAssistantId, role: "assistant", text: "", timestamp: new Date() },
    ]);
    setIsTyping(true);
    setError(null);
    try {
      const complete = await postAssistantChatStreaming(
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            buildAssistantCancelPlanBody({
              sessionId: assistantSessionIdRef.current,
              routeContactId,
              routeOpportunityId,
              channel: "mobile",
            }),
          ),
        },
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === streamAssistantId ? { ...m, text: m.text + chunk } : m)),
          );
        },
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
          m.id === streamAssistantId
            ? {
                ...m,
                text: complete.message ?? "Odpověď není k dispozici.",
                suggestedActions: mapActionPayloadsToSuggestedActions(complete.suggestedActions ?? []),
                referencedEntities: complete.referencedEntities ?? [],
                warnings: complete.warnings ?? [],
                executionState: complete.executionState ?? null,
                contextState: complete.contextState ?? null,
                stepOutcomes: complete.stepOutcomes ?? undefined,
                suggestedNextSteps: complete.suggestedNextSteps ?? undefined,
                suggestedNextStepItems: complete.suggestedNextStepItems ?? undefined,
                hasPartialFailure: complete.hasPartialFailure ?? undefined,
              }
            : m,
        ),
      );
      if (pid) {
        setStepSelectionByPlanId((prev) => {
          const { [pid]: _removed, ...rest } = prev;
          return rest;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se zrušit plán.");
      setMessages((prev) => prev.filter((m) => m.id !== streamAssistantId));
    } finally {
      setIsTyping(false);
      chatSubmitLockRef.current = false;
    }
  }, [isTyping, messages, routeContactId, routeOpportunityId]);

  async function handleFileUpload() {
    if (files.length === 0 || chatSubmitLockRef.current) return;
    chatSubmitLockRef.current = true;
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
          chatSubmitLockRef.current = false;
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
              sessionId: assistantSessionIdRef.current,
              routeContactId,
              routeOpportunityId,
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
                stepOutcomes: complete.stepOutcomes ?? undefined,
                suggestedNextSteps: complete.suggestedNextSteps ?? undefined,
                suggestedNextStepItems: complete.suggestedNextStepItems ?? undefined,
                hasPartialFailure: complete.hasPartialFailure ?? undefined,
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
      chatSubmitLockRef.current = false;
    }
  }

  async function handleDraftEmail() {
    const lastClientRef = messages
      .flatMap((m) => m.referencedEntities ?? [])
      .filter((e) => e.type === "client" || e.type === "contact")
      .pop();
    const clientId = routeContactId?.trim() || lastClientRef?.id || "";
    await runDraftEmailForClient(clientId);
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
      const t = input.trim();
      if (!t && pendingImageAssets.length === 0) return;
      void sendMessage(t, pendingImageAssets.length ? pendingImageAssets : undefined);
    }
  }

  const startNewAssistantConversation = useCallback(() => {
    setMessages([]);
    setPendingImageAssets([]);
    setStepSelectionByPlanId({});
    setAssistantSessionId(undefined);
    setError(null);
    setDraftEmail(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(AI_ASSISTANT_API_SESSION_KEY);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  }, []);

  const handleRenameAssistantConversation = useCallback(async () => {
    if (!assistantSessionId) return;
    const current = assistantConversationsList.find((c) => c.id === assistantSessionId);
    const defaultValue = current?.displayTitle ?? current?.lockedContactLabel ?? "";
    const next = window.prompt(
      `Název konverzace (max. ${ASSISTANT_CONVERSATION_DISPLAY_TITLE_MAX_LEN} znaků). Prázdné = výchozí podle klienta a času.`,
      defaultValue,
    );
    if (next === null) return;
    setError(null);
    const res = await renameAdvisorAssistantConversation(assistantSessionId, next.trim() || null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    try {
      const refreshed = await listAdvisorAssistantConversations();
      setAssistantConversationsList(refreshed);
    } catch {
      /* ignore */
    }
  }, [assistantSessionId, assistantConversationsList]);

  const handleDeleteAssistantConversation = useCallback(async () => {
    if (!assistantSessionId) return;
    const ok = await confirm({
      title: "Smazat konverzaci?",
      message: "Smazat tuto konverzaci včetně historie? Tuto akci nelze vrátit zpět.",
      confirmLabel: "Smazat",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    const res = await deleteAdvisorAssistantConversation(assistantSessionId);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    startNewAssistantConversation();
    try {
      const refreshed = await listAdvisorAssistantConversations();
      setAssistantConversationsList(refreshed);
    } catch {
      /* ignore */
    }
  }, [assistantSessionId, confirm, startNewAssistantConversation]);

  const selectAssistantConversation = useCallback(
    async (value: string) => {
      setHistoryOpen(false);
      if (value === "__new__") {
        startNewAssistantConversation();
        return;
      }
      setAssistantSessionId(value);
      try {
        sessionStorage.setItem(AI_ASSISTANT_API_SESSION_KEY, value);
      } catch {
        /* ignore */
      }
      setHistoryHydrationLoading(true);
      const hist = await loadAdvisorAssistantConversationHistory(value);
      setHistoryHydrationLoading(false);
      if (hist.ok) {
        setMessages(historyDtoToMobileMessages(hist.messages));
      } else {
        setError(hist.error);
      }
    },
    [startNewAssistantConversation],
  );

  function clearChat() {
    startNewAssistantConversation();
  }

  function closeAssistantChat() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/portal/today");
  }

  const isEmpty = messages.length === 0;
  const latestContextState = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.contextState?.lockedClientId) return m.contextState;
    }
    return undefined;
  }, [messages]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#f6f8fb]">
      <div className="pointer-events-none absolute -right-24 -top-20 h-64 w-64 rounded-full bg-indigo-200/40 blur-[80px]" />
      <div className="pointer-events-none absolute -left-28 top-56 h-72 w-72 rounded-full bg-emerald-100/50 blur-[80px]" />
      <div className="pointer-events-none absolute inset-x-10 top-28 h-28 rounded-full bg-white/65 blur-3xl" />

      <header className="relative z-40 shrink-0 border-b border-white/80 px-4 pb-4 pt-[calc(var(--safe-area-top,0px)+0.75rem)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-white/80 bg-white/80 p-1.5 text-violet-600 shadow-[0_16px_34px_-26px_rgba(79,70,229,.45)] ring-1 ring-slate-200/45 backdrop-blur-xl">
              <AiAssistantBrandIcon size={34} variant="colorOnWhite" className="max-h-full max-w-full" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[18px] font-black tracking-tight text-slate-950">
                Aidvisora Chat
              </p>
              <p className="truncate text-[12px] font-semibold text-slate-500">
                Interní podklad pro poradce
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((value) => !value)}
              className={cx(
                "grid min-h-[44px] min-w-[44px] place-items-center rounded-[18px] border shadow-[0_12px_28px_-24px_rgba(15,23,42,.3)] ring-1 backdrop-blur-xl active:scale-95",
                historyOpen
                  ? "border-indigo-200 bg-indigo-50 text-indigo-600 ring-indigo-100"
                  : "border-white/80 bg-white/76 text-slate-700 ring-slate-200/45",
              )}
              aria-label="Historie chatu"
            >
              <History size={20} />
            </button>
            <button
              type="button"
              onClick={closeAssistantChat}
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[18px] border border-white/80 bg-white/76 text-slate-900 shadow-[0_12px_28px_-24px_rgba(15,23,42,.3)] ring-1 ring-slate-200/45 backdrop-blur-xl active:scale-95"
              aria-label="Zavřít AI chat"
            >
              <X size={21} />
            </button>
          </div>
        </div>
      </header>
      <div
        className={cx(
          "absolute left-4 right-4 top-[calc(var(--safe-area-top,0px)+5.75rem)] z-50 overflow-hidden rounded-[26px] border border-white/80 bg-white/95 shadow-[0_30px_70px_-36px_rgba(15,23,42,.45)] ring-1 ring-slate-200/50 backdrop-blur-2xl transition-all duration-300",
          historyOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-3 scale-[0.98] opacity-0",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100/90 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Historie
            </p>
            <p className="mt-1 text-[14px] font-black text-slate-900">
              Poslední konverzace
            </p>
          </div>
          <button
            type="button"
            onClick={() => void selectAssistantConversation("__new__")}
            className="grid h-10 w-10 place-items-center rounded-[15px] bg-indigo-600 text-white shadow-[0_12px_24px_-14px_rgba(79,70,229,.72)] active:scale-95"
            aria-label="Nová konverzace"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="max-h-[280px] space-y-1.5 overflow-y-auto p-2.5">
          {conversationPickerLoading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[13px] font-bold text-slate-500">
              <Loader2 size={15} className="animate-spin text-indigo-500" />
              Načítám historii…
            </div>
          ) : assistantConversationsList.length > 0 ? (
            assistantConversationsList.map((item) => {
              const active = item.id === assistantSessionId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void selectAssistantConversation(item.id)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left transition active:scale-[.99]",
                    active ? "bg-indigo-50" : "hover:bg-slate-50",
                  )}
                >
                  <div
                    className={cx(
                      "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[14px]",
                      active ? "bg-white text-indigo-600" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {active ? <Check size={17} /> : <History size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-black leading-5 text-slate-800">
                      {formatAdvisorAssistantConversationListLabel(item)}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">
                      Uložená konverzace
                    </div>
                  </div>
                  <ChevronRight size={15} className="mt-1 shrink-0 text-slate-400" />
                </button>
              );
            })
          ) : (
            <p className="px-3 py-4 text-[13px] font-semibold text-slate-500">
              Zatím tu nejsou žádné uložené konverzace.
            </p>
          )}
        </div>
      </div>
      {historyOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-40 bg-transparent"
          onClick={() => setHistoryOpen(false)}
          aria-label="Zavřít historii"
        />
      ) : null}
      {/* Message list */}
      <div
        className={`relative z-10 min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden ${historyHydrationLoading ? "opacity-60 pointer-events-none" : ""}`}
      >
        {isEmpty ? (
          <div className="space-y-8 px-1 pt-8">
            <div className="text-center">
              <div className="relative mx-auto grid h-[84px] w-[84px] place-items-center rounded-[30px] bg-white/90 p-2 shadow-[0_28px_60px_-34px_rgba(109,40,217,.85)] ring-1 ring-violet-100">
                <AiAssistantBrandIcon size={60} variant="colorOnWhite" className="relative max-h-full max-w-full" />
              </div>
              <h2 className="mt-5 text-[24px] font-black tracking-tight text-slate-800">
                AI Asistent
              </h2>
              <p className="mx-auto mt-4 max-w-[330px] text-[15px] font-medium leading-7 text-slate-500">
                Zeptejte se na cokoliv z vašeho CRM. Asistent zná kontakty, úkoly,
                obchody i smlouvy.
              </p>
            </div>

            <div>
              <p className="mb-3 text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Rychlé otázky
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {QUICK_STARTERS.slice(0, 4).map((starter) => {
                  const StarterIcon = starter.icon;
                  return (
                    <button
                      key={starter.label}
                      type="button"
                      onClick={() => void sendMessage(starter.prompt)}
                      className="group flex min-h-[52px] w-full items-center gap-2.5 rounded-[18px] border border-white/80 bg-white/75 px-3 py-2.5 text-left shadow-[0_12px_24px_-24px_rgba(15,23,42,.34)] ring-1 ring-slate-200/40 backdrop-blur-xl active:scale-[.99]"
                    >
                      <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-[13px] ring-1", starter.iconClass)}>
                        <StarterIcon size={16} />
                      </span>
                      <span className="min-w-0 flex-1 text-[12px] font-black leading-4 text-slate-700">
                        {starter.label}
                      </span>
                      <ChevronRight size={15} className="shrink-0 text-slate-400" />
                    </button>
                  );
                })}
              </div>
              {QUICK_STARTERS[4] ? (
                <button
                  type="button"
                  onClick={() => void sendMessage(QUICK_STARTERS[4].prompt)}
                  className="mt-2.5 flex min-h-[52px] w-full items-center gap-2.5 rounded-[18px] border border-white/80 bg-white/75 px-3 py-2.5 text-left shadow-[0_12px_24px_-24px_rgba(15,23,42,.34)] ring-1 ring-slate-200/40 backdrop-blur-xl active:scale-[.99]"
                >
                  <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-[13px] ring-1", QUICK_STARTERS[4].iconClass)}>
                    <FileText size={16} />
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] font-black leading-4 text-slate-700">
                    {QUICK_STARTERS[4].label}
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-slate-400" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {latestContextState?.lockedClientId ? (
          <div className="sticky top-0 z-10">
            <ContextLockBadge
              lockedClientId={latestContextState.lockedClientId}
              lockedClientLabel={latestContextState.lockedClientLabel}
            />
          </div>
        ) : null}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            stickyLockedClientId={latestContextState?.lockedClientId ?? null}
            onSuggestedAction={handleSuggestedAction}
            onNextStep={(text) => {
              setInput("");
              void sendMessage(text);
            }}
            onFocusComposer={() => inputRef.current?.focus()}
            stepSelectionByPlanId={stepSelectionByPlanId}
            onToggleStepForPlan={(planId, stepId) => {
              setStepSelectionByPlanId((prev) => {
                const cur = prev[planId] ?? {};
                return { ...prev, [planId]: { ...cur, [stepId]: !cur[stepId] } };
              });
            }}
          />
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
      <div className="relative z-10 shrink-0 border-t border-white/80 bg-white/80 px-4 pb-[max(1rem,var(--safe-area-bottom))] pt-3 backdrop-blur-2xl">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label htmlFor="aidv-mobile-assistant-conv" className="shrink-0 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Konverzace (7 dní)
          </label>
          <select
            id="aidv-mobile-assistant-conv"
            className="min-h-[36px] min-w-0 flex-1 rounded-xl border border-white/80 bg-white/85 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_10px_22px_-22px_rgba(15,23,42,.34)] ring-1 ring-slate-200/40"
            disabled={conversationPickerLoading || isTyping}
            value={assistantSessionId ?? "__new__"}
            onChange={async (e) => {
              await selectAssistantConversation(e.target.value);
            }}
          >
            <option value="__new__">Nová konverzace</option>
            {assistantSessionId &&
              !assistantConversationsList.some((c) => c.id === assistantSessionId) && (
                <option value={assistantSessionId}>Aktuální (mimo seznam 7 dní)</option>
              )}
            {assistantConversationsList.map((c) => (
              <option key={c.id} value={c.id}>
                {formatAdvisorAssistantConversationListLabel(c)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleRenameAssistantConversation()}
            disabled={!assistantSessionId || conversationPickerLoading || isTyping}
            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/85 text-slate-500 active:bg-slate-50 disabled:opacity-40"
            aria-label="Přejmenovat konverzaci"
            title="Přejmenovat konverzaci"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteAssistantConversation()}
            disabled={!assistantSessionId || conversationPickerLoading || isTyping}
            className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/85 text-rose-600 active:bg-rose-50 disabled:opacity-40"
            aria-label="Smazat konverzaci"
            title="Smazat konverzaci"
          >
            <Trash2 size={14} />
          </button>
          {conversationPickerLoading ? <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" /> : null}
        </div>
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

        {pendingImageAssets.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingImageAssets.map((a, i) => (
              <div
                key={`${i}-${a.filename ?? "img"}-${a.sizeBytes}`}
                className="relative shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]"
                />
                <button
                  type="button"
                  onClick={() =>
                    setPendingImageAssets((prev) => removePendingImageAssetAt(prev, i))
                  }
                  className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow"
                  aria-label="Odebrat obrázek z fronty"
                >
                  ×
                </button>
              </div>
            ))}
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

        {(awaitingConfirmationFromLatestTurn || planConfirmBusy) ? (
          <div className="mb-2 space-y-1.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void submitPlanConfirmation()}
                disabled={isTyping || confirmSelectionInvalid}
                className="flex-1 min-h-[44px] rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-sm active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {isTyping && planConfirmBusy ? (
                  <>
                    <Loader2 size={18} className="animate-spin shrink-0" aria-hidden />
                    Provádím…
                  </>
                ) : (
                  "Potvrdit a provést"
                )}
              </button>
              <button
                type="button"
                onClick={() => void submitCancelPlan()}
                disabled={isTyping && planConfirmBusy}
                className="min-h-[44px] px-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-sm font-bold text-[color:var(--wp-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Zrušit plán akcí"
              >
                Zrušit plán
              </button>
            </div>
            <button
              type="button"
              onClick={handleEditIntent}
              className="w-full flex items-center justify-center gap-1.5 min-h-[36px] rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-xs font-bold text-[color:var(--wp-text-secondary)] active:bg-[color:var(--wp-surface-muted)]"
            >
              <Pencil size={12} />
              Upravit zadání
            </button>
          </div>
        ) : null}

        <div
          className="rounded-[28px] border border-white/75 bg-white/95 p-3 shadow-[0_-10px_28px_-24px_rgba(15,23,42,.25)] ring-1 ring-slate-200/40 backdrop-blur-2xl"
          onPaste={handlePasteOnComposer}
        >
          <div className="flex items-end gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            className="sr-only"
            accept=".pdf,.doc,.docx,image/*,.csv"
            onChange={(e) => {
              const added = Array.from(e.target.files ?? []);
              e.target.value = "";
              const images = added.filter(isLikelyAssistantImageFile);
              const docs = added.filter((f) => !isLikelyAssistantImageFile(f));
              if (docs.length > 0) setFiles((prev) => prev.concat(docs));
              if (images.length === 0) return;
              if (isTyping || chatSubmitLockRef.current) {
                toast.showToast("Počkejte na dokončení aktuální zprávy.", "error");
                return;
              }
              void readImageFilesAsPayloads(images)
                .then((assets) => {
                  setPendingImageAssets((prev) => {
                    const { next, truncatedFromIncoming } = mergePendingImageAssets(prev, assets);
                    if (truncatedFromIncoming) {
                      toast.showToast(
                        "Do fronty se vejde nejvýše 4 obrázky — zbytek byl vynechán.",
                        "error",
                      );
                    }
                    return next;
                  });
                })
                .catch(() => {
                  toast.showToast("Obrázky se nepodařilo načíst.", "error");
                });
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] border border-slate-200 bg-slate-50 text-slate-500 active:scale-95"
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
            placeholder={
              awaitingConfirmationFromLatestTurn
                ? "Plán potvrďte tlačítkem výše, ne textem zde…"
                : "S čím vám mohu pomoci?"
            }
            disabled={isTyping}
            className="min-h-[44px] max-h-[120px] min-w-0 flex-1 resize-none rounded-[15px] border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] font-semibold text-slate-900 outline-none placeholder:text-slate-400 transition-colors focus:border-indigo-300 focus:bg-white disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => {
              const t = input.trim();
              if (!t && pendingImageAssets.length === 0) return;
              void sendMessage(t, pendingImageAssets.length ? pendingImageAssets : undefined);
            }}
            disabled={(!input.trim() && pendingImageAssets.length === 0) || isTyping}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-indigo-600 text-white shadow-[0_12px_24px_-14px_rgba(79,70,229,.72)] transition-opacity active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Odeslat zprávu"
          >
            <Send size={18} />
          </button>
          </div>
        </div>

        {error ? (
          <p className="mt-1.5 text-xs font-bold text-rose-500 px-1">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
