import { createResponseStructured } from "@/lib/openai";
import {
  ASSISTANT_INTENT_JSON_SCHEMA,
  CANONICAL_INTENT_JSON_SCHEMA,
  coerceAssistantIntent,
  coerceCanonicalIntentRaw,
  toCanonicalIntent,
  legacyIntentToCanonical,
  heuristicIntentFlags,
  type AssistantIntent,
  type CanonicalIntentRaw,
} from "./assistant-intent";
import {
  detectProductSubIntent,
  findProductDomainInMessage,
  type CanonicalIntent,
  type CanonicalIntentType,
} from "./assistant-domain-model";
import { enrichCanonicalIntentWithPlaybooks } from "./playbooks";
import { ASSISTANT_PORTAL_CHANNEL_POLICY_TEXT } from "./assistant-portal-channel-policy";

const INTENT_SYSTEM = `Jsi extraktor strukturovaného záměru pro interního asistenta poradce v CRM Aidvisora.
Vrať JSON přesně podle schématu.

Pravidla:
- switchClient nastav na true jen pokud uživatel explicitně chce pracovat s jiným klientem než dosud (např. „přepni klienta", „jiný klient").
- noEmail nastav na true pokud uživatel řekne že email neřeší / neposílat email / bez emailu.
- actions: přidej create_opportunity pokud má vzniknout obchod (případ, pipeline, hypotéka) a create_followup_task pokud má vzniknout úkol nebo follow-up s termínem.
- clientRef: celé jméno nebo část jména klienta ze zprávy, pokud je uvedeno.
- amount: částka v Kč jako číslo (např. 4000000).
- ltv: číslo 0–100.
- bank: zkratka nebo název banky (např. ČS, Česká spořitelna).
- rateGuess: úroková sazba jako desetinné číslo (např. 4.99).
- purpose: stručně účel (koupě, rekonstrukce) pokud je v textu.
- dueDateText: pokud uživatel zmiňuje relativní termín (příští úterý), zkopíruj krátký fragment textu.`;

