export type AdobeTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type AdobeAssetUploadResponse = {
  assetID: string;
  uploadUri: string;
};

export type AdobeJobStatus = "in progress" | "done" | "failed";

export type AdobeJobPollResponse = {
  status: AdobeJobStatus;
  /** Normalized by pollJobResult from REST (Adobe may use top-level or nested keys). */
  downloadUri?: string | null;
  asset?: {
    assetID: string;
    downloadUri?: string;
    metadata?: Record<string, unknown>;
  };
  resource?: {
    assetID?: string;
    downloadUri?: string;
    metadata?: Record<string, unknown>;
  };
  error?: {
    code: string;
    message: string;
  };
};

export type AdobeExtractResult = {
  elements: AdobeExtractElement[];
};

export type AdobeExtractElement = {
  type: string;
  text?: string;
  path?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  attributes?: Record<string, unknown>;
  children?: AdobeExtractElement[];
};
