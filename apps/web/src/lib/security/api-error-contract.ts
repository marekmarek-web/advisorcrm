/**
 * Safe API error surface (Plan 9B).
 * Avoids leaking stack traces and internal details to clients in production.
 */

import { NextResponse } from "next/server";

export type SafeApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class SafeApiError extends Error {
  readonly code: SafeApiErrorCode;
  readonly status: number;
  readonly publicMessage: string;
  readonly correlationId?: string;

  constructor(params: {
    code: SafeApiErrorCode;
    status: number;
    publicMessage: string;
    correlationId?: string;
    cause?: unknown;
  }) {
    super(params.publicMessage);
    this.name = "SafeApiError";
    this.code = params.code;
    this.status = params.status;
    this.publicMessage = params.publicMessage;
    this.correlationId = params.correlationId;
    if (params.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = params.cause;
    }
  }
}

const isProd =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

export function createSafeError(
  err: unknown,
  fallback: { message: string; code?: SafeApiErrorCode; status?: number } = {
    message: "Something went wrong",
  }
): SafeApiError {
  if (err instanceof SafeApiError) return err;

  if (err && typeof err === "object" && "status" in err && "message" in err) {
    const o = err as { status?: number; message?: string };
    const status = typeof o.status === "number" ? o.status : 500;
    const code = statusToCode(status);
    return new SafeApiError({
      code,
      status,
      publicMessage: isProd && status >= 500 ? fallback.message : String(o.message ?? fallback.message),
      cause: err,
    });
  }

  if (err instanceof Error) {
    return new SafeApiError({
      code: (fallback.code ?? "INTERNAL_ERROR") as SafeApiErrorCode,
      status: fallback.status ?? 500,
      publicMessage: isProd ? fallback.message : err.message,
      cause: err,
    });
  }

  return new SafeApiError({
    code: (fallback.code ?? "INTERNAL_ERROR") as SafeApiErrorCode,
    status: fallback.status ?? 500,
    publicMessage: fallback.message,
    cause: err,
  });
}

function statusToCode(status: number): SafeApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

export function safeErrorResponse(err: SafeApiError): NextResponse {
  const body: Record<string, unknown> = {
    error: err.publicMessage,
    code: err.code,
  };
  if (err.correlationId) body.correlationId = err.correlationId;
  return NextResponse.json(body, { status: err.status });
}

export function wrapApiHandler(
  handler: () => Promise<Response>,
  options?: { correlationId?: string }
): Promise<Response> {
  return handler().catch((e: unknown) => {
    const safe = createSafeError(e, { message: "Internal server error" });
    if (options?.correlationId && !safe.correlationId) {
      return safeErrorResponse(
        new SafeApiError({
          code: safe.code,
          status: safe.status,
          publicMessage: safe.publicMessage,
          correlationId: options.correlationId,
          cause: safe.cause,
        })
      );
    }
    return safeErrorResponse(safe);
  });
}
