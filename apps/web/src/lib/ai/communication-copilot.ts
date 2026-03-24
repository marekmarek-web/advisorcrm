/**
 * Communication copilot (Plan 5C.1).
 * Generates grounded drafts for various communication types.
 * Uses LLM with deterministic template fallback.
 */

export type CommunicationDraftType =
  | "request_missing_data_email"
  | "followup_after_upload"
  | "followup_after_review"
  | "payment_instruction_summary_email"
  | "client_reminder_email"
  | "contract_status_update_email"
  | "internal_advisor_note"
  | "internal_manager_summary";

export type DraftStatus = "draft" | "edited" | "approved" | "rejected" | "archived";

export type CommunicationDraft = {
  draftId: string;
  type: CommunicationDraftType;
  subject: string;
  body: string;
  tone: string;
  purpose: string;
  referencedEntities: { type: string; id: string }[];
  actionIntent?: string;
  warnings: string[];
  requiresHumanApproval: boolean;
  status: DraftStatus;
};

export type DraftContext = {
  tenantId: string;
  contactId?: string;
  clientName?: string;
  clientEmail?: string;
  reviewId?: string;
  reviewFileName?: string;
  reviewStatus?: string;
  missingFields?: string[];
  paymentWarnings?: string[];
  applyReadiness?: string;
  blockedReasons?: string[];
  advisorName?: string;
  extraContext?: string;
};

function generateDraftId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const TEMPLATES: Record<CommunicationDraftType, (ctx: DraftContext) => { subject: string; body: string; tone: string; purpose: string }> = {
  request_missing_data_email: (ctx) => ({
    subject: `Doplnění údajů – ${ctx.clientName ?? "klient"}`,
    body: `Dobrý den,\n\npo zpracování Vašeho dokumentu${ctx.reviewFileName ? ` (${ctx.reviewFileName})` : ""} jsme zjistili, že nám chybí některé údaje${ctx.missingFields?.length ? `: ${ctx.missingFields.join(", ")}` : ""}.\n\nProsíme o jejich doplnění.\n\nS pozdravem\n${ctx.advisorName ?? "Váš poradce"}`,
    tone: "formal",
    purpose: "Vyžádání chybějících dat od klienta.",
  }),
  followup_after_upload: (ctx) => ({
    subject: `Potvrzení přijetí dokumentu – ${ctx.clientName ?? "klient"}`,
    body: `Dobrý den,\n\nobdrželi jsme Váš dokument${ctx.reviewFileName ? ` (${ctx.reviewFileName})` : ""} a nyní jej zpracováváme. Budeme vás informovat o dalším postupu.\n\nS pozdravem\n${ctx.advisorName ?? "Váš poradce"}`,
    tone: "friendly",
    purpose: "Potvrzení přijetí nahraného dokumentu.",
  }),
  followup_after_review: (ctx) => ({
    subject: `Výsledek kontroly dokumentu – ${ctx.clientName ?? "klient"}`,
    body: `Dobrý den,\n\ndokončili jsme kontrolu Vašeho dokumentu${ctx.reviewFileName ? ` (${ctx.reviewFileName})` : ""}. Status: ${ctx.reviewStatus ?? "zpracováno"}.${ctx.blockedReasons?.length ? `\n\nPozor: ${ctx.blockedReasons.join(", ")}.` : ""}\n\nV případě dotazů jsem k dispozici.\n\nS pozdravem\n${ctx.advisorName ?? "Váš poradce"}`,
    tone: "professional",
    purpose: "Informování klienta o výsledku review.",
  }),
  payment_instruction_summary_email: (ctx) => ({
    subject: `Platební instrukce – ${ctx.clientName ?? "klient"}`,
    body: `Dobrý den,\n\nzasílám souhrn platebních instrukcí z Vaší smlouvy.${ctx.paymentWarnings?.length ? `\n\nUpozornění: ${ctx.paymentWarnings.join("; ")}.` : ""}\n\nProsím o kontrolu a potvrzení.\n\nS pozdravem\n${ctx.advisorName ?? "Váš poradce"}`,
    tone: "formal",
    purpose: "Odeslání platebních instrukcí klientovi.",
  }),
  client_reminder_email: (ctx) => ({
    subject: `Připomenutí – ${ctx.clientName ?? "klient"}`,
    body: `Dobrý den,\n\ndovolujeme si Vám připomenout${ctx.extraContext ? ` ${ctx.extraContext}` : " blížící se termín"}.\n\nV případě dotazů mě neváhejte kontaktovat.\n\nS pozdravem\n${ctx.advisorName ?? "Váš poradce"}`,
    tone: "friendly",
    purpose: "Připomenutí klientovi.",
  }),
  contract_status_update_email: (ctx) => ({
    subject: `Status smlouvy – ${ctx.clientName ?? "klient"}`,
    body: `Dobrý den,\n\ninformuji Vás o aktuálním stavu Vaší smlouvy${ctx.reviewFileName ? ` (${ctx.reviewFileName})` : ""}.\n\nStav: ${ctx.applyReadiness ?? ctx.reviewStatus ?? "v řešení"}.${ctx.blockedReasons?.length ? `\nPozor: ${ctx.blockedReasons.join(", ")}.` : ""}\n\nS pozdravem\n${ctx.advisorName ?? "Váš poradce"}`,
    tone: "professional",
    purpose: "Aktualizace stavu smlouvy pro klienta.",
  }),
  internal_advisor_note: (ctx) => ({
    subject: `Interní poznámka – ${ctx.clientName ?? "klient"}`,
    body: `Poznámka k ${ctx.clientName ?? "klientovi"}:\n\n${ctx.extraContext ?? "Viz detail review a platební nastavení."}\n\nStav review: ${ctx.reviewStatus ?? "N/A"}\nApply readiness: ${ctx.applyReadiness ?? "N/A"}`,
    tone: "internal",
    purpose: "Interní poznámka poradce.",
  }),
  internal_manager_summary: (ctx) => ({
    subject: `Souhrn pro manažera – ${ctx.clientName ?? "tým"}`,
    body: `Souhrn:\n\nKlient: ${ctx.clientName ?? "N/A"}\nReview: ${ctx.reviewStatus ?? "N/A"}\nApply readiness: ${ctx.applyReadiness ?? "N/A"}\n${ctx.blockedReasons?.length ? `Blokováno: ${ctx.blockedReasons.join(", ")}` : "Bez blokace"}${ctx.paymentWarnings?.length ? `\nPlatební upozornění: ${ctx.paymentWarnings.join("; ")}` : ""}`,
    tone: "summary",
    purpose: "Manažerský souhrn o stavu klienta/smlouvy.",
  }),
};

