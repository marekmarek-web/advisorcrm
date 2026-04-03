/**
 * Phase 2E: golden scenarios for assistant eval harness.
 * Covers: mortgage, investment, insurance, documents, client portal, safety.
 */

import type { GoldenScenario } from "../assistant-eval-types";

export const goldenScenarios: GoldenScenario[] = [
  // ─── MORTGAGE ───────────────────────────────────────────────
  {
    id: "mortgage-new-deal",
    domain: "mortgage",
    name: "Nový hypoteční obchod se follow-upem",
    description: "Poradce chce založit hypotéku a naplánovat follow-up úkol pro klienta.",
    turns: [
      { role: "user", content: "Založ hypotéku pro Jana Nováka, follow-up za týden." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "hypo",
      requiresConfirmation: false,
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 3,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["mortgage", "write", "follow-up"],
  },
  {
    id: "mortgage-refinance-existing",
    domain: "mortgage",
    name: "Refinancování stávající hypotéky",
    description: "Klient chce refinancovat fixaci — poradce vytváří nový obchod.",
    turns: [
      { role: "user", content: "Klient Petra Dvořáková chce refinancovat hypotéku, fixace končí za 2 měsíce." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "hypo",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 3,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["mortgage", "refinance"],
  },

  // ─── INVESTMENT ─────────────────────────────────────────────
  {
    id: "investment-dip-setup",
    domain: "investment",
    name: "Založení DIP pro klienta",
    description: "Poradce zakládá investiční případ DIP.",
    turns: [
      { role: "user", content: "Vytvoř investiční obchod DIP pro Karla Svobodu." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "dip",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["investment", "dip"],
  },
  {
    id: "investment-dps-rebalance",
    domain: "investment",
    name: "DPS servisní případ (legacy)",
    description: "Poradce zakládá servisní případ pro přehodnocení penze — nově mapuje na createServiceCase.",
    turns: [
      { role: "user", content: "Založ servisní případ pro DPS u Lukáše Černého — chce změnu strategie." },
    ],
    expectedIntent: {
      intentType: "create_service_case",
      productDomain: "dps",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createServiceCase"],
      expectedContactIdPresent: true,
    },
    tags: ["investment", "dps", "service", "3c"],
  },

  // ─── INSURANCE ──────────────────────────────────────────────
  {
    id: "insurance-life-opportunity",
    domain: "insurance",
    name: "Životní pojištění — nový obchod",
    description: "Poradce vytváří obchod na životní pojištění.",
    turns: [
      { role: "user", content: "Založ obchod na životní pojištění pro Marii Procházkovou." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "zivotni_pojisteni",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["insurance", "life"],
  },
  {
    id: "insurance-property-task",
    domain: "insurance",
    name: "Pojištění majetku — follow-up úkol",
    description: "Poradce plánuje follow-up pro majetkové pojištění.",
    turns: [
      { role: "user", content: "Naplánuj úkol na kontrolu majetkového pojištění u Tomáše Krejčího na příští týden." },
    ],
    expectedIntent: {
      intentType: "create_task",
      productDomain: "majetek",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["createTask"],
      expectedContactIdPresent: true,
    },
    tags: ["insurance", "property", "task"],
  },

  // ─── DOCUMENTS ──────────────────────────────────────────────
  {
    id: "document-classify-and-show",
    domain: "documents",
    name: "Klasifikace dokumentu a zobrazení klientovi",
    description: "Multi-action: klasifikovat dokument a zpřístupnit v portálu.",
    turns: [
      { role: "user", content: "Klasifikuj dokument jako hypotéku a zpřístupni ho klientovi." },
    ],
    expectedIntent: {
      intentType: "multi_action",
    },
    expectedPlan: {
      minSteps: 2,
      maxSteps: 3,
      expectedActions: ["classifyDocument", "setDocumentVisibleToClient"],
      expectedContactIdPresent: true,
    },
    tags: ["documents", "multi-action"],
  },
  {
    id: "document-approve-review",
    domain: "documents",
    name: "Schválení AI review smlouvy",
    description: "Poradce schválí AI kontrolu a aplikuje do CRM.",
    turns: [
      { role: "user", content: "Schval AI kontrolu smlouvy a aplikuj výsledky do CRM." },
    ],
    expectedIntent: {
      intentType: "multi_action",
    },
    expectedPlan: {
      minSteps: 2,
      maxSteps: 3,
      expectedActions: ["approveAiContractReview", "applyAiContractReviewToCrm"],
    },
    tags: ["documents", "review", "high-risk"],
  },

  // ─── CLIENT PORTAL ──────────────────────────────────────────
  {
    id: "portal-notification",
    domain: "client_portal",
    name: "Upozornění klientovi v portálu",
    description: "Poradce posílá notifikaci klientovi přes portál.",
    turns: [
      { role: "user", content: "Pošli Novákovi upozornění, že je připravený návrh smlouvy." },
    ],
    expectedIntent: {
      intentType: "notify_client_portal",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["createClientPortalNotification"],
      expectedContactIdPresent: true,
    },
    tags: ["portal", "notification"],
  },
  {
    id: "portal-material-request",
    domain: "client_portal",
    name: "Vyžádání podkladů od klienta",
    description: "Poradce žádá klienta o dodání dokumentů přes portál.",
    turns: [
      { role: "user", content: "Vyžádej od Petra Dvořáka potvrzení příjmu a výpis z katastru." },
    ],
    expectedIntent: {
      intentType: "create_material_request",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createMaterialRequest"],
      expectedContactIdPresent: true,
    },
    tags: ["portal", "material-request"],
  },

  // ─── PHASE 3C: PRODUCT WORKFLOWS ────────────────────────────

  {
    id: "service-case-servis",
    domain: "safety",
    name: "Servisní případ pro stávající smlouvu",
    description: "Poradce zakládá servisní případ pro změnu existující smlouvy.",
    turns: [
      { role: "user", content: "Založ servisní případ pro Petra Nováka — chce změnit smlouvu na výročí." },
    ],
    expectedIntent: {
      intentType: "create_service_case",
      productDomain: "servis",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createServiceCase"],
      expectedContactIdPresent: true,
    },
    tags: ["service", "servis", "3c"],
  },
  {
    id: "service-case-without-description",
    domain: "safety",
    name: "Servisní případ bez popisu — draft stav",
    description: "Servisní případ bez subject/description zůstane ve stavu draft.",
    turns: [
      { role: "user", content: "Založ servisní případ pro Petra Nováka." },
    ],
    expectedIntent: {
      intentType: "create_service_case",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createServiceCase"],
      expectedContactIdPresent: true,
      expectedStatus: "draft",
    },
    tags: ["service", "3c", "missing-fields"],
  },
  {
    id: "investment-general",
    domain: "investment",
    name: "Obecná investice (ne DIP/DPS)",
    description: "Poradce zakládá investiční obchod bez specifického produktu.",
    turns: [
      { role: "user", content: "Vytvoř investiční obchod pro Janu Horáčkovou — chce ETF portfolio." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "investice",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["investment", "etf", "3c"],
  },
  {
    id: "firma-pojisteni-opportunity",
    domain: "insurance",
    name: "Firemní pojištění — nový obchod",
    description: "Poradce zakládá obchod na firemní pojištění.",
    turns: [
      { role: "user", content: "Založ obchod na firemní pojištění pro Petra Marka — provoz s.r.o." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "firma_pojisteni",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["insurance", "firma", "3c"],
  },
  {
    id: "auto-pojisteni-opportunity",
    domain: "insurance",
    name: "Autopojištění — nový obchod",
    description: "Poradce zakládá obchod na povinné ručení nebo havarijní pojištění.",
    turns: [
      { role: "user", content: "Založ obchod havarijní pojištění pro Tomáše Beneše." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "auto",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["insurance", "auto", "3c"],
  },
  {
    id: "servis-dps-service-case",
    domain: "investment",
    name: "DPS servisní případ s popisem",
    description: "Servisní případ pro DPS mapuje na createServiceCase. Status závisí na přítomnosti popisu.",
    turns: [
      { role: "user", content: "Založ servisní případ pro DPS u Lukáše Černého — chce změnu strategie portfolia." },
    ],
    expectedIntent: {
      intentType: "create_service_case",
      productDomain: "dps",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createServiceCase"],
      expectedContactIdPresent: true,
    },
    tags: ["investment", "dps", "service", "3c"],
  },

  // ─── PHASE 3G: PLAYBOOK SPLIT + MATERIAL REQUEST ────────────

  {
    id: "dip-opportunity",
    domain: "investment",
    name: "DIP — investiční produkt (odlišný od DPS)",
    description: "Poradce zakládá DIP obchod; playbook dip_dps se musí lišit od obecné investice.",
    turns: [
      { role: "user", content: "Založ DIP pro Jana Nováka — chce daňový odpočet." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "dip",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["investment", "dip", "3g"],
  },
  {
    id: "dps-service-case-revize",
    domain: "investment",
    name: "DPS — servisní případ pro revizi strategie",
    description: "DPS servisní případ; playbook dip_dps se aplikuje i pro create_service_case.",
    turns: [
      { role: "user", content: "Založ servisní případ pro DPS u Lukáše Černého — revize investiční strategie." },
    ],
    expectedIntent: {
      intentType: "create_service_case",
      productDomain: "dps",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createServiceCase"],
      expectedContactIdPresent: true,
    },
    tags: ["investment", "dps", "service", "3g"],
  },
  {
    id: "material-request-kataster",
    domain: "client_portal",
    name: "Vyžádání výpisu z katastru — material request playbook",
    description: "create_material_request s konkrétním dokumentem; playbook material_request se musí aktivovat.",
    turns: [
      { role: "user", content: "Vyžádej od Petra Dvořáka výpis z katastru a potvrzení příjmu pro hypotéku." },
    ],
    expectedIntent: {
      intentType: "create_material_request",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createMaterialRequest"],
      expectedContactIdPresent: true,
    },
    tags: ["material-request", "portal", "3g"],
  },

  // ─── PHASE 3F: CLIENT REQUESTS ──────────────────────────────

  {
    id: "client-request-create-with-subject",
    domain: "client_portal",
    name: "Vytvoření klientského požadavku s předmětem",
    description: "Poradce vytváří client_portal_request pro klienta s předmětem.",
    turns: [
      { role: "user", content: "Vytvoř klientský požadavek pro Nováka — žádost o změnu kontaktních údajů." },
    ],
    expectedIntent: {
      intentType: "create_client_request",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createClientRequest"],
      expectedContactIdPresent: true,
    },
    tags: ["portal", "client-request", "3f"],
  },

  // ─── PHASE 3I: WRITE WORKFLOW COVERAGE ────────────────────────

  {
    id: "ww-create-followup",
    domain: "write_workflows",
    name: "Samostatný follow-up (ne úkol)",
    description: "Poradce zakládá follow-up pro existující obchod.",
    turns: [
      { role: "user", content: "Založ follow-up pro Nováka — zavolat za týden ohledně hypotéky." },
    ],
    expectedIntent: {
      intentType: "create_followup",
      productDomain: "hypo",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createFollowUp"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["write_workflows", "follow-up", "3i"],
  },
  {
    id: "ww-schedule-calendar",
    domain: "write_workflows",
    name: "Naplánování schůzky v kalendáři",
    description: "Poradce zakládá schůzku přes asistenta; bez vyplněného data/slotu zůstane plán ve stavu draft.",
    turns: [
      { role: "user", content: "Naplánuj schůzku s Petrou Dvořákovou na čtvrtek 14:00 — revize portfolia." },
    ],
    expectedIntent: {
      intentType: "schedule_meeting",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["scheduleCalendarEvent"],
      expectedContactIdPresent: true,
      expectedStatus: "draft",
    },
    tags: ["write_workflows", "calendar", "3i"],
  },
  {
    id: "ww-create-meeting-note",
    domain: "write_workflows",
    name: "Vytvoření poznámky ze schůzky",
    description: "Poradce vytváří záznam ze schůzky.",
    turns: [
      { role: "user", content: "Vytvoř poznámku ze schůzky s Novákem — probrali jsme refinancování fixace." },
    ],
    expectedIntent: {
      intentType: "create_note",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["createMeetingNote"],
      expectedContactIdPresent: true,
    },
    tags: ["write_workflows", "notes", "3i"],
  },
  {
    id: "ww-create-internal-note",
    domain: "write_workflows",
    name: "Interní poznámka ke klientovi",
    description: "Poradce vytváří interní poznámku, ne poznámku ze schůzky.",
    turns: [
      { role: "user", content: "Zapiš si interní poznámku: Novák zmínil zájem o DIP." },
    ],
    expectedIntent: {
      intentType: "create_internal_note",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["createInternalNote"],
      expectedContactIdPresent: true,
    },
    tags: ["write_workflows", "internal-note", "3i"],
  },
  {
    id: "ww-document-attach-to-client",
    domain: "write_workflows",
    name: "Přiřazení dokumentu ke klientovi",
    description: "Poradce přiřazuje existující dokument konkrétnímu klientovi.",
    turns: [
      { role: "user", content: "Přiřaď dokument ke klientovi Novákovi." },
    ],
    expectedIntent: {
      intentType: "attach_document",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["attachDocumentToClient"],
      expectedContactIdPresent: true,
    },
    tags: ["write_workflows", "document-attach", "3i"],
  },
  {
    id: "ww-trigger-document-review",
    domain: "write_workflows",
    name: "Spuštění AI review dokumentu",
    description: "Poradce požaduje AI kontrolu nahraného dokumentu.",
    turns: [
      { role: "user", content: "Spusť AI kontrolu smlouvy." },
    ],
    expectedIntent: {
      intentType: "request_document_review",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["triggerDocumentReview"],
    },
    tags: ["write_workflows", "document-review", "3i"],
  },
  {
    id: "ww-multi-opportunity-task-note",
    domain: "write_workflows",
    name: "Multi-action: obchod + úkol + poznámka",
    description: "Poradce zakládá obchod, plánuje follow-up úkol a přidává poznámku v jednom kroku.",
    turns: [
      { role: "user", content: "Založ hypotéku pro Nováka, naplánuj úkol na příští týden a zapiš poznámku z dnešní schůzky." },
    ],
    expectedIntent: {
      intentType: "multi_action",
      productDomain: "hypo",
    },
    expectedPlan: {
      minSteps: 2,
      maxSteps: 4,
      expectedActions: ["createOpportunity", "createTask"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["write_workflows", "multi-action", "3i"],
  },
  {
    id: "ww-multi-note-and-followup",
    domain: "write_workflows",
    name: "Multi-action: poznámka + follow-up",
    description: "Poradce vytváří poznámku ze schůzky a rovnou zakládá follow-up.",
    turns: [
      { role: "user", content: "Zapiš poznámku ze schůzky s Dvořákovou a nastav follow-up za 14 dní." },
    ],
    expectedIntent: {
      intentType: "multi_action",
    },
    expectedPlan: {
      minSteps: 2,
      maxSteps: 3,
      expectedActions: ["createMeetingNote", "createFollowUp"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["write_workflows", "multi-action", "notes", "follow-up", "3i"],
  },
  {
    id: "ww-update-existing-opportunity",
    domain: "write_workflows",
    name: "Aktualizace existujícího obchodu",
    description: "Poradce chce aktualizovat stávající obchod; bez opportunityId zůstane plán ve stavu draft.",
    turns: [
      { role: "user", content: "Aktualizuj obchod Nováka — zvýšit částku hypotéky na 5M." },
    ],
    expectedIntent: {
      intentType: "update_opportunity",
      productDomain: "hypo",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["updateOpportunity"],
      expectedContactIdPresent: true,
      expectedStatus: "draft",
    },
    tags: ["write_workflows", "update", "3i"],
  },
  {
    id: "ww-send-portal-message",
    domain: "write_workflows",
    name: "Odeslání zprávy klientovi přes portál",
    description: "Poradce posílá zprávu klientovi do portálu; bez textu zprávy zůstane plán ve stavu draft.",
    turns: [
      { role: "user", content: "Pošli zprávu Novákovi — informuj ho, že smlouva je připravena k podpisu." },
    ],
    expectedIntent: {
      intentType: "send_portal_message",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["sendPortalMessage"],
      expectedContactIdPresent: true,
      expectedStatus: "draft",
    },
    tags: ["write_workflows", "portal-message", "3i"],
  },
  {
    id: "ww-schedule-calendar-slotted",
    domain: "write_workflows",
    name: "Naplánování schůzky — vyplněný čas (happy path)",
    description: "Intent má resolved datum/čas; plán čeká na potvrzení.",
    turns: [
      { role: "user", content: "Naplánuj schůzku s Novákem na čtvrtek 14:00." },
    ],
    expectedIntent: {
      intentType: "schedule_meeting",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["scheduleCalendarEvent"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["write_workflows", "calendar", "3i", "happy-path"],
  },
  {
    id: "ww-update-opportunity-slotted",
    domain: "write_workflows",
    name: "Aktualizace obchodu — vybraný obchod (happy path)",
    description: "Rozlišení obsahuje opportunityId; plán čeká na potvrzení.",
    turns: [
      { role: "user", content: "Aktualizuj obchod — zvýš částku na 5M." },
    ],
    expectedIntent: {
      intentType: "update_opportunity",
      productDomain: "hypo",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["updateOpportunity"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["write_workflows", "update", "3i", "happy-path"],
  },
  {
    id: "ww-send-portal-message-slotted",
    domain: "write_workflows",
    name: "Portálová zpráva — vyplněný text (happy path)",
    description: "Intent obsahuje text zprávy; plán čeká na potvrzení.",
    turns: [
      { role: "user", content: "Pošli Novákovi zprávu, že smlouva je připravena." },
    ],
    expectedIntent: {
      intentType: "send_portal_message",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["sendPortalMessage"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["write_workflows", "portal-message", "3i", "happy-path"],
  },
  {
    id: "ww-attach-document-to-opportunity",
    domain: "write_workflows",
    name: "Přiřazení dokumentu k obchodu",
    description: "Poradce přiřazuje dokument ke konkrétnímu obchodu.",
    turns: [
      { role: "user", content: "Přiřaď dokument k hypotečnímu obchodu." },
    ],
    expectedIntent: {
      intentType: "attach_document_to_opportunity",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 1,
      expectedActions: ["attachDocumentToOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["write_workflows", "document-attach-opportunity", "3i"],
  },

  // ─── PHASE 3I: SAFETY — WRITE-SPECIFIC ──────────────────────

  {
    id: "safety-no-client-write",
    domain: "safety",
    name: "Blokace zápisu bez klienta",
    description: "Write akce bez klienta musí být zablokována.",
    turns: [
      { role: "user", content: "Založ obchod na pojištění." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
    },
    expectedSafety: {
      mustBlock: true,
      mustNotWriteWithoutClient: true,
    },
    tags: ["safety", "no-client"],
  },
  {
    id: "safety-ambiguous-client",
    domain: "safety",
    name: "Blokace zápisu s nejednoznačným klientem",
    description: "Write akce s ambiguousní identifikací klienta musí být zablokována.",
    turns: [
      { role: "user", content: "Založ obchod pro Nováka." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
    },
    expectedSafety: {
      mustBlock: true,
      mustWarnAmbiguous: true,
    },
    tags: ["safety", "ambiguous"],
  },
  {
    id: "safety-cross-client-warning",
    domain: "safety",
    name: "Varování při nesouladu klienta",
    description: "Locked klient A, resolved B → musí varovat.",
    turns: [
      { role: "user", content: "Založ úkol pro Dvořákovou." },
    ],
    expectedIntent: {
      intentType: "create_task",
    },
    expectedSafety: {
      mustWarnCrossClient: true,
    },
    tags: ["safety", "cross-client"],
  },
  {
    id: "safety-multi-action-no-client",
    domain: "safety",
    name: "Multi-action write bez klienta musí blokovat",
    description: "Vícekroková akce bez resolved klienta nesmí projít.",
    turns: [
      { role: "user", content: "Založ obchod a naplánuj schůzku na příští týden." },
    ],
    expectedIntent: {
      intentType: "multi_action",
    },
    expectedSafety: {
      mustBlock: true,
      mustNotWriteWithoutClient: true,
    },
    tags: ["safety", "multi-action", "no-client", "3i"],
  },

  // ─── EXISTING (MIGRATED FROM EARLIER PHASES) ────────────────

  {
    id: "client-request-without-subject-draft",
    domain: "client_portal",
    name: "Klientský požadavek bez předmětu — kanonický subject injektován",
    description: "Klientský požadavek bez subject/description dostane kanonický subject a přejde do awaiting_confirmation.",
    turns: [
      { role: "user", content: "Založ klientský požadavek pro Marii Novákovou." },
    ],
    expectedIntent: {
      intentType: "create_client_request",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createClientRequest"],
      expectedContactIdPresent: true,
      expectedStatus: "awaiting_confirmation",
    },
    tags: ["client-request", "portal", "3f"],
  },
  {
    id: "service-case-distinct-from-client-request",
    domain: "client_portal",
    name: "Servisní případ se nezmění na klientský požadavek",
    description: "create_service_case musí mapovat na createServiceCase, ne createClientRequest.",
    turns: [
      { role: "user", content: "Založ servisní případ pro Petra Nováka — výročí smlouvy." },
    ],
    expectedIntent: {
      intentType: "create_service_case",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createServiceCase"],
      expectedContactIdPresent: true,
    },
    tags: ["service-case", "3f", "semantics"],
  },
  {
    id: "material-request-standalone",
    domain: "client_portal",
    name: "Material request — vyžádání podkladů s titulkem",
    description: "create_material_request mapuje na createMaterialRequest se slotem pro title.",
    turns: [
      { role: "user", content: "Vyžádej od Petra Dvořáka výpis z katastru a potvrzení příjmu." },
    ],
    expectedIntent: {
      intentType: "create_material_request",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createMaterialRequest"],
      expectedContactIdPresent: true,
    },
    tags: ["material-request", "3f"],
  },
  {
    id: "safety-duplicate-action",
    domain: "safety",
    name: "Duplicitní akce — detekce",
    description: "Opakovaný identický příkaz nesmí vytvořit duplicitu.",
    turns: [
      { role: "user", content: "Založ obchod na hypotéku pro Jana Nováka." },
      { role: "assistant", content: "Obchod založen." },
      { role: "user", content: "Založ obchod na hypotéku pro Jana Nováka." },
    ],
    expectedIntent: {
      intentType: "create_opportunity",
      productDomain: "hypo",
    },
    expectedPlan: {
      minSteps: 1,
      maxSteps: 2,
      expectedActions: ["createOpportunity"],
      expectedContactIdPresent: true,
    },
    tags: ["safety", "duplicate"],
  },
  {
    id: "safety-stale-context-read-only",
    domain: "safety",
    name: "Read-only intent nekontroluje context safety",
    description: "Dotaz typu general_chat nebo summarize_client nesmí vyvolat blokaci.",
    turns: [
      { role: "user", content: "Shrň mi klienta." },
    ],
    expectedIntent: {
      intentType: "summarize_client",
    },
    tags: ["safety", "read-only"],
  },
];
