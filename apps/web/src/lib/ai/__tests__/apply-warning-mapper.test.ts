/**
 * apply-warning-mapper — regression tests.
 *
 * Ensures every known documentLinkWarning code emitted by apply-contract-review.ts
 * produces a visible advisor-facing toast with the correct Czech copy, and that
 * unknown codes still surface via the generic fallback instead of being swallowed.
 */

import { describe, it, expect } from "vitest";
import {
  DOCUMENT_LINK_WARNING_CODES,
  mapDocumentLinkWarningToApplyWarning,
} from "@/lib/ai/apply-warning-mapper";

describe("mapDocumentLinkWarningToApplyWarning", () => {
  it("W01: null → null (no warning)", () => {
    expect(mapDocumentLinkWarningToApplyWarning(null)).toBeNull();
  });

  it("W02: undefined → null (no warning)", () => {
    expect(mapDocumentLinkWarningToApplyWarning(undefined)).toBeNull();
  });

  it("W03: empty string → null (no warning)", () => {
    expect(mapDocumentLinkWarningToApplyWarning("")).toBeNull();
  });

  it("W04: attach_only_missing_contact → specific Czech message", () => {
    const result = mapDocumentLinkWarningToApplyWarning("attach_only_missing_contact");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("attach_only_missing_contact");
    expect(result?.message).toContain("klient");
    expect(result?.message).toContain("Přiřaďte");
  });

  it("W05: attach_only_missing_storage_path → specific Czech message", () => {
    const result = mapDocumentLinkWarningToApplyWarning("attach_only_missing_storage_path");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("attach_only_missing_storage_path");
    expect(result?.message).toContain("zdrojový soubor");
    expect(result?.message).toContain("Nahrajte");
  });

  it("W06: attach_only_link_not_persisted → specific Czech message with support mention", () => {
    const result = mapDocumentLinkWarningToApplyWarning("attach_only_link_not_persisted");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("attach_only_link_not_persisted");
    expect(result?.message).toContain("napojení");
    expect(result?.message).toContain("support");
  });

  it("W07: document_link_failed → generic fallback (pre-existing pathway)", () => {
    const result = mapDocumentLinkWarningToApplyWarning("document_link_failed");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("document_link_failed");
    expect(result?.message).toContain("nepodařilo dokončit");
  });

  it("W08: document_link_exception → generic fallback (pre-existing pathway)", () => {
    const result = mapDocumentLinkWarningToApplyWarning("document_link_exception");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("document_link_exception");
    expect(result?.message).toContain("nepodařilo dokončit");
  });

  it("W09: unknown/future code → generic fallback (no silent swallow)", () => {
    const result = mapDocumentLinkWarningToApplyWarning("future_unknown_warning_code");
    expect(result).not.toBeNull();
    expect(result?.code).toBe("future_unknown_warning_code");
    // Generic message must still contain guidance so advisor acts
    expect(result?.message.length).toBeGreaterThan(20);
  });

  it("W10: every code in DOCUMENT_LINK_WARNING_CODES produces a non-null warning", () => {
    for (const code of DOCUMENT_LINK_WARNING_CODES) {
      const result = mapDocumentLinkWarningToApplyWarning(code);
      expect(result, `code ${code} should map to a warning`).not.toBeNull();
      expect(result?.code).toBe(code);
      expect(result?.message.trim().length).toBeGreaterThan(0);
    }
  });

  it("W11: returned message never contains the raw code (UI-hostile)", () => {
    for (const code of DOCUMENT_LINK_WARNING_CODES) {
      const result = mapDocumentLinkWarningToApplyWarning(code);
      expect(result?.message).not.toContain(code);
    }
  });

  it("W12: attach-only specific codes ≠ generic message (each has distinct copy)", () => {
    const m1 = mapDocumentLinkWarningToApplyWarning("attach_only_missing_contact");
    const m2 = mapDocumentLinkWarningToApplyWarning("attach_only_missing_storage_path");
    const m3 = mapDocumentLinkWarningToApplyWarning("attach_only_link_not_persisted");
    const mGeneric = mapDocumentLinkWarningToApplyWarning("document_link_failed");

    expect(m1?.message).not.toBe(m2?.message);
    expect(m2?.message).not.toBe(m3?.message);
    expect(m1?.message).not.toBe(m3?.message);
    expect(m1?.message).not.toBe(mGeneric?.message);
    expect(m2?.message).not.toBe(mGeneric?.message);
    expect(m3?.message).not.toBe(mGeneric?.message);
  });
});
