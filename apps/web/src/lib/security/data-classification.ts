/**
 * Data classification registry (Plan 9A.4).
 * Maps entity types to data classes with access, retention, and handling rules.
 */

export type DataClass =
  | "public_metadata"
  | "internal_operational"
  | "personal_data"
  | "sensitive_personal"
  | "financial_payment"
  | "document_original"
  | "extracted_payload"
  | "audit_security";

export type AccessLevel = "public" | "internal" | "restricted" | "confidential" | "top_secret";

export type DataClassDefinition = {
  dataClass: DataClass;
  description: string;
  accessLevel: AccessLevel;
  maskedInUi: boolean;
  maskedInLogs: boolean;
  retentionMonths: number;
  exportable: boolean;
  deletable: boolean;
  requiresEncryption: boolean;
};

export const DATA_CLASS_DEFINITIONS: Record<DataClass, DataClassDefinition> = {
  public_metadata: {
    dataClass: "public_metadata",
    description: "Non-sensitive metadata like entity IDs, timestamps, document types",
    accessLevel: "internal",
    maskedInUi: false,
    maskedInLogs: false,
    retentionMonths: 84, // 7 years
    exportable: true,
    deletable: true,
    requiresEncryption: false,
  },
  internal_operational: {
    dataClass: "internal_operational",
    description: "Operational data: pipeline steps, review statuses, audit actions",
    accessLevel: "internal",
    maskedInUi: false,
    maskedInLogs: false,
    retentionMonths: 84,
    exportable: true,
    deletable: false,
    requiresEncryption: false,
  },
  personal_data: {
    dataClass: "personal_data",
    description: "Basic personal data: name, address, contact info",
    accessLevel: "restricted",
    maskedInUi: false,
    maskedInLogs: true,
    retentionMonths: 60, // 5 years
    exportable: true,
    deletable: true,
    requiresEncryption: false,
  },
  sensitive_personal: {
    dataClass: "sensitive_personal",
    description: "Special category data: health, personal ID (rodné číslo), biometric",
    accessLevel: "confidential",
    maskedInUi: true,
    maskedInLogs: true,
    retentionMonths: 60,
    exportable: true,
    deletable: true,
    requiresEncryption: true,
  },
  financial_payment: {
    dataClass: "financial_payment",
    description: "Financial data: IBAN, account numbers, payment instructions, variable symbols",
    accessLevel: "confidential",
    maskedInUi: true,
    maskedInLogs: true,
    retentionMonths: 120, // 10 years (financial regulatory)
    exportable: true,
    deletable: false, // financial records must be kept
    requiresEncryption: true,
  },
  document_original: {
    dataClass: "document_original",
    description: "Original uploaded document files and their checksums",
    accessLevel: "confidential",
    maskedInUi: false,
    maskedInLogs: true,
    retentionMonths: 84,
    exportable: true,
    deletable: true,
    requiresEncryption: true,
  },
  extracted_payload: {
    dataClass: "extracted_payload",
    description: "AI-extracted field data from documents",
    accessLevel: "restricted",
    maskedInUi: false,
    maskedInLogs: true,
    retentionMonths: 60,
    exportable: true,
    deletable: true,
    requiresEncryption: false,
  },
  audit_security: {
    dataClass: "audit_security",
    description: "Audit logs, security events, incident records",
    accessLevel: "restricted",
    maskedInUi: false,
    maskedInLogs: false,
    retentionMonths: 84,
    exportable: false,
    deletable: false, // audit records must be retained
    requiresEncryption: false,
  },
};

// Entity-type to data-class mapping
const ENTITY_TYPE_CLASSIFICATION: Record<string, DataClass> = {
  document: "document_original",
  document_processing_job: "internal_operational",
  contract_upload_review: "extracted_payload",
  contract_review_correction: "extracted_payload",
  document_extraction: "extracted_payload",
  client_payment_setup: "financial_payment",
  contact: "personal_data",
  company: "personal_data",
  meeting_note: "personal_data",
  task: "internal_operational",
  reminder: "internal_operational",
  execution_action: "internal_operational",
  escalation_event: "audit_security",
  audit_log: "audit_security",
  activity_log: "internal_operational",
  advisor_notification: "internal_operational",
  communication_draft: "personal_data",
  message: "personal_data",
  message_attachment: "document_original",
  export: "audit_security",
  export_artifact: "document_original",
  consent: "personal_data",
  processing_purpose: "internal_operational",
  aml_checklist: "sensitive_personal",
  incident_log: "audit_security",
  dead_letter_item: "internal_operational",
  analytics_snapshot: "internal_operational",
  tenant_setting: "internal_operational",
};

export function getDataClass(entityType: string): DataClass {
  return ENTITY_TYPE_CLASSIFICATION[entityType] ?? "internal_operational";
}

export function getDataClassDefinition(dataClass: DataClass): DataClassDefinition {
  return DATA_CLASS_DEFINITIONS[dataClass];
}

export function getEntityClassDefinition(entityType: string): DataClassDefinition {
  return getDataClassDefinition(getDataClass(entityType));
}

export function isExportable(entityType: string): boolean {
  return getEntityClassDefinition(entityType).exportable;
}

export function isDeletable(entityType: string): boolean {
  return getEntityClassDefinition(entityType).deletable;
}

export function getRetentionMonths(entityType: string): number {
  return getEntityClassDefinition(entityType).retentionMonths;
}

export function shouldMaskInLogs(entityType: string): boolean {
  return getEntityClassDefinition(entityType).maskedInLogs;
}

export function shouldMaskInUi(entityType: string): boolean {
  return getEntityClassDefinition(entityType).maskedInUi;
}

export function requiresEncryption(entityType: string): boolean {
  return getEntityClassDefinition(entityType).requiresEncryption;
}

export function getAllEntityTypes(): string[] {
  return Object.keys(ENTITY_TYPE_CLASSIFICATION);
}

export function getEntityTypesByClass(dataClass: DataClass): string[] {
  return Object.entries(ENTITY_TYPE_CLASSIFICATION)
    .filter(([, cls]) => cls === dataClass)
    .map(([type]) => type);
}
