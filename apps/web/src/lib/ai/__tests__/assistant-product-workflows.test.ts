/**
 * Phase 3C: product workflow contract tests.
 * Covers: service case semantics, domain-aware missing fields,
 * playbook bridge, legacy intent domain resolution fixes.
 */
import { describe, it, expect } from "vitest";

import {
  emptyCanonicalIntent,
  resolveProductDomain,
  type CanonicalIntent,
} from "../assistant-domain-model";
import type { EntityResolutionResult } from "../assistant-entity-resolution";
import { buildExecutionPlan, computeWriteActionMissingFields } from "../assistant-execution-plan";
import { legacyIntentToCanonical } from "../assistant-intent";
import { enrichCanonicalIntentWithPlaybooks, getAllMatchingPlaybookIds, pickPlaybookForIntent } from "../playbooks";

const CONTACT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function resolutionWithClient(extra: Partial<EntityResolutionResult> = {}): EntityResolutionResult {
  return {
    client: {
      entityType: "contact",
      entityId: CONTACT_ID,
      displayLabel: "Test Klient",
      confidence: 1,
      ambiguous: false,
      alternatives: [],
    },
    opportunity: null,
    document: null,
    contract: null,
    warnings: [],
    ...extra,
  };
}

function intent(partial: Partial<CanonicalIntent>): CanonicalIntent {
  return { ...emptyCanonicalIntent(), ...partial };
}

// ─── SERVICE CASE MAPPING ──────────────────────────────────────────────────

describe("create_service_case → createServiceCase (3C)", () => {
  it("maps create_service_case to createServiceCase action", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_service_case",
        requestedActions: ["create_service_case"],
        extractedFacts: [{ key: "noteContent", value: "chce změnu strategie", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps[0]?.action).toBe("createServiceCase");
  });

  it("service case with noteContent is awaiting_confirmation", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_service_case",
        requestedActions: ["create_service_case"],
        productDomain: "dps",
        extractedFacts: [{ key: "noteContent", value: "chce změnu strategie", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("awaiting_confirmation");
    expect(plan.steps[0]?.params.contactId).toBe(CONTACT_ID);
    expect(plan.steps[0]?.params.productDomain).toBe("dps");
  });

  it("service case without description is draft", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_service_case",
        requestedActions: ["create_service_case"],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("draft");
    const step = plan.steps[0];
    expect(step?.action).toBe("createServiceCase");
    const missing = computeWriteActionMissingFields(step!.action, step!.params);
    expect(missing.some((m) => m.includes("subject") || m.includes("description"))).toBe(true);
  });

  it("computeWriteActionMissingFields: createServiceCase requires contactId + subject|description|noteContent", () => {
    const m1 = computeWriteActionMissingFields("createServiceCase", {});
    expect(m1).toContain("contactId");
    expect(m1.some((m) => m.includes("subject"))).toBe(true);

    const m2 = computeWriteActionMissingFields("createServiceCase", {
      contactId: CONTACT_ID,
      noteContent: "změna smlouvy",
    });
    expect(m2).toHaveLength(0);
  });
});

// ─── DOMAIN-AWARE MISSING FIELDS ──────────────────────────────────────────

