import { describe, it, expect } from "vitest";
import {
  getDataClass,
  getDataClassDefinition,
  getEntityClassDefinition,
  isExportable,
  isDeletable,
  getRetentionMonths,
  shouldMaskInLogs,
  shouldMaskInUi,
  requiresEncryption,
  getAllEntityTypes,
  getEntityTypesByClass,
  DATA_CLASS_DEFINITIONS,
  type DataClass,
} from "../data-classification";

describe("DATA_CLASS_DEFINITIONS completeness", () => {
  const classes: DataClass[] = [
    "public_metadata",
    "internal_operational",
    "personal_data",
    "sensitive_personal",
    "financial_payment",
    "document_original",
    "extracted_payload",
    "audit_security",
  ];

  it("defines all 8 data classes", () => {
    classes.forEach((cls) => {
      expect(DATA_CLASS_DEFINITIONS[cls]).toBeDefined();
    });
  });

  it("financial_payment has longest retention", () => {
    const financial = DATA_CLASS_DEFINITIONS["financial_payment"];
    expect(financial.retentionMonths).toBeGreaterThanOrEqual(120);
  });

  it("sensitive_personal requires encryption", () => {
    expect(DATA_CLASS_DEFINITIONS["sensitive_personal"].requiresEncryption).toBe(true);
  });

  it("audit_security is not deletable", () => {
    expect(DATA_CLASS_DEFINITIONS["audit_security"].deletable).toBe(false);
  });

  it("financial_payment is not deletable", () => {
    expect(DATA_CLASS_DEFINITIONS["financial_payment"].deletable).toBe(false);
  });
});

describe("getDataClass", () => {
  it("returns correct class for known entities", () => {
    expect(getDataClass("document")).toBe("document_original");
    expect(getDataClass("contact")).toBe("personal_data");
    expect(getDataClass("client_payment_setup")).toBe("financial_payment");
    expect(getDataClass("audit_log")).toBe("audit_security");
    expect(getDataClass("task")).toBe("internal_operational");
  });

  it("defaults to internal_operational for unknown entity", () => {
    expect(getDataClass("unknown_entity_type")).toBe("internal_operational");
  });
});

describe("getDataClassDefinition", () => {
  it("returns definition for known class", () => {
    const def = getDataClassDefinition("financial_payment");
    expect(def.maskedInUi).toBe(true);
    expect(def.requiresEncryption).toBe(true);
  });
});

describe("getEntityClassDefinition", () => {
  it("chains entity type to definition", () => {
    const def = getEntityClassDefinition("document");
    expect(def.dataClass).toBe("document_original");
    expect(def.requiresEncryption).toBe(true);
  });
});

describe("helper functions", () => {
  it("isExportable: returns correct value", () => {
    expect(isExportable("contact")).toBe(true);
    expect(isExportable("audit_log")).toBe(false);
  });

  it("isDeletable: financial records not deletable", () => {
    expect(isDeletable("client_payment_setup")).toBe(false);
    expect(isDeletable("contact")).toBe(true);
  });

  it("getRetentionMonths: returns months", () => {
    expect(getRetentionMonths("client_payment_setup")).toBe(120);
    expect(getRetentionMonths("contact")).toBe(60);
  });

  it("shouldMaskInLogs: returns correct value", () => {
    expect(shouldMaskInLogs("contact")).toBe(true);
    expect(shouldMaskInLogs("task")).toBe(false);
  });

  it("shouldMaskInUi: sensitive personal always masked", () => {
    expect(shouldMaskInUi("aml_checklist")).toBe(true);
    expect(shouldMaskInUi("task")).toBe(false);
  });

  it("requiresEncryption: sensitive types require it", () => {
    expect(requiresEncryption("aml_checklist")).toBe(true);
    expect(requiresEncryption("task")).toBe(false);
  });
});

describe("getAllEntityTypes", () => {
  it("returns list of entity type strings", () => {
    const types = getAllEntityTypes();
    expect(types).toContain("document");
    expect(types).toContain("contact");
    expect(types.length).toBeGreaterThan(10);
  });
});

describe("getEntityTypesByClass", () => {
  it("returns only entities of given class", () => {
    const auditTypes = getEntityTypesByClass("audit_security");
    expect(auditTypes).toContain("audit_log");
    expect(auditTypes).toContain("incident_log");
    auditTypes.forEach((t) => expect(getDataClass(t)).toBe("audit_security"));
  });
});
