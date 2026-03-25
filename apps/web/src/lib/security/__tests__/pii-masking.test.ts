import { describe, it, expect } from "vitest";
import {
  maskIban,
  maskPersonalId,
  maskAccountNumber,
  maskEmail,
  maskPhone,
  maskGeneric,
  detectAndMaskPII,
  maskPIIInObject,
  shouldMaskForRole,
  maskIfRequired,
  maskForLog,
} from "../pii-masking";

describe("maskIban", () => {
  it("masks IBAN leaving last 4 chars", () => {
    expect(maskIban("CZ6508000000192000145399")).toBe("...5399");
  });

  it("handles short value", () => {
    expect(maskIban("CZ65")).toBe("***");
  });

  it("handles empty/null", () => {
    expect(maskIban("")).toBe("");
    expect(maskIban(null)).toBe("");
    expect(maskIban(undefined)).toBe("");
  });

  it("strips whitespace before masking", () => {
    expect(maskIban("CZ65 0800 0000 1920 0014 5399")).toBe("...5399");
  });
});

describe("maskPersonalId", () => {
  it("returns fixed mask", () => {
    expect(maskPersonalId("901231/1234")).toBe("XX/XXXX");
  });

  it("handles null/undefined", () => {
    expect(maskPersonalId(null)).toBe("");
    expect(maskPersonalId(undefined)).toBe("");
  });
});

describe("maskAccountNumber", () => {
  it("masks account number keeping bank code", () => {
    expect(maskAccountNumber("1234567890/0800")).toBe("***/0800");
  });

  it("masks without slash", () => {
    expect(maskAccountNumber("1234567890")).toBe("***");
  });

  it("handles null", () => {
    expect(maskAccountNumber(null)).toBe("");
  });
});

describe("maskEmail", () => {
  it("masks email local part", () => {
    const result = maskEmail("john.doe@example.com");
    expect(result).toContain("@example.com");
    expect(result).toContain("***");
    expect(result).not.toContain("john");
  });

  it("handles short local parts", () => {
    expect(maskEmail("a@b.com")).toBe("*@b.com");
  });

  it("handles null/empty", () => {
    expect(maskEmail(null)).toBe("");
    expect(maskEmail("")).toBe("");
  });
});

describe("maskPhone", () => {
  it("masks phone showing last 3 digits", () => {
    const result = maskPhone("+420 603 123 456");
    expect(result).toBe("***456");
  });

  it("handles null", () => {
    expect(maskPhone(null)).toBe("");
  });
});

describe("maskGeneric", () => {
  it("masks middle of string", () => {
    const result = maskGeneric("ABCDEF1234");
    expect(result).toContain("***");
    expect(result.startsWith("AB")).toBe(true);
    expect(result.endsWith("34")).toBe(true);
  });

  it("masks very short strings", () => {
    expect(maskGeneric("AB")).toBe("***");
  });
});

describe("detectAndMaskPII", () => {
  it("masks IBAN in free text", () => {
    const text = "Bank account: CZ6508000000192000145399 please process";
    const result = detectAndMaskPII(text);
    expect(result).not.toContain("CZ6508000000192000145399");
    expect(result).toContain("...5399");
  });

  it("masks personal ID in text", () => {
    const text = "RC: 901231/1234 is identified";
    const result = detectAndMaskPII(text);
    expect(result).toContain("XX/XXXX");
    expect(result).not.toContain("901231/1234");
  });

  it("masks email in text", () => {
    const text = "Contact: john.doe@example.com for more info";
    const result = detectAndMaskPII(text);
    expect(result).not.toContain("john.doe@example.com");
    expect(result).toContain("@example.com");
  });

  it("leaves non-PII text unchanged", () => {
    const text = "No sensitive data here at all.";
    expect(detectAndMaskPII(text)).toBe(text);
  });
});

describe("maskPIIInObject", () => {
  it("masks known PII fields by name", () => {
    const obj = { iban: "CZ65...", email: "a@b.com", name: "Jan Novak" };
    const result = maskPIIInObject(obj);
    expect(result.iban).not.toBe("CZ65...");
    expect(result.email).not.toBe("a@b.com");
    expect(result.name).toBe("Jan Novak");
  });

  it("recursively masks nested objects", () => {
    const obj = { payment: { iban: "CZ6508000000192000145399" } };
    const result = maskPIIInObject(obj);
    expect((result.payment as Record<string, unknown>).iban).not.toBe("CZ6508000000192000145399");
  });

  it("uses explicit fields list if provided", () => {
    const obj = { secretCode: "1234567890", otherField: "normal" };
    const result = maskPIIInObject(obj, ["secretCode"]);
    expect(result.secretCode).not.toBe("1234567890");
    expect(result.otherField).toBe("normal");
  });
});

describe("shouldMaskForRole", () => {
  it("returns false for Admin and Director", () => {
    expect(shouldMaskForRole("Admin")).toBe(false);
    expect(shouldMaskForRole("Director")).toBe(false);
  });

  it("returns true for Advisor, Manager, Viewer, Client", () => {
    expect(shouldMaskForRole("Advisor")).toBe(true);
    expect(shouldMaskForRole("Manager")).toBe(true);
    expect(shouldMaskForRole("Viewer")).toBe(true);
    expect(shouldMaskForRole("Client")).toBe(true);
  });
});

describe("maskIfRequired", () => {
  const obj = { iban: "CZ6508000000192000145399", name: "Test" };

  it("masks for Advisor role", () => {
    const result = maskIfRequired(obj, "Advisor");
    expect(result.iban).not.toBe(obj.iban);
  });

  it("does not mask for Admin", () => {
    const result = maskIfRequired(obj, "Admin");
    expect(result.iban).toBe(obj.iban);
  });
});

describe("maskForLog", () => {
  it("masks known PII fields in logs", () => {
    const obj = { personalId: "901231/1234", status: "pending" };
    const result = maskForLog(obj);
    expect(result.personalId).not.toBe("901231/1234");
    expect(result.status).toBe("pending");
  });
});