describe("domain-aware advisory missing fields (3C)", () => {
  it("computeWriteActionMissingFields with hypo domain + domain arg returns advisory hint", () => {
    // Advisory hints are informational only — returned when domain is explicitly passed.
    const missing = computeWriteActionMissingFields(
      "createOpportunity",
      { contactId: CONTACT_ID },
      "hypo",
    );
    expect(missing.some((m) => m.includes("amount") || m.includes("purpose"))).toBe(true);
  });

  it("computeWriteActionMissingFields with hypo domain + amount present has no advisory hint", () => {
    const missing = computeWriteActionMissingFields(
      "createOpportunity",
      { contactId: CONTACT_ID, amount: 3500000 },
      "hypo",
    );
    expect(missing.some((m) => m.includes("amount"))).toBe(false);
  });

  it("computeWriteActionMissingFields with investice domain suggests investmentGoal|purpose", () => {
    const missing = computeWriteActionMissingFields(
      "createOpportunity",
      { contactId: CONTACT_ID },
      "investice",
    );
    expect(missing.some((m) => m.includes("purpose") || m.includes("investmentGoal"))).toBe(true);
  });

  it("computeWriteActionMissingFields without domain has no advisory hints", () => {
    const missing = computeWriteActionMissingFields(
      "createOpportunity",
      { contactId: CONTACT_ID },
    );
    expect(missing).toHaveLength(0);
  });

  it("hypo plan with only contactId is awaiting_confirmation (advisory hints are non-blocking)", () => {
    // Domain advisory hints don't push plan to draft — only structural fields do.
    // Hints are surfaced via playbook userConstraints instead.
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_opportunity",
        requestedActions: ["create_opportunity"],
        productDomain: "hypo",
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("awaiting_confirmation");
  });

  it("hypo plan with contactId + amount is awaiting_confirmation", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_opportunity",
        requestedActions: ["create_opportunity"],
        productDomain: "hypo",
        extractedFacts: [{ key: "amount", value: 4000000, source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("awaiting_confirmation");
  });
});

// ─── PRODUCT DOMAIN RESOLUTION ────────────────────────────────────────────

describe("resolveProductDomain — 3C aliases", () => {
  it("resolves výročí to servis", () => {
    expect(resolveProductDomain("výročí")).toBe("servis");
  });

  it("resolves servisní to servis", () => {
    expect(resolveProductDomain("servisní")).toBe("servis");
  });

  it("resolves firemní to firma_pojisteni", () => {
    expect(resolveProductDomain("firemní")).toBe("firma_pojisteni");
  });

  it("resolves podnikatel to firma_pojisteni", () => {
    expect(resolveProductDomain("podnikatel")).toBe("firma_pojisteni");
  });

  it("resolves cestovka to cestovni", () => {
    expect(resolveProductDomain("cestovka")).toBe("cestovni");
  });

  it("resolves úrazové to zivotni_pojisteni", () => {
    expect(resolveProductDomain("úrazové")).toBe("zivotni_pojisteni");
  });

  it("returns null for unknown domain text", () => {
    expect(resolveProductDomain("obecné")).toBeNull();
  });
});

// ─── LEGACY INTENT DOMAIN FIX ─────────────────────────────────────────────

describe("legacyIntentToCanonical — hypo bias fix (3C)", () => {
  it("bank alone does NOT imply hypo if purpose is unrelated", () => {
    const canonical = legacyIntentToCanonical({
      actions: ["create_opportunity"],
      switchClient: false,
      clientRef: "Jan Novák",
      amount: null,
      ltv: null,
      purpose: "investice",
      bank: "ČSOB",
      rateGuess: null,
      noEmail: false,
      dueDateText: null,
    });
    expect(canonical.productDomain).not.toBe("hypo");
    expect(canonical.productDomain).toBe("investice");
  });

  it("bank with no purpose keeps null domain (not hypo fallback)", () => {
    const canonical = legacyIntentToCanonical({
      actions: ["create_opportunity"],
      switchClient: false,
      clientRef: null,
      amount: null,
      ltv: null,
      purpose: null,
      bank: "ČS",
      rateGuess: null,
      noEmail: false,
      dueDateText: null,
    });
    expect(canonical.productDomain).toBeNull();
  });

  it("bank + mortgage-like purpose infers hypo", () => {
    const canonical = legacyIntentToCanonical({
      actions: ["create_opportunity"],
      switchClient: false,
      clientRef: null,
      amount: 5000000,
      ltv: 80,
      purpose: "koupě bytu",
      bank: "ČSOB",
      rateGuess: null,
      noEmail: false,
      dueDateText: null,
    });
    expect(canonical.productDomain).toBe("hypo");
  });
});

// ─── 3F: CLIENT REQUEST SEMANTICS ─────────────────────────────────────────

describe("3F: create_client_request semantics", () => {
  it("maps create_client_request to createClientRequest", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_client_request",
        requestedActions: ["create_client_request"],
        extractedFacts: [{ key: "noteContent", value: "přehodnotit pojistku", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps[0]?.action).toBe("createClientRequest");
  });

  it("create_client_request with subject is awaiting_confirmation", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_client_request",
        requestedActions: ["create_client_request"],
        extractedFacts: [{ key: "subject", value: "Přehodnotit pojistku", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("awaiting_confirmation");
    expect(plan.steps[0]?.params.contactId).toBe(CONTACT_ID);
  });

  it("create_client_request without explicit subject uses canonical subject → awaiting_confirmation", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_client_request",
        requestedActions: ["create_client_request"],
      }),
      resolutionWithClient(),
    );
    // Canonical subject is injected from domain, so the plan is ready to confirm
    expect(plan.status).toBe("awaiting_confirmation");
    const step = plan.steps[0];
    expect(step?.action).toBe("createClientRequest");
    // Step has subject injected (canonical fallback)
    expect(step?.params.subject).toBeTruthy();
  });

  it("create_service_case does NOT map to createClientRequest", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_service_case",
        requestedActions: ["create_service_case"],
        extractedFacts: [{ key: "noteContent", value: "výročí smlouvy", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps[0]?.action).toBe("createServiceCase");
    expect(plan.steps[0]?.action).not.toBe("createClientRequest");
  });

  it("create_material_request maps to createMaterialRequest (not createClientRequest)", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_material_request",
        requestedActions: ["create_material_request"],
        extractedFacts: [{ key: "taskTitle", value: "výpis z katastru", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps[0]?.action).toBe("createMaterialRequest");
  });

  it("create_material_request without explicit title uses canonical title → awaiting_confirmation", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_material_request",
        requestedActions: ["create_material_request"],
      }),
      resolutionWithClient(),
    );
    // Canonical title injected as taskTitle, so OR-group satisfied
    expect(plan.status).toBe("awaiting_confirmation");
    const step = plan.steps[0];
    expect(step?.params.taskTitle).toBeTruthy();
  });

  it("computeWriteActionMissingFields: createClientRequest requires contactId + subject slot", () => {
    const m1 = computeWriteActionMissingFields("createClientRequest", {});
    expect(m1).toContain("contactId");
    expect(m1.some((m) => m.includes("subject"))).toBe(true);

    const m2 = computeWriteActionMissingFields("createClientRequest", {
      contactId: CONTACT_ID,
      subject: "Přehodnotit pojistku",
    });
    expect(m2).toHaveLength(0);

    const m3 = computeWriteActionMissingFields("createClientRequest", {
      contactId: CONTACT_ID,
      noteContent: "nějaká poznámka",
    });
    expect(m3).toHaveLength(0);
  });
});

