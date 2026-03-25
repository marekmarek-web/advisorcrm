import { describe, it, expect } from "vitest";
import {
  SafeApiError,
  createSafeError,
  safeErrorResponse,
  wrapApiHandler,
} from "../api-error-contract";

describe("SafeApiError", () => {
  it("carries code and status", () => {
    const e = new SafeApiError({
      code: "NOT_FOUND",
      status: 404,
      publicMessage: "Missing",
    });
    expect(e.code).toBe("NOT_FOUND");
    expect(e.status).toBe(404);
  });
});

describe("createSafeError", () => {
  it("passes through SafeApiError", () => {
    const orig = new SafeApiError({
      code: "FORBIDDEN",
      status: 403,
      publicMessage: "No",
    });
    expect(createSafeError(orig)).toBe(orig);
  });

  it("wraps generic Error", () => {
    const e = createSafeError(new Error("db down"), { message: "fallback" });
    expect(e).toBeInstanceOf(SafeApiError);
    expect(e.status).toBe(500);
  });
});

describe("safeErrorResponse", () => {
  it("returns JSON NextResponse", async () => {
    const res = safeErrorResponse(
      new SafeApiError({ code: "BAD_REQUEST", status: 400, publicMessage: "Bad" })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("Bad");
    expect(body.code).toBe("BAD_REQUEST");
  });
});

describe("wrapApiHandler", () => {
  it("returns handler result on success", async () => {
    const res = await wrapApiHandler(async () => new Response("ok", { status: 200 }));
    expect(res.status).toBe(200);
  });

  it("maps thrown errors to safe JSON", async () => {
    const res = await wrapApiHandler(async () => {
      throw new Error("secret internals");
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});
