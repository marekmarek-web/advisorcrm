/**
 * Anthropic adapter for AI Review extraction pipeline.
 *
 * Used exclusively when AI_REVIEW_PROVIDER=anthropic.
 * Mirrors the interface of the relevant functions in @/lib/openai
 * so the provider layer can swap them transparently.
 *
 * Cost / performance hardening (fáze 3):
 * - `anthropicCreateAiReviewResponseFromPrompt`: splits template variables into
 *   metadata (system prompt) and document text (user turn, capped).
 *   Prevents sending 100k+ chars of section texts unnecessarily.
 * - `anthropicCreateResponseWithFile`: always sends PDF as base64 document block
 *   (never as raw binary text, which produced garbage).
 * - Module-level `_lastCallMeta` exposes input mode / size to the caller for trace.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { CreateResponseResult } from "@/lib/openai";
import type { AiReviewPromptKey } from "./prompt-model-registry";
import { getPromptTemplateContent } from "./ai-review-prompt-templates-content";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_TIMEOUT_MS = 120_000;
const ANTHROPIC_MAX_TOKENS = 16_000;

/**
 * Max chars for the primary document text in the user turn (extraction prompts).
 * Caps at 40k chars ≈ ~10k tokens for Czech financial text.
 * The 28k extracted_text (head+tail slice) is typically within this cap.
 * Bundle section context (up to 75k) is capped here to prevent runaway costs.
 */
const ANTHROPIC_DOC_CONTENT_MAX_CHARS = 40_000;

export function resolveAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  _client = new Anthropic({ apiKey, timeout: ANTHROPIC_TIMEOUT_MS });
  return _client;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// ─── Input mode tracking (for trace) ─────────────────────────────────────────

export type AnthropicInputMode =
  | "compact_section_text"   // bundle_section_context or contractual_section_text
  | "structured_text"        // structured/markdown from Adobe preprocess
  | "markdown"               // extracted_text / document_text from markdown
  | "raw_pdf"                // PDF bytes via base64 document block
  | "prompt_builder_text"    // postprocess payloads (small JSON)
  | "none";

export type AnthropicCallMeta = {
  inputMode: AnthropicInputMode;
  inputSizeChars: number;
  promptKey?: string;
};

/** Last adapter call metadata — read by getAiReviewProviderMeta() for trace. */
let _lastCallMeta: AnthropicCallMeta = { inputMode: "none", inputSizeChars: 0 };

export function getLastAnthropicCallMeta(): AnthropicCallMeta {
  return { ..._lastCallMeta };
}

