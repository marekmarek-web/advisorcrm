"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  X,
  Send,
  Loader2,
  UploadCloud,
  AlertCircle,
  Zap,
  Pencil,
  Bell,
  Trash2,
} from "lucide-react";
import { useToast } from "@/app/components/Toast";
import { useAiAssistantDrawer } from "./AiAssistantDrawerContext";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import type { SuggestedAction } from "@/lib/ai/dashboard-types";
import {
  getCsvPreview,
  getSpreadsheetPreview,
  importContactsCsv,
  importContactsFromSpreadsheet,
  type CsvPreview,
} from "@/app/actions/csv-import";
import { DEFAULT_CONTACT_IMPORT_MAPPING, type ColumnMapping } from "@/lib/contacts/import-types";
import { ImportColumnMappingBlock } from "@/app/dashboard/contacts/ImportColumnMappingBlock";
import { useNativePlatform } from "@/lib/capacitor/useNativePlatform";
import { isLikelyPdfUpload } from "@/lib/security/file-signature";
import {
  postAssistantChatStreaming,
  buildAssistantChatRequestBody,
  buildAssistantPostUploadReviewBootstrapBody,
  buildAssistantConfirmExecutionBody,
  buildAssistantCancelPlanBody,
  parsePortalContactIdFromPathname,
  parsePortalOpportunityIdFromPathname,
} from "@/lib/ai/assistant-chat-client";
import type { ImageAssetPayload } from "@/lib/ai/assistant-chat-client";
import {
  extractImageBlobFromClipboardData,
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
} from "./AssistantExecutionUI";
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

const AI_ASSISTANT_API_SESSION_KEY = "aidvisora_ai_assistant_api_session_id";

const MAX_ASSISTANT_CHAT_IMAGES = 10;

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

type DraftAction = { type: string; label: string; payload: Record<string, unknown> };
type ClientCandidate = { clientId: string; displayName?: string };

type ChatMessage =
  | { role: "user"; content: string; stableKey?: string }
  | {
      role: "assistant";
      content: string;
      stableKey?: string;
      suggestedActions?: SuggestedAction[];
      warnings?: string[];
      reviewId?: string;
      draftActions?: DraftAction[];
      clientMatchCandidates?: ClientCandidate[];
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
      hasPartialFailure?: boolean;
    };

function historyDtoToChatMessages(dtos: AdvisorAssistantHistoryMessageDto[]): ChatMessage[] {
  return dtos.map((d) => {
    if (d.kind === "user") {
      return { role: "user", content: d.content, stableKey: d.stableKey };
    }
    return {
      role: "assistant",
      content: d.content,
      stableKey: d.stableKey,
      suggestedActions: [],
      warnings: d.warnings,
      executionState: d.executionState ?? undefined,
      contextState: d.contextState ?? undefined,
    };
  });
}

type UploadPhase = "idle" | "uploading" | "processing";

// executionLabel, StepOutcomeCard, SuggestedNextStepsChips moved to AssistantExecutionUI.tsx

function getHref(action: SuggestedAction): string | null {
  if (action.type === "open_review" && action.payload.reviewId) {
    return `/portal/contracts/review/${action.payload.reviewId}`;
  }
  if (action.type === "view_client" && action.payload.clientId) {
    return `/portal/contacts/${action.payload.clientId}`;
  }
  if (action.type === "open_task") {
    return "/portal/tasks";
  }
  return null;
}

function formatUploadSuccessMessage(detail: {
  extractedPayload?: Record<string, unknown>;
  confidence?: number | null;
  reasonsForReview?: string[] | null;
}): string {
  const extracted = detail.extractedPayload ?? {};
  const client = extracted.client as Record<string, unknown> | undefined;
  const clientName = client
    ? [client.fullName, client.firstName, client.lastName].filter(Boolean).join(" ") || "—"
    : "—";
  const lines: string[] = [];
  lines.push(`Našla jsem smlouvu od ${extracted.institutionName ?? "neznámé instituce"}.`);
  lines.push(`Pravděpodobný klient: ${clientName}.`);
  if (extracted.contractNumber) lines.push(`Číslo smlouvy: ${extracted.contractNumber}.`);
  const conf = detail.confidence != null ? Math.round(detail.confidence * 100) : null;
  if (conf != null) lines.push(`Jistota: ${conf} %.`);
  const missing = (extracted.missingFields as string[] | undefined) ?? [];
  const reasons = detail.reasonsForReview ?? [];
  if (missing.length || reasons.length) {
    const parts = [...missing, ...reasons];
    lines.push(`Chybějící / k ověření: ${parts.join(", ")}.`);
  }
  return lines.join("\n");
}

/** Poslední assistant zpráva s neprázdným `contextState` (zpětná procházka bez `find` union bugů). */
function getLatestAssistantContextFromMessages(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (m.contextState != null) return m.contextState;
  }
  return undefined;
}


