type PaymentInstructionIdentity = {
  partnerName: string;
  productName: string | null;
  contractNumber: string | null;
  accountNumber: string;
  variableSymbol: string | null;
  contractId?: string | null;
};

function normalizeKeyPart(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function paymentInstructionFallbackKey(instruction: PaymentInstructionIdentity): string {
  return [
    normalizeKeyPart(instruction.partnerName),
    normalizeKeyPart(instruction.productName),
    normalizeKeyPart(instruction.accountNumber),
    normalizeKeyPart(instruction.variableSymbol),
  ].join("|");
}

export function portalPaymentInstructionDedupKey(instruction: PaymentInstructionIdentity): string {
  const contractNumber = normalizeKeyPart(instruction.contractNumber);
  if (contractNumber) return `contract-number:${contractNumber}`;

  const contractId = normalizeKeyPart(instruction.contractId);
  if (contractId) return `contract-id:${contractId}`;

  return `payment:${paymentInstructionFallbackKey(instruction)}`;
}

export function dedupePortalPaymentInstructions<T extends PaymentInstructionIdentity>(instructions: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const instruction of instructions) {
    const key = portalPaymentInstructionDedupKey(instruction);
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(instruction);
  }

  return out;
}