function setLastCallMeta(meta: AnthropicCallMeta): void {
  _lastCallMeta = meta;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

export function logAnthropicCall(params: {
  endpoint: string;
  model: string;
  latencyMs: number;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  inputSizeChars?: number;
  inputMode?: string;
  error?: string;
}): void {
  console.info("[Anthropic]", JSON.stringify({
    endpoint: params.endpoint,
    model: params.model,
    latencyMs: params.latencyMs,
    success: params.success,
    ...(params.inputSizeChars != null ? { inputSizeChars: params.inputSizeChars } : {}),
    ...(params.inputMode ? { inputMode: params.inputMode } : {}),
    ...(params.inputTokens != null ? { inputTokens: params.inputTokens } : {}),
    ...(params.outputTokens != null ? { outputTokens: params.outputTokens } : {}),
    ...(params.error ? { error: params.error.slice(0, 200) } : {}),
  }));
}

// ─── Template rendering ───────────────────────────────────────────────────────

/**
 * Variable names that carry heavy document/payload text.
 * For extraction prompts, these are placed in the user turn (not system prompt).
 */
const DOCUMENT_TEXT_VAR_NAMES = new Set([
  "extracted_text", "extractedText",
  "document_text", "documentText",
  "text_excerpt", "textExcerpt",
  "contractual_section_text", "contractualSectionText",
  "health_section_text", "healthSectionText",
  "investment_section_text", "investmentSectionText",
  "payment_section_text", "paymentSectionText",
  "attachment_section_text", "attachmentSectionText",
  "bundle_section_context", "bundleSectionContext",
]);

/**
 * Priority-ordered list for picking primary user-turn document content.
 * First non-empty, non-"(not available)" match wins.
 *
 * `extracted_text` (28k head+tail excerpt) is preferred over bundle_section_context (75k)
 * for token efficiency — it provides full document coverage at lower cost.
 * bundle_section_context is used as fallback when extracted_text is absent.
 */
const USER_CONTENT_PRIORITY: { key: string; inputMode: AnthropicInputMode }[] = [
  { key: "extracted_text",            inputMode: "markdown" },
  { key: "extractedText",             inputMode: "markdown" },
  { key: "document_text",             inputMode: "markdown" },
  { key: "text_excerpt",              inputMode: "markdown" },
  { key: "contractual_section_text",  inputMode: "compact_section_text" },
  { key: "contractualSectionText",    inputMode: "compact_section_text" },
  { key: "bundle_section_context",    inputMode: "compact_section_text" },
  { key: "bundleSectionContext",      inputMode: "compact_section_text" },
];

/** Returns the primary document content for the user turn and its input mode. */
function pickDocumentContentForUserTurn(variables: Record<string, string>): {
  text: string;
  inputMode: AnthropicInputMode;
  sizeChars: number;
} {
  for (const { key, inputMode } of USER_CONTENT_PRIORITY) {
    const val = variables[key];
    if (val && val.trim() && val.trim() !== "(not available)" && val.trim() !== "(no text)") {
      const capped = val.trim().slice(0, ANTHROPIC_DOC_CONTENT_MAX_CHARS);
      const truncated = val.trim().length > ANTHROPIC_DOC_CONTENT_MAX_CHARS;
      return {
        text: truncated ? `${capped}\n…[zkráceno pro Claude — celkový text: ${val.trim().length} znaků]` : capped,
        inputMode,
        sizeChars: capped.length,
      };
    }
  }
  return { text: "(no document text available)", inputMode: "none", sizeChars: 0 };
}

/**
 * Render template with METADATA vars only.
 * Document text vars are replaced with a note directing Claude to the user message.
 * Unknown placeholders → "(not available)".
 */
function renderTemplateMetadataOnly(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (DOCUMENT_TEXT_VAR_NAMES.has(name)) {
      return `[→ dokument/sekce v uživatelské zprávě níže]`;
    }
    const val = variables[name];
    return typeof val === "string" && val.trim() ? val : "(not available)";
  });
}

/**
 * Render full template (metadata + text vars). Used when template doesn't have
 * heavy text vars (e.g., postprocess prompts with small JSON payloads).
 */
function renderTemplateFull(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const val = variables[name];
    return typeof val === "string" && val.trim() ? val : "(not available)";
  });
}

/** Returns true if the template contains any heavy document text variables. */
function templateHasDocumentTextVars(template: string): boolean {
  for (const name of DOCUMENT_TEXT_VAR_NAMES) {
    if (template.includes(`{{${name}}}`)) return true;
  }
  return false;
}

// ─── Core call ───────────────────────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userContent: string | Anthropic.MessageParam["content"],
  endpoint: string,
  meta?: { inputMode?: AnthropicInputMode; inputSizeChars?: number },
): Promise<string> {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY není nastaven. Nastavte ho v .env.local.");
  }
  const model = resolveAnthropicModel();
  const start = Date.now();
  try {
    const contentVal = typeof userContent === "string"
      ? [{ type: "text" as const, text: userContent }]
      : userContent as Anthropic.ContentBlockParam[];

    const message = await client.messages.create({
      model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: contentVal }],
    });
    const latencyMs = Date.now() - start;
    const usage = message.usage;
    logAnthropicCall({
      endpoint,
      model,
      latencyMs,
      success: true,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      inputSizeChars: meta?.inputSizeChars,
      inputMode: meta?.inputMode,
    });
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    if (!text) throw new Error("Prázdná odpověď od Claude.");
    return text;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    logAnthropicCall({
      endpoint,
      model,
      latencyMs,
      success: false,
      error: errMsg,
    });
    throw err instanceof Error ? err : new Error(errMsg);
  }
}

// ─── Public interface ─────────────────────────────────────────────────────────

/**
 * Drop-in for `createResponse` with ai_review routing.
 * Sends the full prompt as user message — used for text-wrap extraction fallback.
 */
