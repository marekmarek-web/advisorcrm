/**
 * Provider fallback registry and degraded mode management (Plan 9D).
 * Tracks external dependency health, activates degraded modes,
 * and routes to fallback providers when primary services are unavailable.
 */

export type ProviderType =
  | "ai_extraction"
  | "ai_assistant"
  | "storage"
  | "email"
  | "sms"
  | "pdf_rendering"
  | "ocr"
  | "payment_gateway"
  | "calendar_sync"
  | "document_preview";

export type ProviderStatus = "healthy" | "degraded" | "unavailable" | "unknown";

export type FallbackStrategy = "use_fallback" | "queue_retry" | "return_cached" | "degrade_gracefully" | "fail_fast";

export type ProviderEntry = {
  providerId: string;
  providerType: ProviderType;
  name: string;
  status: ProviderStatus;
  fallbackProviderId?: string;
  fallbackStrategy: FallbackStrategy;
  degradedCapabilities: string[];
  lastCheckedAt?: Date;
  errorMessage?: string;
};

export const PROVIDER_REGISTRY: ProviderEntry[] = [
  {
    providerId: "openai_gpt4",
    providerType: "ai_extraction",
    name: "OpenAI GPT-4 Extraction",
    status: "unknown",
    fallbackProviderId: "openai_gpt35_fallback",
    fallbackStrategy: "use_fallback",
    degradedCapabilities: ["extraction_with_reduced_accuracy"],
  },
  {
    providerId: "openai_gpt35_fallback",
    providerType: "ai_extraction",
    name: "OpenAI GPT-3.5 Fallback",
    status: "unknown",
    fallbackStrategy: "queue_retry",
    degradedCapabilities: ["basic_field_extraction"],
  },
  {
    providerId: "openai_assistant",
    providerType: "ai_assistant",
    name: "OpenAI Assistant",
    status: "unknown",
    fallbackStrategy: "degrade_gracefully",
    degradedCapabilities: ["limited_assistance_mode"],
  },
  {
    providerId: "supabase_storage",
    providerType: "storage",
    name: "Supabase Storage",
    status: "unknown",
    fallbackStrategy: "queue_retry",
    degradedCapabilities: [],
  },
  {
    providerId: "sendgrid",
    providerType: "email",
    name: "SendGrid Email",
    status: "unknown",
    fallbackProviderId: "smtp_fallback",
    fallbackStrategy: "use_fallback",
    degradedCapabilities: ["email_queued"],
  },
  {
    providerId: "smtp_fallback",
    providerType: "email",
    name: "SMTP Fallback",
    status: "unknown",
    fallbackStrategy: "queue_retry",
    degradedCapabilities: ["email_delivery"],
  },
  {
    providerId: "adobe_pdf",
    providerType: "pdf_rendering",
    name: "Adobe PDF Renderer",
    status: "unknown",
    fallbackProviderId: "browser_pdf_fallback",
    fallbackStrategy: "use_fallback",
    degradedCapabilities: ["basic_pdf_generation"],
  },
  {
    providerId: "browser_pdf_fallback",
    providerType: "pdf_rendering",
    name: "Browser-based PDF Fallback",
    status: "unknown",
    fallbackStrategy: "degrade_gracefully",
    degradedCapabilities: ["basic_pdf_generation"],
  },
];

// Runtime status overrides (in-memory, updated by health checks or manual ops)
const statusOverrides = new Map<string, { status: ProviderStatus; reason: string; activatedAt: Date }>();
const degradedModes = new Set<string>(); // set of tenantId:providerType keys

// ---- Provider lookups ----

export function getProvider(providerId: string): ProviderEntry | undefined {
  return PROVIDER_REGISTRY.find((p) => p.providerId === providerId);
}

export function getProvidersByType(providerType: ProviderType): ProviderEntry[] {
  return PROVIDER_REGISTRY.filter((p) => p.providerType === providerType);
}

export function getEffectiveProviderStatus(providerId: string): ProviderStatus {
  const override = statusOverrides.get(providerId);
  if (override) return override.status;
  return getProvider(providerId)?.status ?? "unknown";
}

