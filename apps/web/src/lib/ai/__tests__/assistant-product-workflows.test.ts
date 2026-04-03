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
import { enrichCanonicalIntentWithPlaybooks, pickPlaybookForIntent } from "../playbooks";

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