export async function anthropicCreateResponse(input: string): Promise<string> {
  const sizeChars = input.length;
  setLastCallMeta({ inputMode: "markdown", inputSizeChars: sizeChars });
  return callClaude(
    "Jsi AI Review systém pro extrakci dat z finančních dokumentů. Odpovídej výhradně ve formátu JSON.",
    input,
    "anthropic.createResponse",
    { inputMode: "markdown", inputSizeChars: sizeChars },
  );
}

export async function anthropicCreateResponseSafe(input: string): Promise<CreateResponseResult> {
  try {
    const text = await anthropicCreateResponse(input);
    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Drop-in for `createAiReviewResponseFromPrompt`.
 *
 * Cost/performance optimisation:
 * - For extraction prompts (templates with large text vars):
 *   system prompt = template + metadata vars only (small)
 *   user turn     = primary document content, capped at ANTHROPIC_DOC_CONTENT_MAX_CHARS
 *   → reduces input from ~100k chars to ~20-40k chars for bundle documents
 *
 * - For postprocess prompts (small JSON payloads, no heavy text vars):
 *   full template rendering (existing behaviour, payload is already small)
 */
export async function anthropicCreateAiReviewResponseFromPrompt(params: {
  promptKey: AiReviewPromptKey;
  promptId: string;
  version?: string | null;
  variables: Record<string, string>;
}): Promise<CreateResponseResult> {
  const { promptKey, variables } = params;
  const template = getPromptTemplateContent(promptKey);

  const model = resolveAnthropicModel();
  const client = getAnthropicClient();
  if (!client) {
    return { ok: false, error: "ANTHROPIC_API_KEY není nastaven." };
  }

  let systemPrompt: string;
  let userContent: string;
  let inputMode: AnthropicInputMode;
  let inputSizeChars: number;

  if (template?.systemPrompt) {
    const hasDocVars = templateHasDocumentTextVars(template.systemPrompt);

    if (hasDocVars) {
      // ── Extraction / heavy-text path ─────────────────────────────────────
      // System prompt = instructions + metadata vars only (lightweight)
      // User turn = primary document content (capped)
      systemPrompt = renderTemplateMetadataOnly(template.systemPrompt, variables);
      const doc = pickDocumentContentForUserTurn(variables);
      userContent = doc.text;
      inputMode = doc.inputMode;
      inputSizeChars = doc.sizeChars;
    } else {
      // ── Postprocess / classifier / small-payload path ────────────────────
      // Full template rendering — all vars are small (JSON payloads, metadata)
      systemPrompt = renderTemplateFull(template.systemPrompt, variables);
      // User turn: pick the primary "content" var if any, else use short instruction
      const doc = pickDocumentContentForUserTurn(variables);
      if (doc.sizeChars > 0) {
        userContent = doc.text;
        inputMode = doc.inputMode;
        inputSizeChars = doc.sizeChars;
      } else {
        userContent = "Zpracuj výše uvedená data a vrať POUZE JSON.";
        inputMode = "prompt_builder_text";
        inputSizeChars = systemPrompt.length;
      }
    }
  } else {
    // ── No template — build from variables ──────────────────────────────────
    const doc = pickDocumentContentForUserTurn(variables);
    const metaVars = Object.entries(variables)
      .filter(([k]) => !DOCUMENT_TEXT_VAR_NAMES.has(k))
      .map(([k, v]) => `${k}: ${String(v).slice(0, 500)}`)
      .join("\n");
    systemPrompt = `Jsi AI Review extrakční/klasifikační engine (${promptKey}). Odpovídej VÝHRADNĚ ve formátu JSON.\n\nKontext:\n${metaVars}`;
    userContent = doc.sizeChars > 0 ? doc.text : JSON.stringify(variables, null, 2).slice(0, 50_000);
    inputMode = doc.inputMode;
    inputSizeChars = doc.sizeChars || systemPrompt.length;
  }

  setLastCallMeta({ inputMode, inputSizeChars, promptKey });

  const start = Date.now();
  try {
    const message = await client.messages.create({
      model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    const latencyMs = Date.now() - start;
    logAnthropicCall({
      endpoint: `anthropic.promptKey.${promptKey}`,
      model,
      latencyMs,
      success: true,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
      inputSizeChars,
      inputMode,
    });
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "Prázdná odpověď od Claude." };
    return { ok: true, text };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    logAnthropicCall({
      endpoint: `anthropic.promptKey.${promptKey}`,
      model,
      latencyMs,
      success: false,
      error: errMsg,
    });
    return { ok: false, error: errMsg };
  }
}

/**
 * Drop-in for `createResponseWithFile`.
 *
 * Sends the PDF as a base64 document block (Anthropic PDF beta).
 * Previously used a broken text path that sent PDF binary as UTF-8 text.
 * Now always uses the PDF block regardless of AI_REVIEW_ANTHROPIC_PDF_BLOCK flag.
 *
 * Used only for fallback paths (rescue extraction, classifier without text, file_pdf).
 */
export async function anthropicCreateResponseWithFile(
  fileUrl: string,
  textPrompt: string,
): Promise<string> {
  const model = resolveAnthropicModel();
  const client = getAnthropicClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY není nastaven.");

  const start = Date.now();

  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new Error(`Nepodařilo se stáhnout soubor pro Claude: ${resp.status}`);

  const contentType = resp.headers.get("content-type") ?? "";
  const isPdf = contentType.includes("pdf") || fileUrl.includes(".pdf");

  let userContent: Anthropic.ContentBlockParam[];
  let inputMode: AnthropicInputMode;
  let inputSizeChars: number;

  if (isPdf || !contentType.includes("text")) {
    // Binary file (PDF, scanned image) → base64 document block
    const buf = await resp.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    inputSizeChars = buf.byteLength;
    inputMode = "raw_pdf";
    userContent = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      } as unknown as Anthropic.ContentBlockParam,
      { type: "text", text: textPrompt },
    ];
  } else {
    // Text / markdown response (e.g., preprocessed markdown URL) → plain text
    const fileText = await resp.text();
    const capped = fileText.trim().slice(0, ANTHROPIC_DOC_CONTENT_MAX_CHARS);
    inputSizeChars = capped.length;
    inputMode = "structured_text";
    userContent = [
      { type: "text", text: `${textPrompt}\n\n---\n\n${capped}` },
    ];
  }

  setLastCallMeta({ inputMode, inputSizeChars });

  try {
    const createParams = {
      model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: "Jsi AI Review systém pro extrakci dat z finančních dokumentů. Odpovídej výhradně ve formátu JSON.",
      messages: [{ role: "user" as const, content: userContent }],
    };
    const message = inputMode === "raw_pdf"
      ? await client.beta.messages.create({ ...createParams, betas: ["pdfs-2024-09-25"] })
      : await client.messages.create(createParams);

    const latencyMs = Date.now() - start;
    logAnthropicCall({
      endpoint: "anthropic.createResponseWithFile",
      model,
      latencyMs,
      success: true,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
      inputSizeChars,
      inputMode,
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    if (!text) throw new Error("Prázdná odpověď od Claude.");
    return text;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    logAnthropicCall({
      endpoint: "anthropic.createResponseWithFile",
      model,
      latencyMs,
      success: false,
      error: errMsg,
    });
    throw err instanceof Error ? err : new Error(errMsg);
  }
}

/**
 * Drop-in for `createResponseStructured` with ai_review routing.
 * Sends input to Claude, parses JSON from response.
 */
export async function anthropicCreateResponseStructured<T>(
  input: string,
  jsonSchema: Record<string, unknown>,
  options?: { schemaName?: string },
): Promise<{ text: string; parsed: T; model: string }> {
  const schemaName = options?.schemaName || "extraction";
  const model = resolveAnthropicModel();
  const systemPrompt = [
    "Jsi AI Review extrakční engine. Odpovídej VÝHRADNĚ validním JSON objektem.",
    `JSON schema (${schemaName}):`,
    JSON.stringify(jsonSchema, null, 2).slice(0, 4000),
    "Nevysvětluj, nekomentuj. Vrať jen JSON.",
  ].join("\n");

  const sizeChars = input.length;
  setLastCallMeta({ inputMode: "markdown", inputSizeChars: sizeChars });

  const text = await callClaude(
    systemPrompt,
    input,
    `anthropic.createResponseStructured.${schemaName}`,
    { inputMode: "markdown", inputSizeChars: sizeChars },
  );
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as T;
  return { text: cleaned, parsed, model };
}
