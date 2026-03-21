import type { DocumentReviewEnvelope } from "./document-review-types";

function readString(envelope: DocumentReviewEnvelope, key: string): string {
  const field = envelope.extractedFields[key] ?? envelope.extractedFields[key.replace(/^extractedFields\./, "")];
  const v = field?.value;
  return typeof v === "string" ? v.trim() : "";
}

export function inferDocumentRelationships(envelope: DocumentReviewEnvelope): DocumentReviewEnvelope {
  const policyholder = readString(envelope, "policyholder");
  const insured = readString(envelope, "insuredPersonName");
  const intermediary = readString(envelope, "intermediaryName");
  const client = readString(envelope, "clientFullName") || readString(envelope, "fullName");
  const employer = readString(envelope, "employerName");
  const employee = readString(envelope, "employeeName") || readString(envelope, "employeeFullName");
  const company = readString(envelope, "companyName");
  const personOwner = readString(envelope, "ownerName");
  const lender = readString(envelope, "lender") || readString(envelope, "bankName");
  const borrower = client || readString(envelope, "borrowerName");

  envelope.relationshipInference = envelope.relationshipInference ?? {
    policyholderVsInsured: [],
    childInsured: [],
    intermediaryVsClient: [],
    employerVsEmployee: [],
    companyVsPerson: [],
    bankOrLenderVsBorrower: [],
  };

  if (policyholder || insured) {
    envelope.relationshipInference.policyholderVsInsured.push({
      policyholder,
      insured,
      samePerson: Boolean(policyholder && insured && policyholder.toLowerCase() === insured.toLowerCase()),
    });
  }
  if (intermediary || client) {
    envelope.relationshipInference.intermediaryVsClient.push({
      intermediary,
      client,
      samePerson: Boolean(intermediary && client && intermediary.toLowerCase() === client.toLowerCase()),
    });
  }
  if (employer || employee) {
    envelope.relationshipInference.employerVsEmployee.push({
      employer,
      employee,
    });
  }
  if (company || personOwner) {
    envelope.relationshipInference.companyVsPerson.push({
      company,
      personOwner,
    });
  }
  if (lender || borrower) {
    envelope.relationshipInference.bankOrLenderVsBorrower.push({
      lender,
      borrower,
    });
  }
  return envelope;
}

