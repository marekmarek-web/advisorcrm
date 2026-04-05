import { createResponse, createResponseStructured } from "@/lib/openai";
import type { AdvisorChatAiBundle, AdvisorChatAiProvider, AdvisorChatAiSummary } from "./advisor-chat-ai-types";
import { formatAdvisorChatBundleForPrompt } from "./format-advisor-chat-bundle-prompt";

const SUMMARY_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    clientFocus: { type: "string" },
    missing: { type: "string" },
    recommendedNextStep: { type: "string" },
  },
  required: ["clientFocus", "missing", "recommendedNextStep"],
};

const SYSTEM_SUMMARY = `Jsi asistent finančního poradce v ČR. Dostaneš jen textové fakta z interního CRM a chatu.
Úkol: stručný praktický souhrn do češtiny.
Pravidla:
- Používej výhradně informace z přiloženého bloku FAKTA a KONVERZACE. Nic si nevymýšlej.
- Pokud něco z podkladů nevyplývá, napiš přesně: „Nevyplývá z podkladů.“
- Každé pole max 2 krátké věty, žádné úvahy ani „jako AI“.
- Odpověz jako JSON dle schématu (klíče anglicky: clientFocus, missing, recommendedNextStep).
- clientFocus = co klient aktuálně řeší / téma vlákna.
- missing = co chybí dodat, potvrdit nebo doplnit (podklady, údaje, termíny) — jen pokud to z podkladů plyne.
- recommendedNextStep = jeden konkrétní další krok pro poradce.`;

const SYSTEM_DRAFT = `Jsi asistent finančního poradce v ČR. Navrhneš krátkou odpověď klientovi v chatu.
Pravidla:
- Používej jen fakta z přiložených podkladů. Nic nedoplňuj z hlavy.
- Tón: profesionální, vykání („Vy“), stručné a věcné věty.
- Žádné dlouhé odstavce, žádná omáčka, žádné omluvy za AI.
- Pokud z podkladů nejde bezpečně odpovědět, napiš jednu větu, že potřebuješ upřesnění (konkrétně co).
- Nevymýšlej čísla, sazby ani závazky.
Výstup: jen text zprávy pro klienta, bez nadpisů a bez uvozovek kolem celé zprávy.`;

function normalizeSummary(raw: AdvisorChatAiSummary): AdvisorChatAiSummary {
  const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 600);
  return {
    clientFocus: clip(raw.clientFocus) || "Nevyplývá z podkladů.",
    missing: clip(raw.missing) || "Nevyplývá z podkladů.",
    recommendedNextStep: clip(raw.recommendedNextStep) || "Nevyplývá z podkladů.",
  };
}

export function createOpenAIAdvisorChatProvider(): AdvisorChatAiProvider {
  return {
    async generateContextSummary(bundle: AdvisorChatAiBundle): Promise<AdvisorChatAiSummary> {
      const block = formatAdvisorChatBundleForPrompt(bundle);
      const user = `Zde jsou podklady:\n\n${block}\n\nVrať JSON dle schématu.`;
      const input = `${SYSTEM_SUMMARY}\n\n---\n\n${user}`;
      const { parsed } = await createResponseStructured<AdvisorChatAiSummary>(input, SUMMARY_SCHEMA, {
        routing: { category: "advisor_chat" },
        schemaName: "advisor_chat_context_summary",
        store: false,
      });
      return normalizeSummary(parsed);
    },

    async generateReplyDraft(
      bundle: AdvisorChatAiBundle,
      options?: { variantHint?: string },
    ): Promise<string> {
      const block = formatAdvisorChatBundleForPrompt(bundle);
      let user = `Napiš návrh odpovědi poradce klientovi podle této konverzace a CRM kontextu:\n\n${block}`;
      if (options?.variantHint?.trim()) {
        user += `\n\nPožadavek na variantu: zvol jinou formulaci nebo strukturu než typický krátký návrh. ${options.variantHint.trim()}`;
      }
      const input = `${SYSTEM_DRAFT}\n\n---\n\n${user}`;
      const text = await createResponse(input, {
        routing: { category: "advisor_chat" },
        store: false,
      });
      const draft = text.replace(/\r\n/g, "\n").trim();
      if (!draft) throw new Error("Prázdný návrh od modelu.");
      return draft.slice(0, 4_000);
    },
  };
}

let cached: AdvisorChatAiProvider | null = null;

export function getOpenAIAdvisorChatProvider(): AdvisorChatAiProvider {
  if (!cached) cached = createOpenAIAdvisorChatProvider();
  return cached;
}