const CANONICAL_INTENT_SYSTEM = `Jsi extraktor strukturovaného záměru (V2) pro AI asistenta poradce v CRM Aidvisora.
Vrať JSON přesně podle schématu. Záměr uživatele rozpoznej co nejpřesněji.

Typy záměrů:
- create_opportunity: uživatel chce založit nový obchod/případ (hypotéka, investice, pojištění…)
- update_opportunity: aktualizovat existující obchod
- create_task: vytvořit úkol
- create_followup: vytvořit follow-up úkol s termínem
- schedule_meeting: naplánovat schůzku
- create_note / append_note: poznámka ke klientovi
- create_internal_note: interní poznámka (vidí jen tým, doména interní)
- attach_document: připojit dokument
- classify_document: klasifikovat dokument
- request_document_review: označit dokument ke kontrole / spustit review workflow (zápis stavu dokumentu)
- request_client_documents: vyžádat podklady od klienta
- create_client_request: požadavek klienta
- create_material_request: materiálový požadavek
- summarize_client: shrnutí klienta
- prepare_meeting_brief: příprava na schůzku
- prepare_email: připravit email
- draft_portal_message: zpráva klientovi přes portál
- update_portfolio / publish_portfolio_item: portfolio operace
- review_extraction: kontrola extrakce dokumentu (jen čtení / návod; zápis přes schválení níže)
- approve_ai_contract_review: schválit AI kontrolu nahrané smlouvy (review queue)
- apply_ai_review_to_crm: zapsat schválenou AI kontrolu do CRM (po schválení)
- link_ai_review_to_document_vault: propojit soubor z AI kontroly do dokumentů klienta; reviewLinkVisibleToClient=true pokud má být vidět v portálu
- show_document_to_client: zviditelnit existující dokument klientovi v portálu
- attach_document_to_opportunity: připojit dokument k obchodu (potřebuje documentRef + opportunityRef)
- link_document_to_material_request: přiřadit dokument k materiálovému požadavku (materialRequestRef + documentRef)
- notify_client_portal: systémová notifikace klientovi (portalNotificationTitle, volitelně noteContent jako text, portalNotificationType)
- send_portal_message: odeslat zprávu klientovi přes portál (ne jen notifikace)
- update_client_request: upravit existující klientský požadavek (obchod s client_portal_request)
- create_service_case: servisní případ nebo požadavek ke stávající smlouvě (výročí, změna, doplnění, reklamace) — productDomain určuje typ smlouvy (servis, dps, zivotni_pojisteni, …)
- create_contract: založit/evidovat smlouvu klienta do portfolia (ne obchod/případ). Použij pokud uživatel chce „založit smlouvu", „zaevidovat smlouvu/pojistku/penzijko", „přidat do portfolia". Vyplň productDomain (a partnerName/productName pokud zmíněny).
- update_coverage: nastavit stav položky pokrytí produktů (FA grid) — např. „ODP hotovo", „povko jako splněné", „nastav životko na neřeší". Vyplň coverageItemKey (nebo popis v purpose) a coverageStatus: done | in_progress | none | not_relevant | opportunity | waiting_signature (nebo česky: hotovo, neřeší, …).
- create_reminder: připomínka
- search_contacts: hledání kontaktů
- dashboard_summary: shrnutí dashboardu
- general_chat: obecný dotaz
- multi_action: více akcí najednou
- switch_client: přepnutí kontextu na jiného klienta

Poradenský slang → productDomain (mapuj stejně jako interní slovník): životko/životka → zivotni_pojisteni; penzijko/dpsko → dps; dipko → dip; hypoška → hypo; spotřebák → uver; povko → auto (povinné ručení); havko → auto (havarijní); stavebko → stavebni_sporeni; leasing → leasing.
Dotazy na rating/žebříček/top pojišťovny (read-only, bez zápisu): nastav intentType general_chat, ale productDomain vyplň podle segmentu (např. životní pojištění → zivotni_pojisteni), aby šlo odpovědět z interních top listů.

productDomain: hypo, uver, leasing, stavebni_sporeni, investice, dip, dps, zivotni_pojisteni, majetek, odpovednost, auto, cestovni, firma_pojisteni, servis, jine

requestedActions: pole všech záměrů, které uživatel zmínil (mohou být i vícero).

clientRef: jméno/reference klienta; opportunityRef: reference obchodu; documentRef: UUID dokumentu.
reviewRef: UUID položky AI kontroly smlouvy (contract review), pokud uživatel pracuje s konkrétní kontrolou.
materialRequestRef: UUID materiálového požadavku.
reviewLinkVisibleToClient: true pokud má být soubor z kontroly po propojení viditelný klientovi.
portalNotificationTitle / portalNotificationType: pro notify_client_portal (typ: new_message | request_status_change | new_document | important_date | advisor_material_request).

${ASSISTANT_PORTAL_CHANNEL_POLICY_TEXT}

Čísla: amount (Kč), ltv (0-100), rateGuess (sazba jako desetinné číslo, např. 4.5), premium (pojistné).
maturity: splatnost/délka (textově, např. "30 let", "20 let", "5 let").
periodicity: frekvence platby — "měsíčně", "ročně", "jednorázově".
contractNumber: číslo smlouvy, pokud zmíněno.
partnerName: název partnera / pojišťovny / banky / investiční společnosti, pokud zmíněn (např. "Allianz", "UNIQA", "Česká spořitelna").
productName: název produktu / produktové řady, pokud zmíněn (např. "Život & Radost", "FLEXI", "mHypotéka").
coverageItemKey: technický klíč položky pokrytí, pokud ho uživatel zná; jinak popiš v purpose (ODP, POV, životní, DPS…).
coverageStatus: cílový stav pokrytí (done / hotovo, none, not_relevant / neřeší, in_progress, opportunity, waiting_signature).
meetingDateText / dueDateText: textový fragment termínu.
taskTitle: název úkolu; noteContent: obsah poznámky.
confidence: 0.0-1.0 jak jistý jsi záměrem.

Složené požadavky: pokud uživatel chce více věcí najednou (např. schůzka + smlouva), vyplň multi_action nebo několik položek v requestedActions v rozumném pořadí (závislosti řeší plánovač).
Negace / zrušení: „zruš“, „nechci“, „nevytvářej“, „stop“ — bez jasného cíle zápisu použij general_chat nebo příslušný negovaný záměr bez write akcí, které by šly proti záměru.
Kontextové odkazy („ten klient“, „ten obchod“, „to co jsme řešili“): vyčti z horního bloku historie v uživatelské zprávě (pokud je přítomen) a doplň targetClient / opportunityRef podle obsahu.
Obrázky / doklady / screenshoty: pokud uživatel chce zapsat údaje z fotky, založit klienta z dokladu, přiřadit data ke kontaktu nebo připojit snímek — vyplň clientRef z textu (i když v UI není otevřená karta), zvol vhodný intent (např. create_contact, prepare_email, attach_document, create_note) a requiresConfirmation podle rizikovosti; u neurčitého záměru general_chat.`;

