export type FieldStatus = "success" | "warning" | "error";

export type RecommendationType =
  | "warning"
  | "insight"
  | "opportunity"
  | "compliance"
  | "next_step";

export type RecommendationSeverity = "low" | "medium" | "high" | "critical";

export type FieldFilter =
  | "all"
  | "warning"
  | "error"
  | "edited"
  | "unconfirmed";

export type FieldSource = "ai" | "ocr" | "manual";

export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected";

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedField = {
  id: string;
  groupId: string;
  label: string;
  value: string;
  normalizedValue?: string;
  confidence: number;
  status: FieldStatus;
  message?: string;
  page?: number;
  boundingBox?: BoundingBox;
  sourceType: FieldSource;
  isConfirmed: boolean;
  isEdited: boolean;
  originalAiValue: string;
  manualValue?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export type ExtractedGroup = {
  id: string;
  name: string;
  iconName: string;
  fields: ExtractedField[];
};

export type AIRecommendation = {
  id: string;
  type: RecommendationType;
  severity: RecommendationSeverity;
  title: string;
  description: string;
  linkedFieldIds: string[];
  linkedPage?: number;
  linkedBoundingBoxes?: BoundingBox[];
  actionState: "pending" | "created" | "dismissed";
  dismissed: boolean;
  createdAt: string;
};

export type ExtractionDiagnostics = {
  ocrQuality: "good" | "fair" | "poor";
  extractionCoverage: number;
  totalFields: number;
  extractedFields: number;
  unresolvedFieldCount: number;
  warningCount: number;
  errorCount: number;
  conflictingValueCount: number;
  pagesWithoutReadableText: number[];
  notes: string[];
};

export type ExtractionDocument = {
  id: string;
  fileName: string;
  documentType: string;
  clientName: string;
  uploadTime: string;
  pageCount: number;
  globalConfidence: number;
  reviewStatus: ReviewStatus;
  extractionProvider: "internal" | "adobe" | "mixed";
  processingStatus: string;
  uploadSource: string;
  lastProcessedAt: string;
  executiveSummary: string;
  recommendations: AIRecommendation[];
  diagnostics: ExtractionDiagnostics;
  groups: ExtractedGroup[];
  extraRecommendations: AIRecommendation[];
  pdfUrl: string;
};

export type ExtractionReviewState = {
  activeFieldId: string | null;
  activePage: number;
  zoomLevel: number;
  filter: FieldFilter;
  collapsedGroups: Record<string, boolean>;
  dismissedRecommendations: Record<string, boolean>;
  editedFields: Record<string, string>;
  confirmedFields: Record<string, boolean>;
  isFullscreen: boolean;
  showPdfOnMobile: boolean;
};

export type ExtractionReviewAction =
  | { type: "SET_ACTIVE_FIELD"; fieldId: string | null; page?: number }
  | { type: "SET_PAGE"; page: number }
  | { type: "SET_ZOOM"; level: number }
  | { type: "SET_FILTER"; filter: FieldFilter }
  | { type: "TOGGLE_GROUP"; groupId: string }
  | { type: "DISMISS_RECOMMENDATION"; recId: string }
  | { type: "RESTORE_RECOMMENDATION"; recId: string }
  | { type: "EDIT_FIELD"; fieldId: string; value: string }
  | { type: "CONFIRM_FIELD"; fieldId: string }
  | { type: "REVERT_FIELD"; fieldId: string }
  | { type: "SET_FULLSCREEN"; isFullscreen: boolean }
  | { type: "SET_SHOW_PDF_MOBILE"; show: boolean };