// ─── PLAYBOOK BRIDGE ──────────────────────────────────────────────────────

describe("playbook bridge — hints in userConstraints (3C)", () => {
  it("firma_pojisteni playbook matches firma message", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_opportunity", productDomain: "firma_pojisteni" }),
      "založ firemní pojištění pro s.r.o.",
    );
    expect(pb?.id).toBe("firma_pojisteni");
  });

  it("firma_pojisteni playbook enriches intent with hint constraints", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_opportunity", productDomain: "firma_pojisteni" }),
      "založ firemní pojištění pro s.r.o.",
    );
    expect(enriched.userConstraints).toContain("playbook:firma_pojisteni");
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
  });

  it("servis playbook picks up výročí message", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_service_case", productDomain: "servis" }),
      "výročí smlouvy pro klienta",
    );
    expect(pb?.id).toBe("servis_vyroci");
  });

  it("investice playbook hints include horizont when purpose missing", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_opportunity", productDomain: "investice" }),
      "ETF portfolio pro klienta",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.includes("horizont") || h.includes("rizikov"))).toBe(true);
  });

  it("hints are not added for read-only intents", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "summarize_client", productDomain: "hypo" }),
      "shrň klienta s hypotékou",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints).toHaveLength(0);
  });
});

// ─── 3G: PLAYBOOK SPLIT A NOVÉ PLAYBOOKS ──────────────────────────────────

describe("3G: investice vs DIP/DPS playbook split", () => {
  it("investice domain picks investice playbook, not dip_dps", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_opportunity", productDomain: "investice" }),
      "ETF portfolio pro klienta",
    );
    expect(pb?.id).toBe("investice");
  });

  it("dip domain picks dip_dps playbook", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_opportunity", productDomain: "dip" }),
      "založ DIP pro klienta",
    );
    expect(pb?.id).toBe("dip_dps");
  });

  it("dps domain picks dip_dps playbook", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_opportunity", productDomain: "dps" }),
      "spoření na důchod",
    );
    expect(pb?.id).toBe("dip_dps");
  });

  it("dip_dps hints include daňový odpočet and příspěvek", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_opportunity", productDomain: "dip" }),
      "založ DIP pro klienta Jana Nováka",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.includes("příspěvek") || h.includes("daňov") || h.includes("investiční strategie"))).toBe(true);
  });

  it("investice hints include horizont and rizikový profil", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_opportunity", productDomain: "investice" }),
      "pravidelné investování do ETF",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.some((h) => h.includes("horizont") || h.includes("rizikov"))).toBe(true);
    expect(hints.some((h) => h.includes("cílová"))).toBe(true);
  });

  it("investice and dip_dps are now distinct playbooks", () => {
    const ids1 = getAllMatchingPlaybookIds(
      intent({ intentType: "create_opportunity", productDomain: "investice" }),
      "ETF portfolio",
    );
    const ids2 = getAllMatchingPlaybookIds(
      intent({ intentType: "create_opportunity", productDomain: "dip" }),
      "založ DIP",
    );
    expect(ids1).not.toEqual(ids2);
    expect(ids1).toContain("investice");
    expect(ids1).not.toContain("dip_dps");
    expect(ids2).toContain("dip_dps");
    expect(ids2).not.toContain("investice");
  });
});