export function AiAssistantDrawer() {
  const { open, setOpen } = useAiAssistantDrawer();
  const { isNative } = useNativePlatform();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const toast = useToast();
  const routeContactId = parsePortalContactIdFromPathname(pathname) ?? null;
  const routeOpportunityId = parsePortalOpportunityIdFromPathname(pathname) ?? null;
  const [assistantSessionId, setAssistantSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assistantConversationsList, setAssistantConversationsList] = useState<
    AdvisorAssistantConversationListItemDto[]
  >([]);
  const [conversationPickerLoading, setConversationPickerLoading] = useState(false);
  const [historyHydrationLoading, setHistoryHydrationLoading] = useState(false);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  /** Drží panel s „Potvrdit“ viditelný během API volání (6J). */
  const [confirmExecuteBusy, setConfirmExecuteBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Po nahrání smlouvy — posílá se v activeContext.reviewId, aby server zahrnul AI review do chatu. */
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assistantChatImageInputRef = useRef<HTMLInputElement>(null);
  const contactsImportFileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Zabrání dvojitému odeslání před tím, než React znovu vyrenderuje s chatLoading. */
  const chatSubmitLockRef = useRef(false);
  const uploadZoneRef = useRef<HTMLDivElement>(null);

  const [importContactsStep, setImportContactsStep] = useState<"idle" | "mapping" | "preview" | "done">("idle");
  const [importContactsFile, setImportContactsFile] = useState<File | null>(null);
  const [importContactsPreview, setImportContactsPreview] = useState<CsvPreview | null>(null);
  const [importContactsMapping, setImportContactsMapping] = useState<ColumnMapping>(DEFAULT_CONTACT_IMPORT_MAPPING);
  const [importContactsResult, setImportContactsResult] = useState<{ imported: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const [importContactsLoading, setImportContactsLoading] = useState(false);
  const latestAssistantContext = getLatestAssistantContextFromMessages(messages);
  const showStickyContextLock = Boolean(latestAssistantContext?.lockedClientId);
  /** Spouští "Upravit zadání": vyplní input textem z poslední uživatelské zprávy a přesune fokus. */
  const handleEditIntent = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) setInput(lastUserMsg.content);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [messages]);

  const assistantSessionIdRef = useRef<string | undefined>(undefined);
  assistantSessionIdRef.current = assistantSessionId;

  const awaitingConfirmationFromLatestTurn = useMemo(() => {
    const last = messages[messages.length - 1];
    return (
      last?.role === "assistant" && last.executionState?.status === "awaiting_confirmation"
    );
  }, [messages]);

  const [stepSelectionByPlanId, setStepSelectionByPlanId] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return;
    const es = last.executionState;
    if (!es || es.status !== "awaiting_confirmation" || !es.planId) return;
    if (stepSelectionByPlanId[es.planId]) return;
    const previews = es.stepPreviews ?? [];
    if (previews.length === 0 || !previews.every((p) => p.stepId)) return;
    const init: Record<string, boolean> = {};
    for (const p of previews) init[p.stepId] = true;
    setStepSelectionByPlanId((prev) => ({ ...prev, [es.planId!]: init }));
  }, [messages, stepSelectionByPlanId]);

  const handleToggleStep = useCallback((planId: string, stepId: string) => {
    setStepSelectionByPlanId((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], [stepId]: !(prev[planId]?.[stepId] ?? true) },
    }));
  }, []);

  const confirmSelectionInvalid = useMemo(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return false;
    const pid = last.executionState?.planId;
    if (!pid) return false;
    const sel = stepSelectionByPlanId[pid];
    if (!sel) return false;
    return !Object.values(sel).some(Boolean);
  }, [messages, stepSelectionByPlanId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(AI_ASSISTANT_API_SESSION_KEY);
      if (s) setAssistantSessionId(s);
    } catch {
      /* ignore */
    }
  }, []);

  const startNewAssistantConversation = useCallback(() => {
    setMessages([]);
    setAssistantSessionId(undefined);
    setActiveReviewId(null);
    try {
      sessionStorage.removeItem(AI_ASSISTANT_API_SESSION_KEY);
    } catch {
      /* ignore */
    }
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
    const res = await renameAdvisorAssistantConversation(assistantSessionId, next.trim() || null);
    if (!res.ok) {
      toast.showToast(res.error, "error");
      return;
    }
    try {
      const refreshed = await listAdvisorAssistantConversations();
      setAssistantConversationsList(refreshed);
    } catch {
      /* ignore */
    }
    toast.showToast("Název uložen.", "success");
  }, [assistantSessionId, assistantConversationsList, toast]);

  const handleDeleteAssistantConversation = useCallback(async () => {
    if (!assistantSessionId) return;
    if (!window.confirm("Smazat tuto konverzaci včetně historie? Tuto akci nelze vrátit zpět.")) {
      return;
    }
    const res = await deleteAdvisorAssistantConversation(assistantSessionId);
    if (!res.ok) {
      toast.showToast(res.error, "error");
      return;
    }
    startNewAssistantConversation();
    try {
      const refreshed = await listAdvisorAssistantConversations();
      setAssistantConversationsList(refreshed);
    } catch {
      /* ignore */
    }
    toast.showToast("Konverzace byla smazána.", "success");
  }, [assistantSessionId, startNewAssistantConversation, toast]);

  useEffect(() => {
    if (!open) return;
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
        if (!sid) sid = assistantSessionIdRef.current;
        if (sid) {
          setAssistantSessionId((prev) => prev ?? sid);
        }
        const list = await listAdvisorAssistantConversations();
        if (cancelled) return;
        setAssistantConversationsList(list);
        if (sid) {
          const hist = await loadAdvisorAssistantConversationHistory(sid);
          if (!cancelled && hist.ok) {
            setMessages(historyDtoToChatMessages(hist.messages));
          }
        }
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
  }, [open]);

  const prevRouteContactIdRef = useRef<string | null>(routeContactId);
  useEffect(() => {
    const prev = prevRouteContactIdRef.current;
    prevRouteContactIdRef.current = routeContactId;
    if (prev == null || routeContactId == null) return;
    if (prev !== routeContactId) {
      setMessages([]);
      setAssistantSessionId(undefined);
      setActiveReviewId(null);
      try { sessionStorage.removeItem(AI_ASSISTANT_API_SESSION_KEY); } catch { /* ignore */ }
    }
  }, [routeContactId]);

  const sendChatMessage = useCallback(
    async (rawMsg: string, imageAssets?: ImageAssetPayload[]) => {
      const msg = rawMsg.trim();
      const hasImages = (imageAssets?.length ?? 0) > 0;
      logAssistantImagePipelineClient("sendChatMessage", {
        surface: "AiAssistantDrawer",
        textLen: msg.length,
        imageAssetsCount: imageAssets?.length ?? 0,
      });
      if ((!msg && !hasImages) || chatLoading || chatSubmitLockRef.current) return;
      chatSubmitLockRef.current = true;
      const displayMsg = msg || (hasImages ? "📎 obrázek" : "");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: displayMsg },
        { role: "assistant", content: "", suggestedActions: [], warnings: [] },
      ]);
      setChatLoading(true);
      queueMicrotask(() => inputRef.current?.focus());
      try {
        const complete = await postAssistantChatStreaming(
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildAssistantChatRequestBody(msg, {
                sessionId: assistantSessionIdRef.current,
                routeContactId,
                routeOpportunityId,
                reviewId: activeReviewId,
                channel: "web_drawer",
                imageAssets,
              }),
            ),
          },
          (chunk) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + chunk,
                };
              }
              return next;
            });
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
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              role: "assistant",
              content: complete.message ?? "",
              suggestedActions: mapActionPayloadsToSuggestedActions(complete.suggestedActions ?? []),
              warnings: complete.warnings ?? [],
              executionState: complete.executionState ?? null,
              contextState: complete.contextState ?? null,
              stepOutcomes: complete.stepOutcomes ?? undefined,
              suggestedNextSteps: complete.suggestedNextSteps ?? undefined,
              hasPartialFailure: complete.hasPartialFailure ?? undefined,
            };
          }
          return next;
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : "";
        toast.showToast(detail || "Odeslání zprávy selhalo.", "error");
        setMessages((prev) => prev.slice(0, -2));
        setInput(msg);
      } finally {
        setChatLoading(false);
        chatSubmitLockRef.current = false;
      }
    },
    [chatLoading, routeContactId, routeOpportunityId, activeReviewId, toast],
  );

  const submitPlanConfirmation = useCallback(async () => {
    if (chatLoading || chatSubmitLockRef.current) return;
    const last = messages[messages.length - 1];
    const pid = last?.role === "assistant" ? last.executionState?.planId : undefined;
    const previews = last?.role === "assistant" ? (last.executionState?.stepPreviews ?? []) : [];
    if (last?.role !== "assistant" || last.executionState?.status !== "awaiting_confirmation" || !pid) return;

    const canSelect = previews.length > 0 && previews.every((p) => p.stepId);
    const picked = canSelect
      ? Object.entries(stepSelectionByPlanId[pid] ?? {})
          .filter(([, on]) => on)
          .map(([id]) => id)
      : undefined;
    if (canSelect && (!picked || picked.length === 0)) return;

    setConfirmExecuteBusy(true);
    chatSubmitLockRef.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", suggestedActions: [], warnings: [] },
    ]);
    setChatLoading(true);
    try {
      const complete = await postAssistantChatStreaming(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildAssistantConfirmExecutionBody({
              sessionId: assistantSessionIdRef.current,
              routeContactId,
              routeOpportunityId,
              reviewId: activeReviewId,
              channel: "web_drawer",
              selectedStepIds: canSelect ? picked : undefined,
            }),
          ),
        },
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            const tail = next[next.length - 1];
            if (tail?.role === "assistant") {
              next[next.length - 1] = { ...tail, content: tail.content + chunk };
            }
            return next;
          });
        },
      );
      if (complete.sessionId) {
        setAssistantSessionId(complete.sessionId);
        try {
          sessionStorage.setItem(AI_ASSISTANT_API_SESSION_KEY, complete.sessionId);
        } catch { /* ignore */ }
      }
      setMessages((prev) => {
        const next = [...prev];
        const tail = next[next.length - 1];
        if (tail?.role === "assistant") {
          next[next.length - 1] = {
            role: "assistant",
            content: complete.message ?? "",
            suggestedActions: mapActionPayloadsToSuggestedActions(complete.suggestedActions ?? []),
            warnings: complete.warnings ?? [],
            executionState: complete.executionState ?? null,
            contextState: complete.contextState ?? null,
            stepOutcomes: complete.stepOutcomes ?? undefined,
            suggestedNextSteps: complete.suggestedNextSteps ?? undefined,
            hasPartialFailure: complete.hasPartialFailure ?? undefined,
          };
        }
        return next;
      });
      if (pid) {
        setStepSelectionByPlanId((prev) => {
          const { [pid]: _removed, ...rest } = prev;
          return rest;
        });
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      toast.showToast(detail || "Potvrzení plánu selhalo.", "error");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
      setConfirmExecuteBusy(false);
      chatSubmitLockRef.current = false;
    }
  }, [chatLoading, messages, routeContactId, routeOpportunityId, activeReviewId, stepSelectionByPlanId, toast]);

  const submitCancelPlan = useCallback(async () => {
    if (chatLoading || chatSubmitLockRef.current) return;
    const last = messages[messages.length - 1];
    const pid = last?.role === "assistant" ? last.executionState?.planId : undefined;
    if (last?.role !== "assistant" || last.executionState?.status !== "awaiting_confirmation") return;

    chatSubmitLockRef.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", suggestedActions: [], warnings: [] },
    ]);
    setChatLoading(true);
    try {
      const complete = await postAssistantChatStreaming(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildAssistantCancelPlanBody({
              sessionId: assistantSessionIdRef.current,
              routeContactId,
              routeOpportunityId,
              reviewId: activeReviewId,
              channel: "web_drawer",
            }),
          ),
        },
        (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            const tail = next[next.length - 1];
            if (tail?.role === "assistant") {
              next[next.length - 1] = { ...tail, content: tail.content + chunk };
            }
            return next;
          });
        },
      );
      if (complete.sessionId) {
        setAssistantSessionId(complete.sessionId);
        try {
          sessionStorage.setItem(AI_ASSISTANT_API_SESSION_KEY, complete.sessionId);
        } catch { /* ignore */ }
      }
      setMessages((prev) => {
        const next = [...prev];
        const tail = next[next.length - 1];
        if (tail?.role === "assistant") {
          next[next.length - 1] = {
            role: "assistant",
            content: complete.message ?? "",
            suggestedActions: mapActionPayloadsToSuggestedActions(complete.suggestedActions ?? []),
            warnings: complete.warnings ?? [],
            executionState: complete.executionState ?? null,
            contextState: complete.contextState ?? null,
            stepOutcomes: complete.stepOutcomes ?? undefined,
            suggestedNextSteps: complete.suggestedNextSteps ?? undefined,
            hasPartialFailure: complete.hasPartialFailure ?? undefined,
          };
        }
        return next;
      });
      if (pid) {
        setStepSelectionByPlanId((prev) => {
          const { [pid]: _removed, ...rest } = prev;
          return rest;
        });
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      toast.showToast(detail || "Zrušení plánu selhalo.", "error");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
      chatSubmitLockRef.current = false;
    }
  }, [chatLoading, messages, routeContactId, routeOpportunityId, activeReviewId, toast]);

  const handleSendChat = () => {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    void sendChatMessage(msg);
  };

  // Stable ref so reader.onload closure always has the latest sendChatMessage,
  // even if chatLoading / other deps caused a rebuild between attach and async fire.
  const sendChatMessageRef = useRef(sendChatMessage);
  sendChatMessageRef.current = sendChatMessage;

  const handlePasteOnInput = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
    const cd = e.clipboardData;
    logAssistantImagePipelineClient("paste_fired", {
      targetTag: (e.target as HTMLElement).tagName,
      activeElementTag: document.activeElement?.tagName,
    });
    const blob = extractImageBlobFromClipboardData(cd);
    logAssistantImagePipelineClient("paste_clipboard", {
      itemCount: cd.items.length,
      fileCount: cd.files.length,
      types: Array.from(cd.types),
      blob: blob ? `${blob.type} ${blob.size}b` : null,
    });
    if (!blob) return;
    e.preventDefault();

    const capturedBlob = blob;
    const accompanyingText = inputRef.current?.value.trim() ?? "";

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const asset: ImageAssetPayload = {
        url: dataUrl,
        mimeType: capturedBlob.type,
        filename: (capturedBlob as File).name || null,
        sizeBytes: capturedBlob.size,
      };
      logAssistantImagePipelineClient("paste_invoke_send", {
        accompanyingLen: accompanyingText.length,
      });
      setInput("");
      void sendChatMessageRef.current(accompanyingText, [asset]);
    };
    reader.readAsDataURL(capturedBlob);
  }, []);

  const handleUrgent = async () => {
    if (chatLoading || chatSubmitLockRef.current) return;
    chatSubmitLockRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: "Co je dnes urgentní?" }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/dashboard-summary");
      const data = await res.json();
      if (!res.ok) {
        toast.showToast("Načtení shrnutí selhalo.", "error");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      const summary = data.assistantSummaryText ?? "Nemám žádné urgentní položky.";
      const actions = data.suggestedActions ?? [];
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: summary, suggestedActions: actions, warnings: [] },
      ]);
    } catch {
      toast.showToast("Načtení selhalo.", "error");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
      chatSubmitLockRef.current = false;
    }
  };

  /** Nedodělky a věci neodeslané klientovi — stejná data jako dashboard, jiný prompt v API. */
  const handleRemindMe = async () => {
    if (chatLoading || chatSubmitLockRef.current) return;
    chatSubmitLockRef.current = true;
    const userLine = "Připomeň mi, co jsem ještě neudělal nebo neposlal.";
    setMessages((prev) => [...prev, { role: "user", content: userLine }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/dashboard-summary?mode=reminders");
      const data = await res.json();
      if (!res.ok) {
        toast.showToast("Načtení připomenutí selhalo.", "error");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      const summary =
        data.assistantSummaryText ??
        "Nemám žádné konkrétní připomenutí — zkuste úkoly nebo review ručně.";
      const actions = data.suggestedActions ?? [];
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: summary, suggestedActions: actions, warnings: [] },
      ]);
    } catch {
      toast.showToast("Načtení selhalo.", "error");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
      chatSubmitLockRef.current = false;
    }
  };

  const handleDraftEmail = async (clientId: string) => {
    try {
      const res = await fetch("/api/ai/assistant/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, context: "follow_up" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.showToast(data.error ?? "Návrh e-mailu selhal.", "error");
        return;
      }
      const text = `${data.subject}\n\n${data.body}`;
      await navigator.clipboard.writeText(text);
      toast.showToast("Návrh e-mailu zkopírován do schránky.", "success");
    } catch {
      toast.showToast("Kopírování selhalo.", "error");
    }
  };

  const handleAction = (action: SuggestedAction, reviewId?: string) => {
    const href = getHref(action);
    if (href) {
      setOpen(false);
      router.push(href);
      return;
    }
    if (action.type === "draft_email" && action.payload.clientId) {
      handleDraftEmail(action.payload.clientId as string);
      return;
    }
    if (action.type === "create_task") {
      setOpen(false);
      router.push("/portal/tasks");
    }
    if (reviewId) {
      setOpen(false);
      router.push(`/portal/contracts/review/${reviewId}`);
    }
  };

  const handleOpenReview = (reviewId: string) => {
    setOpen(false);
    router.push(`/portal/contracts/review/${reviewId}`);
  };

  const handleFile = async (file: File) => {
    if (!file?.size) return;
    if (isLikelyAssistantImageFile(file)) {
      if (chatLoading || chatSubmitLockRef.current) {
        toast.showToast("Počkejte na dokončení aktuální zprávy.", "error");
        return;
      }
      const accompanyingText = inputRef.current?.value.trim() ?? "";
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const asset: ImageAssetPayload = {
          url: dataUrl,
          mimeType: imageMimeForAssistantFile(file),
          filename: file.name || null,
          sizeBytes: file.size,
        };
        setInput("");
        void sendChatMessageRef.current(accompanyingText, [asset]);
      };
      reader.onerror = () => {
        toast.showToast("Soubor se nepodařilo načíst.", "error");
      };
      reader.readAsDataURL(file);
      return;
    }
    if (!isLikelyPdfUpload(file)) {
      toast.showToast("Povolený formát je PDF (smlouva) nebo obrázek (JPEG, PNG, HEIC…).", "error");
      return;
    }
    setUploadError(null);
    setUploadPhase("uploading");
    setMessages((prev) => [...prev, { role: "user", content: `Nahrán soubor: ${file.name}` }]);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/contracts/upload", { method: "POST", body: formData });
      const uploadData = await res.json();
      if (!res.ok) {
        const hint =
          typeof uploadData.code === "string"
            ? ` (${uploadData.code})`
            : "";
        setUploadError((uploadData.error ?? "Nahrání selhalo.") + hint);
        setMessages((prev) => prev.slice(0, -1));
        setUploadPhase("idle");
        return;
      }
      const reviewId = uploadData.id as string;
      setUploadPhase("processing");
      // Pipeline běží na POST /process (upload jen uloží soubor).
      const procRes = await fetch(`/api/contracts/review/${reviewId}/process`, { method: "POST" });
      const procJson = (await procRes.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        id?: string;
        processingStatus?: string;
        confidence?: number;
      };
      if (!procRes.ok) {
        const hint = typeof procJson.code === "string" ? ` (${procJson.code})` : "";
        setUploadError((procJson.error ?? "Zpracování smlouvy selhalo.") + hint);
        setMessages((prev) => prev.slice(0, -1));
        setUploadPhase("idle");
        return;
      }
      if (typeof procJson.error === "string" && procJson.processingStatus == null) {
        const hint = typeof procJson.code === "string" ? ` (${procJson.code})` : "";
        setUploadError(procJson.error + hint);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${procJson.error} Otevřete review pro detail nebo zkuste znovu.`,
            reviewId,
            draftActions: [],
            clientMatchCandidates: [],
          },
        ]);
        setActiveReviewId(reviewId);
        setUploadPhase("idle");
        return;
      }
      const detailRes = await fetch(`/api/contracts/review/${reviewId}`);
      const detail = await detailRes.json();
      if (!detailRes.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Smlouva byla nahrána a zpracována. Otevřete review pro další kroky.`,
            reviewId,
            draftActions: [],
            clientMatchCandidates: [],
          },
        ]);
        setActiveReviewId(reviewId);
        setUploadPhase("idle");
        return;
      }
      const summary = formatUploadSuccessMessage(detail);
      setActiveReviewId(reviewId);

      let bootstrapTail =
        "Návrh kroků se nepodařilo načíst — použijte tlačítko „Otevřít review“ níže.";
      let execState: AssistantResponse["executionState"] = null;
      let ctxState: AssistantResponse["contextState"] = null;
      let bootWarnings: string[] | undefined;
      try {
        const complete = await postAssistantChatStreaming(
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildAssistantPostUploadReviewBootstrapBody({
                sessionId: assistantSessionIdRef.current,
                routeContactId,
                routeOpportunityId,
                reviewId,
                channel: "web_drawer",
              }),
            ),
          },
          () => {},
        );
        if (complete.sessionId) {
          setAssistantSessionId(complete.sessionId);
          try {
            sessionStorage.setItem(AI_ASSISTANT_API_SESSION_KEY, complete.sessionId);
          } catch {
            /* ignore */
          }
        }
        bootstrapTail = (complete.message ?? "").trim() || bootstrapTail;
        execState = complete.executionState ?? null;
        ctxState = complete.contextState ?? null;
        bootWarnings = complete.warnings;
      } catch {
        /* keep bootstrapTail fallback */
      }

      const content = [summary, bootstrapTail].filter(Boolean).join("\n\n");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content,
          reviewId,
          draftActions: detail.draftActions ?? [],
          clientMatchCandidates: (detail.clientMatchCandidates ?? []).map(
            (c: { clientId: string; displayName?: string }) => ({
              clientId: c.clientId,
              displayName: c.displayName,
            })
          ),
          executionState: execState ?? undefined,
          contextState: ctxState ?? undefined,
          warnings: bootWarnings,
        },
      ]);
    } catch {
      setUploadError("Zpracování souboru selhalo.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setUploadPhase("idle");
    }
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  };

  const handleAssistantChatImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length) return;
    if (chatLoading || chatSubmitLockRef.current) {
      toast.showToast("Počkejte na dokončení aktuální zprávy.", "error");
      return;
    }
    const list = Array.from(files)
      .filter((f) => isLikelyAssistantImageFile(f))
      .slice(0, MAX_ASSISTANT_CHAT_IMAGES);
    if (list.length === 0) {
      toast.showToast("Vyberte obrázek (JPEG, PNG, HEIC…).", "error");
      return;
    }
    const accompanyingText = inputRef.current?.value.trim() ?? "";
    void Promise.all(
      list.map(
        (file) =>
          new Promise<ImageAssetPayload>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => {
              resolve({
                url: r.result as string,
                mimeType: imageMimeForAssistantFile(file),
                filename: file.name || null,
                sizeBytes: file.size,
              });
            };
            r.onerror = () => reject(new Error("read_failed"));
            r.readAsDataURL(file);
          }),
      ),
    )
      .then((assets) => {
        setInput("");
        void sendChatMessageRef.current(accompanyingText, assets);
      })
      .catch(() => {
        toast.showToast("Soubory se nepodařilo načíst.", "error");
      });
  };

  const handleImportContactsClick = () => {
    setImportContactsResult(null);
    contactsImportFileRef.current?.click();
  };

  const isExcelFile = (f: File) =>
    f.name.toLowerCase().endsWith(".xlsx") ||
    f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const handleImportContactsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportContactsFile(file);
    setImportContactsPreview(null);
    setImportContactsResult(null);
    setImportContactsMapping(DEFAULT_CONTACT_IMPORT_MAPPING);
    setImportContactsStep("mapping");
    setImportContactsLoading(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const preview = isExcelFile(file)
        ? await getSpreadsheetPreview(fd)
        : await getCsvPreview(fd);
      if (preview) {
        setImportContactsPreview(preview);
      } else {
        toast.showToast("Nepodařilo se načíst náhled souboru.", "error");
        setImportContactsStep("idle");
        setImportContactsFile(null);
      }
    } catch {
      toast.showToast("Načtení souboru selhalo.", "error");
      setImportContactsStep("idle");
      setImportContactsFile(null);
    } finally {
      setImportContactsLoading(false);
    }
  };

  const handleImportContactsSheetChange = async (sheet: string) => {
    if (!importContactsFile || !isExcelFile(importContactsFile)) return;
    setImportContactsLoading(true);
    const fd = new FormData();
    fd.set("file", importContactsFile);
    fd.set("sheetName", sheet);
    try {
      const p = await getSpreadsheetPreview(fd);
      if (p) {
        setImportContactsPreview(p);
        setImportContactsMapping(DEFAULT_CONTACT_IMPORT_MAPPING);
      }
    } catch {
      toast.showToast("Načtení listu selhalo.", "error");
    } finally {
      setImportContactsLoading(false);
    }
  };

  const handleImportContactsConfirm = async () => {
    if (!importContactsFile || !importContactsPreview) return;
    setImportContactsLoading(true);
    setImportContactsResult(null);
    const fd = new FormData();
    fd.set("file", importContactsFile);
    if (isExcelFile(importContactsFile) && importContactsPreview.activeSheet) {
      fd.set("sheetName", importContactsPreview.activeSheet);
    }
    try {
      const result = isExcelFile(importContactsFile)
        ? await importContactsFromSpreadsheet(fd, importContactsMapping)
        : await importContactsCsv(fd, importContactsMapping, importContactsPreview.hasHeader);
      setImportContactsResult(result);
      setImportContactsStep("done");
      if (result.imported > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        toast.showToast(`Importováno ${result.imported} klientů.`);
      }
    } catch {
      toast.showToast("Import selhal.", "error");
    } finally {
      setImportContactsLoading(false);
    }
  };

  const handleImportContactsReset = () => {
    setImportContactsFile(null);
    setImportContactsPreview(null);
    setImportContactsResult(null);
    setImportContactsMapping(DEFAULT_CONTACT_IMPORT_MAPPING);
    setImportContactsStep("idle");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay jen vlevo od panelu (na desktopu), aby klik do panelu nezavíral */}
      <div
        className="fixed z-[var(--z-drawer-overlay,100)] max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:top-[calc(var(--safe-area-top,0px)+3.25rem)] max-md:bg-black/25 md:inset-0 md:right-[420px] md:bg-transparent"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className="fixed z-[101] flex min-h-0 flex-col bg-[color:var(--wp-surface-card)] shadow-[-4px_0_24px_rgba(0,0,0,0.12)] max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:top-[calc(var(--safe-area-top,0px)+3.25rem)] max-md:rounded-t-2xl max-md:border max-md:border-b-0 max-md:border-[color:var(--wp-surface-card-border)] md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-full md:max-w-[420px] md:rounded-none md:border-0"
        role="dialog"
        aria-label="Interní AI podpora pro CRM"
      >
        {/* Header */}
        <div className="shrink-0 px-4 py-3.5 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-1.5 shadow-sm dark:bg-white">
                <AiAssistantBrandIcon size={24} variant="colorOnWhite" className="max-h-full max-w-full" />
              </div>
              <h2 className="text-lg font-black text-[color:var(--wp-text)] tracking-tight">AI Asistent</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] transition-colors flex-shrink-0"
              aria-label="Zavřít"
            >
              <X size={22} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="aidv-assistant-conversation-select" className="text-xs font-bold text-[color:var(--wp-text-secondary)] shrink-0">
              Konverzace (7 dní)
            </label>
            <select
              id="aidv-assistant-conversation-select"
              className="flex-1 min-w-[180px] min-h-[40px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2 py-1.5 text-xs font-medium text-[color:var(--wp-text)]"
              disabled={conversationPickerLoading || chatLoading}
              value={assistantSessionId ?? "__new__"}
              onChange={async (e) => {
                const v = e.target.value;
                if (v === "__new__") {
                  startNewAssistantConversation();
                  return;
                }
                setAssistantSessionId(v);
                try {
                  sessionStorage.setItem(AI_ASSISTANT_API_SESSION_KEY, v);
                } catch {
                  /* ignore */
                }
                setHistoryHydrationLoading(true);
                const hist = await loadAdvisorAssistantConversationHistory(v);
                setHistoryHydrationLoading(false);
                if (hist.ok) {
                  setActiveReviewId(null);
                  setMessages(historyDtoToChatMessages(hist.messages));
                } else {
                  toast.showToast(hist.error, "error");
                }
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
              disabled={!assistantSessionId || conversationPickerLoading || chatLoading}
              className="shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Přejmenovat konverzaci"
              title="Přejmenovat konverzaci"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteAssistantConversation()}
              disabled={!assistantSessionId || conversationPickerLoading || chatLoading}
              className="shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Smazat konverzaci"
              title="Smazat konverzaci"
            >
              <Trash2 size={16} />
            </button>
            {conversationPickerLoading && (
              <Loader2 size={16} className="animate-spin text-indigo-500 shrink-0" aria-hidden />
            )}
          </div>
        </div>

        {/* Rychlé akce pro poradce (nahrání jen v pásu níže — bez duplicity) */}
        <div className="shrink-0 px-4 pt-3 pb-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleUrgent}
            disabled={chatLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] text-xs font-bold shadow-sm hover:bg-[color:var(--wp-surface-muted)] transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Zap size={15} className="text-indigo-500" />
            Co je dnes urgentní?
          </button>
          <button
            type="button"
            onClick={handleRemindMe}
            disabled={chatLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] text-xs font-bold shadow-sm hover:bg-[color:var(--wp-surface-muted)] transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Bell size={15} className="text-indigo-500" />
            Připomeň mi
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleUploadInput}
        />
        <input
          ref={assistantChatImageInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={handleAssistantChatImageInput}
        />
        <input
          ref={contactsImportFileRef}
          type="file"
          accept=".csv,.txt,.xlsx"
          className="hidden"
          onChange={handleImportContactsFileChange}
        />

        {/* Nahrání smlouvy — jedna zóna, větší než předchozí strip */}
        <div className="shrink-0 px-4 pb-2">
          <div
            ref={uploadZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => uploadPhase === "idle" && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl px-5 py-4 flex items-center gap-4 transition-all ${
              uploadPhase === "idle"
                ? "border-indigo-200 bg-indigo-50/20 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer"
                : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 cursor-wait pointer-events-none"
            }`}
          >
            {uploadPhase === "idle" && !uploadError && (
              <>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
                  <UploadCloud size={24} strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-black text-[color:var(--wp-text)]">Nahrát smlouvu (PDF)</p>
                  <p className="text-xs text-[color:var(--wp-text-secondary)] font-medium mt-0.5">
                    {isNative
                      ? "Klepněte pro výběr souboru."
                      : "Přetáhněte soubor sem nebo klikněte pro výběr z disku."}
                  </p>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      assistantChatImageInputRef.current?.click();
                    }}
                    className="mt-1.5 text-xs font-bold text-indigo-600 hover:underline text-left"
                  >
                    Fotka do konverzace (JPEG, PNG, HEIC…)
                  </button>
                </div>
              </>
            )}
            {uploadPhase === "uploading" && (
              <div className="flex w-full items-center justify-center gap-3 py-1">
                <Loader2 size={24} className="animate-spin text-indigo-500 shrink-0" />
                <p className="text-sm font-bold text-[color:var(--wp-text-secondary)]">Nahrávám…</p>
              </div>
            )}
            {uploadPhase === "processing" && (
              <div className="flex w-full flex-col items-center gap-2 py-1">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] text-center">
                  AI extrahuje data ze smlouvy…
                </p>
              </div>
            )}
          </div>
          {uploadError && (
            <div className="mt-1.5 rounded-xl px-3 py-2 bg-rose-50 border border-rose-200 flex items-center gap-2">
              <AlertCircle size={15} className="text-rose-600 shrink-0" />
              <p className="text-xs font-bold text-rose-800 flex-1 min-w-0 truncate">{uploadError}</p>
              <button
                type="button"
                onClick={() => { setUploadError(null); fileInputRef.current?.click(); }}
                className="text-xs font-bold text-rose-600 hover:underline shrink-0"
              >
                Znovu
              </button>
            </div>
          )}
        </div>

        {/* Import klientů block */}
        {importContactsStep !== "idle" && (
          <div className="shrink-0 px-4 pb-3">
            <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <h3 className="text-sm font-bold text-[color:var(--wp-text)] mb-3">Import klientů</h3>
              {importContactsLoading && importContactsStep === "mapping" && (
                <div className="flex items-center gap-2 text-[color:var(--wp-text-secondary)] text-sm py-2">
                  <Loader2 size={16} className="animate-spin" />
                  Načítám náhled…
                </div>
              )}
              {importContactsStep === "mapping" && importContactsPreview && !importContactsLoading && (
                <>
                  <p className="text-xs text-[color:var(--wp-text-secondary)] mb-2">Soubor: {importContactsFile?.name}</p>
                  <ImportColumnMappingBlock
                    headers={importContactsPreview.headers}
                    mapping={importContactsMapping}
                    onMappingChange={setImportContactsMapping}
                    sheetNames={importContactsPreview.sheetNames}
                    activeSheet={importContactsPreview.activeSheet}
                    onActiveSheetChange={
                      importContactsFile && isExcelFile(importContactsFile) ? handleImportContactsSheetChange : undefined
                    }
                    variant="drawer"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleImportContactsReset}
                      className="px-3 py-1.5 text-xs font-bold border border-[color:var(--wp-surface-card-border)] rounded-xl text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportContactsStep("preview")}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                    >
                      Další: Náhled
                    </button>
                  </div>
                </>
              )}
              {importContactsStep === "preview" && importContactsPreview && (
                <>
                  <p className="text-xs text-[color:var(--wp-text-secondary)] mb-2">Náhled (max 10 řádků):</p>
                  <div className="overflow-x-auto max-h-32 overflow-y-auto border border-[color:var(--wp-surface-card-border)] rounded-lg mb-3 text-xs">
                    <table className="border-collapse w-full">
                      <tbody>
                        {importContactsPreview.rows.slice(0, 10).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="border border-[color:var(--wp-surface-card-border)] px-2 py-0.5">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setImportContactsStep("mapping")}
                      className="px-3 py-1.5 text-xs font-bold border border-[color:var(--wp-surface-card-border)] rounded-xl text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                    >
                      Zpět
                    </button>
                    <button
                      type="button"
                      onClick={handleImportContactsConfirm}
                      disabled={importContactsLoading}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {importContactsLoading ? "Importuji…" : `Přidat ${importContactsPreview.totalRows ?? importContactsPreview.rows.length} klientů`}
                    </button>
                  </div>
                </>
              )}
              {importContactsStep === "done" && importContactsResult && (
                <>
                  <div className="text-sm mb-3">
                    <p className="text-green-700 font-medium">Importováno: {importContactsResult.imported}</p>
                    {importContactsResult.skipped > 0 && <p className="text-amber-700">Přeskočeno (duplicity): {importContactsResult.skipped}</p>}
                    {importContactsResult.errors.length > 0 && (
                      <p className="text-amber-700">Chyby: {importContactsResult.errors.length} řádků</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleImportContactsReset}
                      className="px-3 py-1.5 text-xs font-bold border border-[color:var(--wp-surface-card-border)] rounded-xl text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                    >
                      Importovat znovu
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOpen(false); router.push("/portal/contacts"); }}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                    >
                      Přejít na Klienti
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Chat history */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div
            className={`flex-1 overflow-y-auto px-4 space-y-3 ${historyHydrationLoading ? "opacity-60 pointer-events-none" : ""}`}
          >
            {latestAssistantContext?.lockedClientId && (
              <div className="sticky top-0 z-10 py-2">
                <ContextLockBadge
                  lockedClientId={latestAssistantContext.lockedClientId}
                  lockedClientLabel={latestAssistantContext.lockedClientLabel}
                />
              </div>
            )}
            {messages.length === 0 && uploadPhase === "idle" && (
              <p className="text-sm text-[color:var(--wp-text-secondary)] font-medium py-2">
                Napište zprávu nebo nahrajte PDF. Po zpracování vám nabídneme další kroky.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={m.role === "user" || m.role === "assistant" ? (m.stableKey ?? `live-${i}`) : `row-${i}`}
                className={`flex gap-2.5 items-start ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" ? (
                  <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mt-0.5 shadow-sm p-1">
                    <AiAssistantBrandIcon size={20} className="max-w-full max-h-full" />
                  </div>
                ) : null}
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm"
                  }`}
                >
                  <p className={`whitespace-pre-wrap ${m.role === "user" ? "text-white" : "text-[color:var(--wp-text-secondary)]"}`}>{m.content}</p>
                  {m.role === "assistant" && m.executionState && (
                    <>
                      <ExecutionBadge
                        status={m.executionState.status}
                        totalSteps={m.executionState.totalSteps}
                        pendingSteps={m.executionState.pendingSteps}
                      />
                      {/* Structured preview for awaiting_confirmation / draft */}
                      {(m.executionState.status === "awaiting_confirmation" || m.executionState.status === "draft") &&
                        (m.executionState.stepPreviews?.length ?? 0) > 0 && (
                          <ConfirmationPreviewPanel
                            stepPreviews={m.executionState.stepPreviews!}
                            clientLabel={m.executionState.clientLabel}
                            isDraft={m.executionState.status === "draft"}
                            selectable={m.executionState.status === "awaiting_confirmation" && !!m.executionState.planId}
                            stepSelection={m.executionState.planId ? stepSelectionByPlanId[m.executionState.planId] ?? {} : {}}
                            onToggleStep={m.executionState.planId ? (stepId: string) => handleToggleStep(m.executionState!.planId!, stepId) : undefined}
                            advisoryHints={(m.executionState.stepPreviews ?? [])
                              .filter(s => (s.validationWarnings?.length ?? 0) > 0)
                              .flatMap(s => s.validationWarnings!.map(w => `${s.label}: ${w}`))}
                          />
                        )}
                    </>
                  )}
                  {m.role === "assistant" && (m.stepOutcomes?.length ?? 0) > 0 && (
                    <StepOutcomeCard outcomes={m.stepOutcomes!} hasPartialFailure={m.hasPartialFailure} />
                  )}
                  {m.role === "assistant" &&
                    m.contextState?.lockedClientId &&
                    !(
                      showStickyContextLock &&
                      m.contextState.lockedClientId === latestAssistantContext?.lockedClientId
                    ) &&
                    !(
                      (m.executionState?.stepPreviews?.length ?? 0) > 0 &&
                      Boolean(m.executionState?.clientLabel)
                    ) && (
                    <div className="mt-1.5">
                      <ContextLockBadge
                        lockedClientId={m.contextState.lockedClientId}
                        lockedClientLabel={m.contextState.lockedClientLabel}
                        className="text-[10px]"
                      />
                    </div>
                  )}
                  {m.role === "assistant" && (m.warnings?.length ?? 0) > 0 && (
                    <WarningsBlock warnings={m.warnings!} />
                  )}
                  {m.role === "assistant" && (m.suggestedActions?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {m.suggestedActions!.map((a, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => handleAction(a)}
                          className="text-xs px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 font-bold hover:bg-indigo-100 transition-colors"
                        >
                          {a.label.length > 28 ? a.label.slice(0, 26) + "…" : a.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && (m.suggestedNextSteps?.length ?? 0) > 0 && (
                    <SuggestedNextStepsChips steps={m.suggestedNextSteps!} onSend={(msg) => { setInput(""); void sendChatMessage(msg); }} />
                  )}
                  {m.role === "assistant" && m.reviewId && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => handleOpenReview(m.reviewId!)}
                        className="text-xs font-black px-4 py-2 rounded-xl bg-aidv-create text-white shadow-sm hover:bg-aidv-create-hover transition-colors uppercase tracking-wider"
                      >
                        Otevřít review
                      </button>
                      {(() => {
                        const clientId = m.clientMatchCandidates?.[0]?.clientId;
                        return clientId ? (
                          <button
                            type="button"
                            onClick={() => handleDraftEmail(clientId)}
                            className="text-xs px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] font-bold hover:bg-[color:var(--wp-surface-muted)] transition-colors"
                          >
                            Připravit email
                          </button>
                        ) : null;
                      })()}
                      {(m.draftActions ?? []).map((d, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => handleOpenReview(m.reviewId!)}
                          className="text-xs px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] font-bold hover:bg-[color:var(--wp-surface-muted)] transition-colors"
                        >
                          {d.label.length > 24 ? d.label.slice(0, 22) + "…" : d.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start gap-2.5 items-start">
                <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mt-0.5 shadow-sm p-1">
                  <AiAssistantBrandIcon size={20} className="max-w-full max-h-full" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-indigo-500 shrink-0" aria-hidden />
                  <span className="text-sm text-[color:var(--wp-text-secondary)] font-medium">Přemýšlím…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area - reference */}
          <div className="shrink-0 p-4 pt-2 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/80">
            {(awaitingConfirmationFromLatestTurn || confirmExecuteBusy) ? (
              <div className="mb-2 space-y-1.5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void submitPlanConfirmation()}
                    disabled={chatLoading || confirmSelectionInvalid}
                    className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {chatLoading && confirmExecuteBusy ? (
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
                    disabled={chatLoading && confirmExecuteBusy}
                    className="min-h-[44px] px-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Zrušit plán akcí"
                  >
                    Zrušit plán
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleEditIntent}
                  className="w-full flex items-center justify-center gap-1.5 min-h-[36px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-xs font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors"
                >
                  <Pencil size={12} />
                  Upravit zadání
                </button>
              </div>
            ) : null}
            {/* onPaste on the wrapper catches image paste even when the browser
                suppresses clipboard events on <input type="text"> for non-text content */}
            <div className="flex gap-2" onPaste={handlePasteOnInput}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                placeholder="Zeptejte se asistenta…"
                className="flex-1 min-w-0 rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={handleSendChat}
                disabled={chatLoading || !input.trim()}
                className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                aria-label="Odeslat"
              >
                {chatLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
            <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1.5 leading-snug">
              {awaitingConfirmationFromLatestTurn
                ? "Nový dotaz můžete napsat až po potvrzení nebo zrušení plánu výše. Tip: upravte výběr kroků zaškrtávátky."
                : "Např. přiřaď smlouvu ke klientovi, vytvoř úkol, připrav email…"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
