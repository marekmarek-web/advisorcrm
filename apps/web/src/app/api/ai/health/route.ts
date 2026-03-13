import { NextResponse } from "next/server";
import OpenAI from "openai";
import { logOpenAICall } from "@/lib/openai";

export const dynamic = "force-dynamic";

const defaultModel = "gpt-5-mini";
const fallbackModel = "gpt-4o-mini";

function isModelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return (
    code === "invalid_request_error" ||
    message.includes("model") ||
    message.includes("not found")
  );
}

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const apiKeyPresent = Boolean(apiKey);

  const basePayload = {
    ok: false,
    provider: "openai" as const,
    apiKeyPresent,
    model: process.env.OPENAI_MODEL ?? defaultModel,
    fallbackModel: null as string | null,
  };

  if (!apiKey) {
    return NextResponse.json(
      { ...basePayload, error: "missing_api_key" },
      { status: 200 }
    );
  }

  const client = new OpenAI({ apiKey });
  const primaryModel = process.env.OPENAI_MODEL ?? defaultModel;
  const start = Date.now();

  try {
    let usedModel = primaryModel;
    let usedFallback: string | null = null;

    try {
      await client.responses.create({
        model: primaryModel,
        input: "Hi",
        store: false,
      });
    } catch (err) {
      if (isModelError(err) && primaryModel !== fallbackModel) {
        await client.responses.create({
          model: fallbackModel,
          input: "Hi",
          store: false,
        });
        usedModel = fallbackModel;
        usedFallback = fallbackModel;
      } else {
        throw err;
      }
    }

    const latencyMs = Date.now() - start;
    logOpenAICall({
      endpoint: "ai/health",
      model: usedModel,
      latencyMs,
      success: true,
    });

    return NextResponse.json({
      ...basePayload,
      ok: true,
      model: usedModel,
      fallbackModel: usedFallback,
      latencyMs,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    logOpenAICall({
      endpoint: "ai/health",
      model: primaryModel,
      latencyMs,
      success: false,
      error: errorMessage,
    });
    return NextResponse.json(
      {
        ...basePayload,
        error: "api_error",
        latencyMs,
      },
      { status: 200 }
    );
  }
}
