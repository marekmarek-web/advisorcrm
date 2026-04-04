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
import type { CanonicalIntent } from "./assistant-domain-model";
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
- create_reminder: připomínka
- search_contacts: hledání kontaktů
- dashboard_summary: shrnutí dashboardu
- general_chat: obecný dotaz
- multi_action: více akcí najednou
- switch_client: přepnutí kontextu na jiného klienta

Poradenský slang → productDomain (mapuj stejně jako interní slovník): životko/životka → zivotni_pojisteni; penzijko/dpsko → dps; dipko → dip; hypoška → hypo; spotřebák → uver; povko → auto (povinné ručení); havko → auto (havarijní).
Dotazy na rating/žebříček/top pojišťovny (read-only, bez zápisu): nastav intentType general_chat, ale productDomain vyplň podle segmentu (např. životní pojištění → zivotni_pojisteni), aby šlo odpovědět z interních top listů.

productDomain: hypo, uver, investice, dip, dps, zivotni_pojisteni, majetek, odpovednost, auto, cestovni, firma_pojisteni, servis, jine

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
meetingDateText / dueDateText: textový fragment termínu.
taskTitle: název úkolu; noteContent: obsah poznámky.
confidence: 0.0-1.0 jak jistý jsi záměrem.`;

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
      { schemaName: "assistant_intent", store: false },
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

/** V2 canonical intent extraction with structured output. */
export async function extractCanonicalIntent(message: string): Promise<CanonicalIntent> {
  const flags = heuristicIntentFlags(message);
  try {
    const { parsed } = await createResponseStructured<Record<string, unknown>>(
      `${CANONICAL_INTENT_SYSTEM}\n\nZpráva uživatele:\n${message}`,
      CANONICAL_INTENT_JSON_SCHEMA,
      { schemaName: "canonical_intent", store: false },
    );
    const raw = coerceCanonicalIntentRaw(parsed);
    const canonical = toCanonicalIntent({
      ...raw,
      switchClient: raw.switchClient || flags.switchClient,
      noEmail: raw.noEmail || flags.noEmail,
    });
    return enrichCanonicalIntentWithPlaybooks(canonical, message);
  } catch {
    const legacy = fallbackIntentFromHeuristics(message, flags);
    return enrichCanonicalIntentWithPlaybooks(legacyIntentToCanonical(legacy), message);
  }
}
