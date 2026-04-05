/** Minimální počet zpráv ve vlákně, aby se automaticky spustil AI souhrn (bez ručního „Obnovit“). */
export const ADVISOR_CHAT_AI_SUMMARY_MIN_MESSAGES = 5;

/**
 * Klíčové fráze v textu od klienta — naznačují poptávku / otázku / žádost o pomoc.
 * Porovnává se jako celek obklopený mezerami (kvůli falešným shodám typu „nechci“ ↔ „chci“).
 */
const CLIENT_INTENT_PHRASES = [
  "potřebuji",
  "potrebuji",
  "potřeboval",
  "potreboval",
  "potřebovala",
  "potrebovala",
  "chci",
  "chceme",
  "chtěl bych",
  "chtel bych",
  "chtěla bych",
  "chtela bych",
  "můžete",
  "muzete",
  "můžu",
  "muzu",
  "můžeme",
  "muzeme",
  "prosím",
  "prosim",
  "prosba",
  "dotaz",
  "poptávka",
  "poptavka",
  "žádost",
  "zadost",
  "žádám",
  "zadam",
  "jak na",
  "co mám",
  "jak mám",
  "nejde mi",
  "nefunguje",
  "pomoc",
  "pomozte",
  "schůzku",
  "schuzku",
  "schůzka",
  "schuzka",
  "zavolej",
  "zavolat",
  "urgentní",
  "urgentni",
  "want to",
  "need to",
  "please",
  "can you",
  "could you",
  "how do i",
  "how can i",
] as const;

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Jedna mezera mezi „slovy“, na začátku a konci mezera — pro bezpečné hledání frází. */
function paddedTokenHaystack(clientBodies: string): string {
  const inner = normalizeForMatch(clientBodies).replace(/[^\p{L}\p{N}]+/gu, " ");
  const collapsed = inner.replace(/\s+/g, " ").trim();
  return collapsed ? ` ${collapsed} ` : "";
}

/**
 * Zda automaticky zavolat LLM souhrn kontextu.
 * true: ≥ {@link ADVISOR_CHAT_AI_SUMMARY_MIN_MESSAGES} zpráv, nebo klient v textu naznačuje poptávku.
 */
export function shouldAutoRunAdvisorChatAiSummary(msgs: { senderType: string; body: string }[]): boolean {
  if (msgs.length >= ADVISOR_CHAT_AI_SUMMARY_MIN_MESSAGES) return true;
  const clientText = msgs.filter((m) => m.senderType === "client").map((m) => m.body);
  const hay = paddedTokenHaystack(clientText.join(" "));
  if (!hay) return false;
  for (const phrase of CLIENT_INTENT_PHRASES) {
    const p = normalizeForMatch(phrase).trim();
    if (!p) continue;
    if (hay.includes(` ${p} `)) return true;
  }
  return false;
}