describe("3G: material_request playbook", () => {
  it("picks material_request playbook for create_material_request intent", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_material_request" }),
      "vyžádej podklady od klienta",
    );
    expect(pb?.id).toBe("material_request");
  });

  it("picks material_request playbook for 'výpis z katastru' message", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_material_request" }),
      "potřebuji výpis z katastru a potvrzení příjmu",
    );
    expect(pb?.id).toBe("material_request");
  });

  it("material_request hints are surfaced for create_material_request intent", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_material_request" }),
      "vyžádej výpis z katastru od Petra Nováka",
    );
    expect(enriched.userConstraints).toContain("playbook:material_request");
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.includes("typ") || h.includes("termín") || h.includes("účel"))).toBe(true);
  });

  it("material_request hints are surfaced for create_client_request intent", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_client_request" }),
      "klient chce podat požadavek na přehodnocení pojistky",
    );
    expect(enriched.userConstraints).toContain("playbook:material_request");
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
  });
});

describe("3G: enrichment intent coverage expansion", () => {
  it("create_task intent gets hints from schuzka_ukol_zapis playbook", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_task" }),
      "vytvoř úkol pro Jana Nováka",
    );
    expect(enriched.userConstraints).toContain("playbook:schuzka_ukol_zapis");
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.includes("datum") || h.includes("agenda") || h.includes("účel"))).toBe(true);
  });

  it("schedule_meeting intent gets hints from schuzka_ukol_zapis playbook", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "schedule_meeting" }),
      "naplánuj schůzku na příští týden",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
  });

  it("create_reminder intent gets hints from schuzka_ukol_zapis playbook", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_reminder" }),
      "nastav mi připomínku pro výročí smlouvy",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
  });

  it("hint alreadyCovered respects extracted facts — no duplicate hint", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({
        intentType: "create_opportunity",
        productDomain: "hypo",
        extractedFacts: [
          { key: "částka", value: 4000000, source: "user_text" },
          { key: "ltv", value: 80, source: "user_text" },
        ],
      }),
      "hypo 4M LTV 80",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    // "částka jistiny" → key "částka" is covered, "LTV" key "ltv" is covered
    expect(hints.every((h) => !h.toLowerCase().includes("částka jistiny"))).toBe(true);
    expect(hints.every((h) => !h.toLowerCase().includes("ltv"))).toBe(true);
  });

  it("hint alreadyCovered handles parenthetical qualifiers in hint phrase", () => {
    // "účel (koupě, rekonstrukce, refinancování)" → key "účel"
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({
        intentType: "create_opportunity",
        productDomain: "hypo",
        extractedFacts: [{ key: "účel", value: "koupě bytu", source: "user_text" }],
      }),
      "hypo na koupi bytu",
    );
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.every((h) => !h.includes("účel"))).toBe(true);
  });
});

describe("3G: servis_vyroci matches create_service_case intent directly", () => {
  it("servis_vyroci matches create_service_case intentType regardless of message", () => {
    const pb = pickPlaybookForIntent(
      intent({ intentType: "create_service_case" }),
      "nějaká zpráva bez klíčového slova",
    );
    expect(pb?.id).toBe("servis_vyroci");
  });

  it("servis_vyroci hints are surfaced for create_service_case", () => {
    const enriched = enrichCanonicalIntentWithPlaybooks(
      intent({ intentType: "create_service_case" }),
      "servisní případ pro klienta",
    );
    expect(enriched.userConstraints).toContain("playbook:servis_vyroci");
    const hints = enriched.userConstraints.filter((c) => c.startsWith("hint:"));
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.includes("smlouva") || h.includes("mění") || h.includes("deadline"))).toBe(true);
  });
});