export async function generateCommunicationDraft(
  type: CommunicationDraftType,
  ctx: DraftContext,
): Promise<CommunicationDraft> {
  const template = TEMPLATES[type](ctx);
  let subject = template.subject;
  let body = template.body;

  try {
    const { createResponseSafe } = await import("@/lib/openai");
    const prompt = [
      `Vygeneruj ${type === "internal_advisor_note" || type === "internal_manager_summary" ? "interní poznámku" : "email"} typu "${type}".`,
      `Tón: ${template.tone}. Účel: ${template.purpose}.`,
      `Klient: ${ctx.clientName ?? "neuvedeno"}.`,
      ctx.reviewFileName ? `Dokument: ${ctx.reviewFileName}.` : "",
      ctx.missingFields?.length ? `Chybějící pole: ${ctx.missingFields.join(", ")}.` : "",
      ctx.paymentWarnings?.length ? `Platební upozornění: ${ctx.paymentWarnings.join("; ")}.` : "",
      ctx.blockedReasons?.length ? `Blokace: ${ctx.blockedReasons.join(", ")}.` : "",
      ctx.extraContext ? `Další kontext: ${ctx.extraContext}` : "",
      "\nOdpověz ve formátu:\nSubject: ...\nBody: ...",
      "\nPiš v češtině, stručně, profesionálně.",
    ].filter(Boolean).join("\n");

    const result = await createResponseSafe(prompt);
    if (result.ok && result.text) {
      const text = result.text.trim();
      const subjectMatch = text.match(/Subject:\s*(.+)/i);
      const bodyMatch = text.match(/Body:\s*([\s\S]+)/i);
      if (subjectMatch) subject = subjectMatch[1].trim();
      if (bodyMatch) body = bodyMatch[1].trim();
    }
  } catch {
    // LLM unavailable, use template fallback
  }

  return {
    draftId: generateDraftId(),
    type,
    subject,
    body,
    tone: template.tone,
    purpose: template.purpose,
    referencedEntities: [
      ...(ctx.contactId ? [{ type: "client", id: ctx.contactId }] : []),
      ...(ctx.reviewId ? [{ type: "review", id: ctx.reviewId }] : []),
    ],
    actionIntent: type,
    warnings: [],
    requiresHumanApproval: true,
    status: "draft",
  };
}
