import { z } from "zod";

/**
 * Zod schema for a single extracted contact.
 * Used to validate model output for contacts; contracts schema can be added later.
 */
export const extractedContactSchema = z.object({
  companyName: z.string().optional(),
  ico: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

export type ExtractedContactSchema = z.infer<typeof extractedContactSchema>;

export const extractedContactArraySchema = z.array(extractedContactSchema);

/** Client block inside extracted contract. */
const extractedContractClientSchema = z.object({
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  birthDate: z.string().optional(),
  personalId: z.string().optional(),
  companyId: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

/** Payment details block. */
const extractedContractPaymentDetailsSchema = z.object({
  amount: z.union([z.number(), z.string()]).optional(),
  currency: z.string().optional(),
  frequency: z.string().optional(),
  iban: z.string().optional(),
  accountNumber: z.string().optional(),
  bankCode: z.string().optional(),
  variableSymbol: z.string().optional(),
  firstPaymentDate: z.string().optional(),
});

/**
 * Full contract extraction schema for AI output validation.
 */
export const extractedContractSchema = z.object({
  documentType: z.string().optional(),
  contractNumber: z.string().optional(),
  institutionName: z.string().optional(),
  productName: z.string().optional(),
  client: extractedContractClientSchema.optional(),
  paymentDetails: extractedContractPaymentDetailsSchema.optional(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
  notes: z.array(z.string()).optional(),
  missingFields: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  needsHumanReview: z.boolean().optional(),
});

export type ExtractedContractSchema = z.infer<typeof extractedContractSchema>;

export type ExtractionValidationError = {
  code: "VALIDATION_FAILED";
  message: string;
  issues: z.ZodIssue[];
};

/**
 * Validate raw string (e.g. from createResponse) as JSON array of contacts.
 * Returns parsed data or a controlled error; never silent fail.
 */
export function validateContactExtraction(raw: string): { ok: true; data: ExtractedContactSchema[] } | { ok: false; error: ExtractionValidationError } {
  let parsed: unknown;
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Neplatný JSON v odpovědi modelu.",
        issues: [{ path: [], message: e instanceof Error ? e.message : String(e) } as z.ZodIssue],
      },
    };
  }

  const result = extractedContactArraySchema.safeParse(parsed);
  if (result.success) {
    const filtered = result.data.filter(
      (c) => c.companyName || c.firstName || c.lastName || c.phone || c.email
    );
    return { ok: true, data: filtered };
  }

  return {
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: "Odpověď modelu nevyhovuje schématu kontaktů.",
      issues: result.error.issues,
    },
  };
}

/**
 * Validate raw string (e.g. from createResponse with file) as single contract extraction.
 * Returns parsed data or controlled error.
 */
export function validateContractExtraction(raw: string): { ok: true; data: ExtractedContractSchema } | { ok: false; error: ExtractionValidationError } {
  let parsed: unknown;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw;
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Neplatný JSON v odpovědi modelu (smlouva).",
        issues: [{ path: [], message: e instanceof Error ? e.message : String(e) } as z.ZodIssue],
      },
    };
  }

  const result = extractedContractSchema.safeParse(parsed);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: "Odpověď modelu nevyhovuje schématu smlouvy.",
      issues: result.error.issues,
    },
  };
}