const CANONICAL_INTENT_PROMPT_VARIANT_B = `
Režim promptu B (experimentální): upřednostni rozdělení složených vět do více requestedActions; u negace vrať bezpečně general_chat pokud není explicitní cíl zápisu; kontextové zájmena vyřeš z bloku historie nad oddělovačem ---.`;

const CLIENT_NAME_RE =
  /(?:klient(?:ka)?\s+)?([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)(?=\s+(?:chce|má|potřebuje|resi|řeší|vytvoř|založ|pošli|udělej|dej)\b|[,.]|$)/u;

function extractClientNameRef(message: string): string | null {
  const m = message.match(CLIENT_NAME_RE);
  return m ? `${m[1]} ${m[2]}` : null;
}

function extractAmountValue(message: string): number | null {
  const m = message.match(/(\d[\d\s]{0,15})\s*(?:Kč|kč)?/);
  if (!m) return null;
  const digits = m[1].replace(/\s/g, "");
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function extractRateGuessValue(message: string): number | null {
  const m = message.match(/(\d+[.,]\d+)\s*%/);
  return m ? Number.parseFloat(m[1].replace(",", ".")) : null;
}

function extractMaturityValue(message: string): string | null {
  const m = message.match(/\bna\s+(\d+\s*let)\b/i);
  return m?.[1] ?? null;
}

function extractTaskDateText(message: string): string | null {
  const patterns = [
    /\b(v\s+pondělí)\b/i,
    /\b(v\s+úterý)\b/i,
    /\b(ve\s+středu)\b/i,
    /\b(ve\s+čtvrtek)\b/i,
    /\b(v\s+pátek)\b/i,
    /\b(o\s+víkendu)\b/i,
    /\b(příští\s+\w+)\b/i,
    /\b(zítra)\b/i,
    /\b(dnes)\b/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function detectRequestedActions(message: string): CanonicalIntentType[] {
  const lower = message.toLowerCase();
  const out: CanonicalIntentType[] = [];
  const add = (a: CanonicalIntentType) => {
    if (!out.includes(a)) out.push(a);
  };

  const mentionsDeal =
    lower.includes("vytvoř obchod") ||
    lower.includes("vytvor obchod") ||
    lower.includes("vytvoř mi obchod") ||
    lower.includes("založ obchod") ||
    lower.includes("zaloz obchod") ||
    lower.includes("dej to do obchodů") ||
    lower.includes("dej to do obchodu") ||
    lower.includes("do obchodů") ||
    lower.includes("do obchodu") ||
    lower.includes("do pipeline") ||
    lower.includes("do boardu");
  const mentionsCreateVerb =
    lower.includes("vytvoř") ||
    lower.includes("vytvor") ||
    lower.includes("založ") ||
    lower.includes("zaloz") ||
    lower.includes("udělej") ||
    lower.includes("udelej") ||
    lower.includes("dej ");
  const mentionsProductContext =
    lower.includes("hypot") ||
    lower.includes("investic") ||
    lower.includes("životk") ||
    lower.includes("zivotk") ||
    lower.includes("penzijk") ||
    lower.includes("dipk") ||
    lower.includes("spotřebák") ||
    lower.includes("spotrebak") ||
    lower.includes("povko") ||
    lower.includes("havko") ||
    lower.includes("majetek") ||
    lower.includes("odpovědk") ||
    lower.includes("odpovedk") ||
    lower.includes("smlouv");
  if (mentionsDeal || (mentionsCreateVerb && mentionsProductContext)) {
    add("create_opportunity");
  }
  if (/\b(úkol|follow-up|follow up|připomínk|udělej úkol|vytvoř úkol|vytvoř follow-up|vytvoř follow up)\b/i.test(lower)) {
    add(/\bfollow-up|follow up|followup\b/i.test(lower) ? "create_followup" : "create_task");
  }
  if (/\b(naplánuj schůzku|naplánuj setkání|schůzku|schuzku)\b/i.test(lower)) add("schedule_meeting");
  if (/\b(interní poznámku|interni poznamku|interní poznámka|interni poznamka)\b/i.test(lower)) add("create_internal_note");
  if (/\b(zápisek|zapisek|poznámku|poznámka|poznamku|poznamka)\b/i.test(lower) && !out.includes("create_internal_note")) add("create_note");
  if (/\b(pošli klientovi požadavek|pošli požadavek na občanku|posli pozadavek na obcanku|požadavek na občanku|pozadavek na obcanku)\b/i.test(lower)) {
    add("create_client_request");
  }
  if (/\b(vyžádej podklady|vyzadej podklady|požadavek na podklady)\b/i.test(lower)) {
    add("request_client_documents");
  }
  if (/\b(portálovou zprávu|portalovou zpravu|pošli zprávu přes portál|odeslat zprávu přes portál)\b/i.test(lower)) {
    add("send_portal_message");
  }
  if (/\b(založ smlouvu|zaloz smlouvu|zapiš smlouvu|zapis smlouvu|zaeviduj smlouvu|přidej do portfolia|pridej do portfolia)\b/i.test(lower)) {
    add("create_contract");
  }
  if (/\b(pokrytí|pokryti|krytí|kryti)\b/i.test(lower)) add("update_coverage");

  return out;
}

function inferPrimaryIntentType(actions: CanonicalIntentType[]): CanonicalIntentType {
  if (actions.length === 0) return "general_chat";
  if (actions.length === 1) return actions[0]!;
  return "multi_action";
}

function normalizeCanonicalIntentFromMessage(
  message: string,
  canonical: CanonicalIntent,
): CanonicalIntent {
  const detectedDomain = findProductDomainInMessage(message);
  const detectedSubIntent = detectProductSubIntent(message);
  const explicitClientRef = extractClientNameRef(message);
  const requestedActions = canonical.requestedActions.length > 0
    ? [...canonical.requestedActions]
    : [];

  for (const action of detectRequestedActions(message)) {
    if (!requestedActions.includes(action)) requestedActions.push(action);
  }
  if (requestedActions.length > 1) {
    const idx = requestedActions.indexOf("general_chat");
    if (idx >= 0) requestedActions.splice(idx, 1);
  }

  const intentType =
    canonical.intentType === "general_chat" && requestedActions.length > 0
      ? inferPrimaryIntentType(requestedActions)
      : canonical.intentType === "multi_action" && requestedActions.length === 1
        ? requestedActions[0]!
        : canonical.intentType;

  const productDomain = canonical.productDomain ?? detectedDomain;
  const targetClient = canonical.targetClient ?? (explicitClientRef
    ? { ref: explicitClientRef, resolved: false }
    : null);

  const extractedFacts = [...canonical.extractedFacts];
  const upsertFact = (key: string, value: string | number | boolean | null) => {
    if (value == null || value === "") return;
    if (extractedFacts.some((f) => f.key === key)) return;
    extractedFacts.push({ key, value, source: "user_text" });
  };

  upsertFact("amount", extractAmountValue(message));
  upsertFact("rateGuess", extractRateGuessValue(message));
  if (!extractedFacts.some((f) => f.key === "interestRate")) {
    const rg = extractRateGuessValue(message);
    if (rg != null) upsertFact("interestRate", `${String(rg).replace(".", ",")} %`);
  }
  upsertFact("maturity", extractMaturityValue(message));
  upsertFact("dueDateText", extractTaskDateText(message));
  if (/\bměsíčně|mesicne|měsíčně do fondu|mesicne do fondu/i.test(message)) {
    upsertFact("periodicity", "měsíčně");
  }
  if (/\bobčank|obcank/i.test(message)) {
    upsertFact("taskTitle", "Požadavek na občanský průkaz");
  }
  if (/raiff|raiffeisen/i.test(message) && !extractedFacts.some((f) => f.key === "bank")) {
    upsertFact("bank", "Raiffeisenbank");
  }
  if (/atris/i.test(message) && !extractedFacts.some((f) => f.key === "productName")) {
    upsertFact("productName", "ATRIS");
  }

  const switchClient =
    canonical.switchClient ||
    (!!canonical.targetClient?.ref && /^(jiný|dalsi|další)\s+klient\b/i.test(message)) ||
    /\b(přepni klienta|prepni klienta|teď klient|ted klient)\b/i.test(message);

  return {
    ...canonical,
    intentType: inferPrimaryIntentType(requestedActions.length > 0 ? requestedActions : [intentType]),
    requestedActions: requestedActions.length > 0 ? requestedActions : [intentType],
    productDomain,
    subIntent: canonical.subIntent ?? detectedSubIntent,
    targetClient,
    extractedFacts,
    switchClient,
  };
}

function fallbackIntentFromHeuristics(
  message: string,
  flags: { switchClient: boolean; noEmail: boolean },
): AssistantIntent {
  const lower = message.toLowerCase();
  const wantsMortgageFlow =
    (/hypoték|obchod|pipeline|případ|opportunit/i.test(message) || /vytvoř|založ|zaeviduj/i.test(lower)) &&
    (/follow|úkol|follow-up|příští\s+úter/i.test(lower) || /follow-up/i.test(message)) &&
    // avoid triggering mortgage flow for non-mortgage domains (servis, penze, investice, pojištění…)
    !/servis|výročí|penzijní|investiční|pojišt|cestovní|firemní/i.test(lower);
  const nameMatch = message.match(
    /([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+)/u,
  );
  const amountMatch = message.match(/(\d[\d\s]*)\s*(?:000|Kč|kč)/);
  const ltvMatch = message.match(/ltv\s*(\d{1,3})\s*%?/i);
  const rateMatch = message.match(/(\d+[.,]\d+)\s*%/);
  const bankMatch = message.match(/\b(ČS|ČSOB|KB|MONETA|UniCredit|Air\s*Bank)\b/i);

  let amount: number | null = null;
  if (amountMatch) {
    const digits = amountMatch[1].replace(/\s/g, "");
    amount = parseInt(digits, 10);
    if (/000/.test(message) && amount < 1000) amount = amount * 1000;
  }

  return {
    actions: wantsMortgageFlow ? ["create_opportunity", "create_followup_task"] : ["general_chat"],
    switchClient: flags.switchClient,
    clientRef: nameMatch ? `${nameMatch[1]} ${nameMatch[2]}` : null,
    amount,
    ltv: ltvMatch ? parseInt(ltvMatch[1], 10) : null,
    purpose: /koupě|rekonstrukce|byt/i.test(message) ? "koupě bytu + rekonstrukce" : null,
    bank: bankMatch ? bankMatch[1].replace(/\s+/g, " ") : null,
    rateGuess: rateMatch ? parseFloat(rateMatch[1].replace(",", ".")) : null,
    noEmail: flags.noEmail,
    dueDateText: /příští\s+úter/i.test(message) ? "příští úterý" : null,
  };
}

/** Legacy extraction — kept for backward compatibility. */
export async function extractAssistantIntent(message: string): Promise<AssistantIntent> {
  const flags = heuristicIntentFlags(message);
  try {
    const { parsed } = await createResponseStructured<Record<string, unknown>>(
      `${INTENT_SYSTEM}\n\nZpráva uživatele:\n${message}`,
      ASSISTANT_INTENT_JSON_SCHEMA,
      { schemaName: "assistant_intent", store: false, routing: { category: "advisor_intent", maxOutputTokens: 500 } },
    );
    const base = coerceAssistantIntent(parsed);
    return {
      ...base,
      switchClient: Boolean(base.switchClient || flags.switchClient),
      noEmail: Boolean(base.noEmail || flags.noEmail),
    };
  } catch {
    return fallbackIntentFromHeuristics(message, flags);
  }
}

export type ExtractCanonicalIntentOptions = {
  /** Prepended to the user message for the model only (DB / confirmation heuristics use raw message). */
  historyPrefix?: string;
  recentMessages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  resolvedContextBlock?: string;
};

function buildStructuredRecentHistory(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }> | undefined,
): string {
  if (!messages || messages.length === 0) return "";
  const lines = messages
    .filter((m) => m.content.trim().length > 0)
    .slice(-8)
    .map((m) => `${m.role === "assistant" ? "Asistent" : m.role === "system" ? "Systém" : "Uživatel"}: ${m.content.trim().replace(/\s+/g, " ").slice(0, 240)}`);
  return lines.length > 0 ? `[Poslední relevantní tahy]\n${lines.join("\n")}` : "";
}

/** V2 canonical intent extraction with structured output. */
export async function extractCanonicalIntent(
  message: string,
  options?: ExtractCanonicalIntentOptions,
): Promise<CanonicalIntent> {
  const rawUserMessage = message;
  const composed = [
    options?.resolvedContextBlock?.trim() ? options.resolvedContextBlock.trim() : "",
    buildStructuredRecentHistory(options?.recentMessages),
    options?.historyPrefix?.trim() ? options.historyPrefix.trim() : "",
    message,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
  const flags = heuristicIntentFlags(rawUserMessage);
  const variantB = process.env.ASSISTANT_CANONICAL_INTENT_PROMPT_VARIANT === "b";
  const systemBlock = `${CANONICAL_INTENT_SYSTEM}${variantB ? CANONICAL_INTENT_PROMPT_VARIANT_B : ""}`;
  try {
    const { parsed } = await createResponseStructured<Record<string, unknown>>(
      `${systemBlock}\n\nZpráva uživatele:\n${composed}`,
      CANONICAL_INTENT_JSON_SCHEMA,
      { schemaName: "canonical_intent", store: false, routing: { category: "advisor_intent", maxOutputTokens: 700 } },
    );
    const raw = coerceCanonicalIntentRaw(parsed);
    const canonical = toCanonicalIntent({
      ...raw,
      switchClient: raw.switchClient || flags.switchClient,
      noEmail: raw.noEmail || flags.noEmail,
    });
    return enrichCanonicalIntentWithPlaybooks(
      normalizeCanonicalIntentFromMessage(rawUserMessage, canonical),
      rawUserMessage,
    );
  } catch {
    const legacy = fallbackIntentFromHeuristics(rawUserMessage, flags);
    return enrichCanonicalIntentWithPlaybooks(
      normalizeCanonicalIntentFromMessage(rawUserMessage, legacyIntentToCanonical(legacy)),
      rawUserMessage,
    );
  }
}
