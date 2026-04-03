/**
 * Fáze 9 — regresní scénáře orchestrace (bez LLM / bez DB).
 * Dokument + portál + servis + partial failure + potvrzení před zápisem.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChainable } = vi.hoisted(() => {
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn().mockImplementation(self);
    chain.from = vi.fn().mockImplementation(self);
    chain.where = vi.fn().mockImplementation(self);
    chain.limit = vi.fn().mockResolvedValue([]);
    chain.insert = vi.fn().mockImplementation(self);
    chain.values = vi.fn().mockImplementation(self);
    return chain;
  };
  return { mockChainable: chainable };
});

vi.mock("db", () => ({
  db: mockChainable(),
  eq: vi.fn(),
  and: vi.fn(),
  executionActions: { tenantId: "t", actionType: "a", sourceId: "s", status: "st", resultPayload: "rp", id: "id" },
  contacts: {},
  opportunities: {},
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
import { emptyCanonicalIntent, type CanonicalIntent } from "../assistant-domain-model";
import type { EntityResolutionResult } from "../assistant-entity-resolution";
import {
  buildExecutionPlan,
  confirmAllSteps,
  getStepsAwaitingConfirmation,
} from "../assistant-execution-plan";
import { buildVerifiedResult, mergeWriteStepParamsFromCompletedDependencies } from "../assistant-execution-engine";
import { getOrCreateSession, updateSessionContext, lockAssistantClient, lockAssistantOpportunity } from "../assistant-session";
import { opportunityTitleFromSlots, caseTypeForProductDomain, PRODUCT_DOMAIN_TO_CASE_TYPE } from "../assistant-case-type-map";

const CONTACT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OPP_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CONTRACT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const REVIEW_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const MATERIAL_REQ_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

function resolutionWithClient(
  extra: Partial<EntityResolutionResult> = {},
): EntityResolutionResult {
  return {
    client: {
      entityType: "contact",
      entityId: CONTACT_ID,
      displayLabel: "Jan Test",
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

describe("buildExecutionPlan — dokument / portfolio / AI review / portál", () => {
  it("multi_action: classify + viditelnost dokumentu + publish portfolio", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "multi_action",
        requestedActions: ["classify_document", "show_document_to_client", "publish_portfolio_item"],
        targetDocument: { ref: DOC_ID, resolved: true },
        extractedFacts: [
          { key: "documentType", value: "hypoteka", source: "user_text" },
          { key: "contractId", value: CONTRACT_ID, source: "user_text" },
        ],
      }),
      resolutionWithClient(),
    );
    const actions = plan.steps.map((s) => s.action);
    expect(actions).toContain("classifyDocument");
    expect(actions).toContain("setDocumentVisibleToClient");
    expect(actions).toContain("publishPortfolioItem");
    const classify = plan.steps.find((s) => s.action === "classifyDocument");
    expect(classify?.params.documentId).toBe(DOC_ID);
    expect(classify?.params.documentType).toBe("hypoteka");
    const pub = plan.steps.find((s) => s.action === "publishPortfolioItem");
    expect(pub?.params.contractId).toBe(CONTRACT_ID);
  });

  it("notify_client_portal doplňuje titulek z taskTitle", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "notify_client_portal",
        requestedActions: ["notify_client_portal"],
        extractedFacts: [
          { key: "taskTitle", value: "Termín podpisu", source: "user_text" },
          { key: "noteContent", value: "Prosím potvrďte.", source: "user_text" },
        ],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.action).toBe("createClientPortalNotification");
    expect(plan.steps[0]?.params.portalNotificationTitle).toBe("Termín podpisu");
    expect(plan.steps[0]?.params.portalNotificationBody).toBe("Prosím potvrďte.");
    expect(plan.steps[0]?.params.contactId).toBe(CONTACT_ID);
  });

  it("servisní případ (investice) mapuje na createServiceCase", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_service_case",
        productDomain: "investice",
        requestedActions: ["create_service_case"],
        extractedFacts: [{ key: "noteContent", value: "Změna strategie fondu", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps.some((s) => s.action === "createServiceCase")).toBe(true);
    expect(plan.steps[0]?.params.productDomain).toBe("investice");
  });

  it("apply_ai_review_to_crm přebírá reviewId ze session.activeReviewId", () => {
    const session = getOrCreateSession(undefined, "t1", "u1");
    session.activeReviewId = REVIEW_ID;
    const plan = buildExecutionPlan(
      intent({
        intentType: "apply_ai_review_to_crm",
        requestedActions: ["apply_ai_review_to_crm"],
      }),
      resolutionWithClient(),
      session,
    );
    expect(plan.steps[0]?.action).toBe("applyAiContractReviewToCrm");
    expect(plan.steps[0]?.params.reviewId).toBe(REVIEW_ID);
  });

  it("link_document_to_material_request má oba identifikátory z faktů", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "link_document_to_material_request",
        requestedActions: ["link_document_to_material_request"],
        targetDocument: { ref: DOC_ID, resolved: true },
        extractedFacts: [{ key: "materialRequestId", value: MATERIAL_REQ_ID, source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    const step = plan.steps[0];
    expect(step?.action).toBe("linkDocumentToMaterialRequest");
    expect(step?.params.documentId).toBe(DOC_ID);
    expect(step?.params.materialRequestId).toBe(MATERIAL_REQ_ID);
  });
});

describe("3D-2 multi_action — opportunity chaining", () => {
  it("create_opportunity before create_task adds dependsOn for new opportunity id injection", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "multi_action",
        requestedActions: ["create_opportunity", "create_task"],
        productDomain: "hypo",
        extractedFacts: [{ key: "taskTitle", value: "Doplnit podklady", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    const opp = plan.steps.find((s) => s.action === "createOpportunity");
    const task = plan.steps.find((s) => s.action === "createTask");
    expect(opp).toBeDefined();
    expect(task).toBeDefined();
    expect(task?.dependsOn).toContain(opp!.stepId);
    expect(task?.params.opportunityId).toBeUndefined();
  });
});

describe("mergeWriteStepParamsFromCompletedDependencies", () => {
  it("injects opportunityId from succeeded createOpportunity", () => {
    const oppStep = {
      stepId: "opp1",
      action: "createOpportunity" as const,
      params: { contactId: CONTACT_ID },
      label: "O",
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: [],
      status: "succeeded" as const,
      result: {
        ok: true,
        outcome: "executed" as const,
        entityId: OPP_ID,
        entityType: "opportunity",
        warnings: [],
        error: null,
      },
    };
    const taskStep = {
      stepId: "t1",
      action: "createTask" as const,
      params: { contactId: CONTACT_ID, taskTitle: "X" },
      label: "T",
      requiresConfirmation: true,
      isReadOnly: false,
      dependsOn: ["opp1"],
      status: "confirmed" as const,
      result: null,
    };
    const merged = mergeWriteStepParamsFromCompletedDependencies(taskStep, [oppStep, taskStep]);
    expect(merged.opportunityId).toBe(OPP_ID);
  });
});

describe("buildVerifiedResult — partial failure a varování", () => {
  it("shromažďuje chyby selhaných kroků a neslibuje plný úspěch", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "multi_action",
        requestedActions: ["create_reminder", "publish_portfolio_item"],
        targetClient: { ref: CONTACT_ID, resolved: true },
        temporalExpressions: [{ raw: "zítra", resolved: "2026-04-03", confidence: 0.9 }],
        extractedFacts: [
          { key: "taskTitle", value: "Volat", source: "user_text" },
          { key: "contractId", value: CONTRACT_ID, source: "user_text" },
        ],
      }),
      resolutionWithClient(),
    );
    const confirmed = confirmAllSteps(plan);
    const s0 = confirmed.steps[0]!;
    const s1 = confirmed.steps[1]!;
    const failedPlan = {
      ...confirmed,
      status: "partial_failure" as const,
      steps: [
        {
          ...s0,
          status: "succeeded" as const,
          result: {
            ok: true,
            outcome: "idempotent_hit" as const,
            entityId: "11111111-1111-1111-1111-111111111111",
            entityType: "task",
            warnings: ["Akce již byla provedena (idempotentní)."],
            error: null,
          },
        },
        {
          ...s1,
          status: "failed" as const,
          result: {
            ok: false,
            outcome: "failed" as const,
            entityId: null,
            entityType: null,
            warnings: [],
            error: "Chybí oprávnění",
            retryable: true,
          },
        },
      ],
    };
    const verified = buildVerifiedResult("Hotovo.", failedPlan);
    expect(verified.warnings.some((w) => w.includes("idempotentní"))).toBe(true);
    expect(verified.warnings.some((w) => w.includes("selhal"))).toBe(true);
    expect(verified.suggestedNextSteps.some((s) => s.toLowerCase().includes("selhané"))).toBe(true);
    expect(verified.confidence).toBeLessThan(0.9);
    expect(verified.referencedEntities.some((e) => e.id === "11111111-1111-1111-1111-111111111111")).toBe(true);
  });
});

describe("Context safety — URL vs lock", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("varuje při jiném klientovi v URL při aktivním locku", () => {
    const session = getOrCreateSession(undefined, "t1", "u1");
    lockAssistantClient(session, CONTACT_ID);
    const other = "99999999-9999-9999-9999-999999999999";
    const w = updateSessionContext(session, { clientId: other }, { skipClientIdFromUi: true });
    expect(w.length).toBeGreaterThan(0);
    expect(w.some((x) => x.includes("zamčen"))).toBe(true);
  });
});

// ─── 3F: CLIENT REQUEST PLAN GUARD ────────────────────────────────────────

describe("3F: update_client_request má jen opportunityId — plan guard", () => {
  it("updateClientRequest s jen opportunityId je awaiting_confirmation (required field splněn)", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "update_client_request",
        requestedActions: ["update_client_request"],
        extractedFacts: [{ key: "opportunityId", value: OPP_ID, source: "user_text" }],
      }),
      resolutionWithClient({
        opportunity: {
          entityType: "opportunity",
          entityId: OPP_ID,
          displayLabel: "Klientský požadavek #1",
          confidence: 1,
          ambiguous: false,
          alternatives: [],
        },
      }),
    );
    expect(plan.steps[0]?.action).toBe("updateClientRequest");
    expect(plan.status).toBe("awaiting_confirmation");
  });
});

describe("3F: create_client_request vs create_service_case jsou distinktní akce", () => {
  it("create_client_request vede na createClientRequest", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_client_request",
        requestedActions: ["create_client_request"],
        extractedFacts: [{ key: "subject", value: "Chci přehodnotit smlouvu", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps[0]?.action).toBe("createClientRequest");
  });

  it("create_service_case vede na createServiceCase (ne createClientRequest)", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_service_case",
        requestedActions: ["create_service_case"],
        extractedFacts: [{ key: "noteContent", value: "výročí", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.steps[0]?.action).toBe("createServiceCase");
    expect(plan.steps[0]?.action).not.toBe("createClientRequest");
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe("Canonical — žádný předčasný zápis bez potvrzení (plán)", () => {
  it("create_reminder má plný plán ve stavu awaiting_confirmation — bez potvrzení se neprovede", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_reminder",
        requestedActions: ["create_reminder"],
        targetClient: { ref: CONTACT_ID, resolved: true },
        temporalExpressions: [{ raw: "pátek", resolved: "2026-04-10", confidence: 1 }],
        extractedFacts: [{ key: "taskTitle", value: "Follow-up", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("awaiting_confirmation");
    expect(getStepsAwaitingConfirmation(plan).length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.status === "requires_confirmation")).toBe(true);
    const afterConfirm = confirmAllSteps(plan);
    expect(afterConfirm.steps.every((s) => s.status === "confirmed")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regression: multi_action chaining includes attachDocumentToOpportunity

describe("multi_action: createOpportunity + attachDocumentToOpportunity chaining", () => {
  it("attachDocumentToOpportunity depends on createOpportunity and receives opportunityId from predecessor", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "multi_action",
        requestedActions: ["create_opportunity", "attach_document_to_opportunity"],
        targetDocument: { ref: DOC_ID, resolved: true },
        extractedFacts: [{ key: "purpose", value: "nová hypotéka", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    const createStep = plan.steps.find(s => s.action === "createOpportunity");
    const attachStep = plan.steps.find(s => s.action === "attachDocumentToOpportunity");
    expect(createStep).toBeTruthy();
    expect(attachStep).toBeTruthy();
    expect(attachStep!.dependsOn).toContain(createStep!.stepId);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regression: session.lockedOpportunityId propagates into step params

describe("lockedOpportunityId fallback into step params", () => {
  it("step params include opportunityId from session lock when resolution has none", () => {
    const session = getOrCreateSession(undefined, "t-1", "u-1");
    lockAssistantOpportunity(session, OPP_ID);
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_task",
        requestedActions: ["create_task"],
        extractedFacts: [{ key: "taskTitle", value: "Ověřit bonitu", source: "user_text" }],
      }),
      resolutionWithClient(),
      session,
    );
    expect(plan.steps[0]?.params.opportunityId).toBe(OPP_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regression: Czech diacritics in assistant-generated titles

describe("Czech diacritics in CRM write titles", () => {
  it("opportunityTitleFromSlots preserves diacritics for hypo domain", () => {
    const title = opportunityTitleFromSlots({ productDomain: "hypo", purpose: "koupě bytu" });
    expect(title).toContain("hypo");
    expect(title).toContain("koupě bytu");
    expect(title).not.toMatch(/Ă|â€"/);
  });

  it("opportunityTitleFromSlots preserves diacritics for životní pojištění", () => {
    const title = opportunityTitleFromSlots({
      productDomain: "zivotni_pojisteni",
      purpose: "Životní pojištění rodiny",
    });
    expect(title).toContain("životní pojištění");
    expect(title).toContain("Životní pojištění rodiny");
    expect(title).not.toMatch(/Ă|â€"/);
  });

  it("caseTypeForProductDomain maps correctly without mojibake", () => {
    for (const [domain, label] of Object.entries(PRODUCT_DOMAIN_TO_CASE_TYPE)) {
      const ct = caseTypeForProductDomain(domain);
      expect(ct).toBe(label);
      expect(ct).not.toMatch(/Ă|â€"|ÄŚ|Ĺ|ÄŤ/);
    }
  });

  const DIACRITICS_SAMPLES = [
    "Hypotéka",
    "Schůzka",
    "Životní pojištění",
    "Účel",
    "čekáme potvrzení",
    "Termín follow-up",
  ];
  for (const sample of DIACRITICS_SAMPLES) {
    it(`"${sample}" round-trips through JSON without mojibake`, () => {
      const json = JSON.stringify({ title: sample });
      const parsed = JSON.parse(json) as { title: string };
      expect(parsed.title).toBe(sample);
      expect(parsed.title).not.toMatch(/Ă|â€"|ÄŚ|Ĺ|ÄŤ/);
    });
  }
});
