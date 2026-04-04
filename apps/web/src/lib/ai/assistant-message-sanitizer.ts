/**
 * Sanitizes assistant response text before it reaches the advisor UI.
 * Strips internal debug tokens, raw JSON tool results, orchestration markers,
 * and technical identifiers that must never be visible to the end user.
 */

/**
 * Strips `[RESULT:toolName] { ... JSON ... }` blocks (with balanced braces)
 * including an optional trailing `Warnings:` line.
 */
function stripToolResultBlocks(text: string): string {
  const marker = "[RESULT:";
  let result = "";
  let i = 0;

  while (i < text.length) {
    const start = text.indexOf(marker, i);
    if (start === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, start);

    const jsonStart = text.indexOf("{", start);
    const lineEnd = text.indexOf("\n", start);

    if (jsonStart === -1 || (lineEnd !== -1 && lineEnd < jsonStart)) {
      i = lineEnd === -1 ? text.length : lineEnd + 1;
      continue;
    }

    let depth = 0;
    let j = jsonStart;
    for (; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }

    i = j;
    if (i < text.length && text[i] === "\n") i++;
    if (i < text.length && text.startsWith("Warnings:", i)) {
      const wEnd = text.indexOf("\n", i);
      i = wEnd === -1 ? text.length : wEnd + 1;
    }
  }

  return result;
}

const TOOL_CALL_RE = /\[TOOL:\w+[^\]]*\]/g;
const TOOL_ERROR_RE = /\[Nástroj \w+ selhal\]/g;
const ENTITY_REF_RE = /\[(review|task|client|payment|contact|opportunity):[a-f0-9-]+\]/gi;
const CONTEXT_MARKER_RE = /\[CONTEXT:[^\]]*\]/gi;
const STATUS_BRACKET_RE =
  /\[(requires_confirmation|confirmed|executing|skipped|succeeded|failed|completed|awaiting_confirmation|draft)\]/gi;
const RAW_ID_LINE_RE =
  /^(dealId|taskId|contactId|opportunityId|entityId|reviewId|sourceId|planId|sessionId|tenantId)\s*:\s*\S+\s*$/gm;

/** Strips entire lines that start with Phase 2+3 internal field name dumps from model output. */
const CANONICAL_DEBUG_LINE_RE =
  /^(packetMeta|publishHints|participants|insuredRisks|healthQuestionnaires|investmentData|paymentData|bundleConfidence|detectionMethods|subdocumentCandidates)\s*:.*$/gm;
const INTERNAL_DIAGNOSTIC_RE =
  /^(Volám|Hledám|Načítám|Spouštím|Kontroluji)\s[^\n]*\.{3}\s*$/gm;
const MULTI_BLANK_RE = /\n{3,}/g;

const INLINE_UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const ORPHAN_HEX_PREFIX_RE = /\b[0-9a-f]{8}…\b/gi;

/**
 * Strips standalone JSON blocks that the model may emit outside of [RESULT:] wrappers.
 * Matches `{` at line start (optional whitespace), balanced braces spanning 2+ lines.
 */
function stripOrphanJsonBlocks(text: string): string {
  return text.replace(/^[ \t]*\{[\s\S]*?\n[ \t]*\}[ \t]*$/gm, (match) => {
    try {
      JSON.parse(match.trim());
      return "";
    } catch {
      return match;
    }
  });
}

export function sanitizeAssistantMessageForAdvisor(raw: string): string {
  if (!raw) return raw;

  let text = raw;

  text = stripToolResultBlocks(text);
  text = text.replace(/\[RESULT:\w+\][^\n]*/g, "");
  text = text.replace(TOOL_CALL_RE, "");
  text = text.replace(TOOL_ERROR_RE, "");
  text = text.replace(ENTITY_REF_RE, "");
  text = text.replace(CONTEXT_MARKER_RE, "");
  text = text.replace(STATUS_BRACKET_RE, "");
  text = text.replace(RAW_ID_LINE_RE, "");
  text = text.replace(INTERNAL_DIAGNOSTIC_RE, "");
  text = stripOrphanJsonBlocks(text);
  // Strip lines that start with Phase 2+3 internal field names (model debug leak)
  text = text.replace(CANONICAL_DEBUG_LINE_RE, "");
  text = text.replace(INLINE_UUID_RE, "");
  text = text.replace(ORPHAN_HEX_PREFIX_RE, "");
  text = text.replace(MULTI_BLANK_RE, "\n\n");

  return text.trim();
}

/**
 * Sanitizes a single warning string — lighter than full message sanitizer
 * but strips UUIDs, bracket markers, and technical identifiers.
 */
export function sanitizeWarningForAdvisor(raw: string): string {
  if (!raw) return raw;
  let text = raw;
  // Entity refs before UUID strip — otherwise `[client:uuid]` becomes `[client:]` and no longer matches.
  text = text.replace(ENTITY_REF_RE, "");
  text = text.replace(INLINE_UUID_RE, "").replace(ORPHAN_HEX_PREFIX_RE, "");
  text = text.replace(CONTEXT_MARKER_RE, "");
  text = text.replace(STATUS_BRACKET_RE, "");
  text = text.replace(RAW_ID_LINE_RE, "");
  // Inline `sessionId: <uuid>` after UUID strip leaves `sessionId:` — remove dangling technical keys.
  text = text.replace(
    /\b(sessionId|planId|tenantId|contactId|opportunityId|entityId|reviewId)\s*:\s*\S*/gi,
    "",
  );
  text = text.replace(/\s{2,}/g, " ");
  return text.trim();
}