export function getActiveProvider(providerType: ProviderType): ProviderEntry | null {
  const providers = getProvidersByType(providerType);

  // Find first healthy or fallback in priority order
  for (const provider of providers) {
    const status = getEffectiveProviderStatus(provider.providerId);
    if (status === "healthy") return { ...provider, status };
  }

  // All degraded: return first with degraded fallback strategy
  const degraded = providers.find((p) => {
    const status = getEffectiveProviderStatus(p.providerId);
    return status === "degraded";
  });
  if (degraded) return { ...degraded, status: "degraded" };

  return null;
}

// ---- Status management ----

export type StatusChangeResult = {
  providerId: string;
  previousStatus: ProviderStatus;
  newStatus: ProviderStatus;
  activatedAt: Date;
};

export function setProviderStatus(
  providerId: string,
  status: ProviderStatus,
  reason: string
): StatusChangeResult {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  const previous = getEffectiveProviderStatus(providerId);
  const activatedAt = new Date();
  statusOverrides.set(providerId, { status, reason, activatedAt });

  return { providerId, previousStatus: previous, newStatus: status, activatedAt };
}

export function clearProviderStatusOverride(providerId: string): boolean {
  return statusOverrides.delete(providerId);
}

// ---- Degraded mode ----

export function activateDegradedMode(tenantId: string, providerType: ProviderType): void {
  degradedModes.add(`${tenantId}:${providerType}`);
}

export function deactivateDegradedMode(tenantId: string, providerType: ProviderType): void {
  degradedModes.delete(`${tenantId}:${providerType}`);
}

export function isDegradedMode(tenantId: string, providerType: ProviderType): boolean {
  return degradedModes.has(`${tenantId}:${providerType}`) ||
    degradedModes.has(`global:${providerType}`);
}

export function activateGlobalDegradedMode(providerType: ProviderType): void {
  degradedModes.add(`global:${providerType}`);
}

export function deactivateGlobalDegradedMode(providerType: ProviderType): void {
  degradedModes.delete(`global:${providerType}`);
}

export function listActiveDegradedModes(): string[] {
  return [...degradedModes];
}

// ---- Status report ----

export type ProviderStatusReport = {
  providerId: string;
  name: string;
  providerType: ProviderType;
  status: ProviderStatus;
  fallbackAvailable: boolean;
  degradedCapabilities: string[];
  overrideReason?: string;
  overrideActivatedAt?: Date;
};

export function getProviderStatusReport(): ProviderStatusReport[] {
  return PROVIDER_REGISTRY.map((provider) => {
    const override = statusOverrides.get(provider.providerId);
    const effectiveStatus = override?.status ?? provider.status;

    return {
      providerId: provider.providerId,
      name: provider.name,
      providerType: provider.providerType,
      status: effectiveStatus,
      fallbackAvailable: !!provider.fallbackProviderId,
      degradedCapabilities: provider.degradedCapabilities,
      overrideReason: override?.reason,
      overrideActivatedAt: override?.activatedAt,
    };
  });
}

export function getUnhealthyProviders(): ProviderStatusReport[] {
  return getProviderStatusReport().filter(
    (p) => p.status === "degraded" || p.status === "unavailable"
  );
}

// ---- Resolution helper for callers ----

export type ResolutionOutcome = {
  strategy: FallbackStrategy;
  resolvedProviderId: string | null;
  degradedCapabilities: string[];
  isFallback: boolean;
};

export function resolveProviderForType(providerType: ProviderType): ResolutionOutcome {
  const primary = getProvidersByType(providerType)[0];
  if (!primary) {
    return { strategy: "fail_fast", resolvedProviderId: null, degradedCapabilities: [], isFallback: false };
  }

  const primaryStatus = getEffectiveProviderStatus(primary.providerId);

  if (primaryStatus === "healthy") {
    return {
      strategy: primary.fallbackStrategy,
      resolvedProviderId: primary.providerId,
      degradedCapabilities: [],
      isFallback: false,
    };
  }

  if (primary.fallbackProviderId) {
    const fallbackStatus = getEffectiveProviderStatus(primary.fallbackProviderId);
    if (fallbackStatus !== "unavailable") {
      return {
        strategy: "use_fallback",
        resolvedProviderId: primary.fallbackProviderId,
        degradedCapabilities: primary.degradedCapabilities,
        isFallback: true,
      };
    }
  }

  return {
    strategy: primary.fallbackStrategy,
    resolvedProviderId: null,
    degradedCapabilities: primary.degradedCapabilities,
    isFallback: false,
  };
}
