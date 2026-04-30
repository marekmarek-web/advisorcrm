import OpenAI from "openai";
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal(process.cwd());

type Surface = "advisor_chat" | "ai_review";

type BenchCase = {
  surface: Surface;
  name: string;
  prompt: string;
  maxOutputTokens: number;
};

type BenchResult = {
  provider: "openai";
  surface: Surface;
  model: string;
  caseName: string;
  latencyMs: number;
  outputChars: number;
  ok: boolean;
  error?: string;
};

const CASES: BenchCase[] = [
  {
    surface: "advisor_chat",
    name: "general-advisor-help",
    maxOutputTokens: 240,
    prompt: [
      "Jsi interní AI asistent v CRM Aidvisora pro finanční poradce.",
      "Výstup je pouze informativní interní podklad pro poradce; nejde o doporučení klientovi.",
      "Uživatel: Jak mi dnes můžeš pomoct v CRM a co umíš zrychlit?",
      "Odpověz stručně v češtině.",
    ].join("\n\n"),
  },
  {
    surface: "advisor_chat",
    name: "contextual-followup",
    maxOutputTokens: 220,
    prompt: [
      "Jsi interní AI asistent v CRM Aidvisora pro finanční poradce.",
      "Uživatel řeší administrativní kontrolu klientské dokumentace.",
      "Uživatel: Sepiš mi krátký postup, co ověřit po nahrání smlouvy do AI Review.",
      "Nepoužívej poradenské formulace směrem ke klientovi.",
    ].join("\n\n"),
  },
  {
    surface: "ai_review",
    name: "structured-extraction-smoke",
    maxOutputTokens: 700,
    prompt: [
      "Jsi extrakční modul pro interní AI Review v CRM Aidvisora.",
      "Z textu vytěž pouze administrativní údaje. Nejde o doporučení klientovi.",
      "TEXT DOKUMENTU:",
      "Smlouva č. 123456, klient Jan Novak, pojistitel Demo pojistovna, produkt Rizikove zivotni pojisteni, pojistne 1200 CZK mesicne, pocatek 01.05.2026.",
      "Vrať JSON se sekcemi documentType, parties, contractNumber, providerName, productName, premium.",
    ].join("\n\n"),
  },
];

function splitEnvList(value: string | undefined, fallback: string[]): string[] {
  const parsed = value?.split(",").map((v) => v.trim()).filter(Boolean) ?? [];
  return parsed.length > 0 ? parsed : fallback;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

async function runOpenAiCase(client: OpenAI, model: string, testCase: BenchCase): Promise<BenchResult> {
  const started = Date.now();
  try {
    const res = await client.responses.create({
      model,
      input: testCase.prompt,
      store: false,
      max_output_tokens: testCase.maxOutputTokens,
    });
    const text = typeof res.output_text === "string" ? res.output_text : "";
    return {
      provider: "openai",
      surface: testCase.surface,
      model,
      caseName: testCase.name,
      latencyMs: Date.now() - started,
      outputChars: text.length,
      ok: true,
    };
  } catch (err) {
    return {
      provider: "openai",
      surface: testCase.surface,
      model,
      caseName: testCase.name,
      latencyMs: Date.now() - started,
      outputChars: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function printSummary(results: BenchResult[]) {
  const groups = new Map<string, BenchResult[]>();
  for (const result of results) {
    const key = `${result.provider}:${result.surface}:${result.model}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  console.log("\nAI performance benchmark summary");
  for (const [key, rows] of groups) {
    const okRows = rows.filter((r) => r.ok);
    const latencies = okRows.map((r) => r.latencyMs);
    console.log(JSON.stringify({
      key,
      runs: rows.length,
      ok: okRows.length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      avgOutputChars: okRows.length
        ? Math.round(okRows.reduce((sum, r) => sum + r.outputChars, 0) / okRows.length)
        : 0,
      errors: rows.filter((r) => !r.ok).map((r) => r.error?.slice(0, 160)),
    }));
  }
}

async function main() {
  const repetitions = Math.max(1, Number(process.env.AI_BENCH_REPETITIONS ?? "2"));
  const advisorChatModels = splitEnvList(process.env.AI_BENCH_ADVISOR_CHAT_MODELS, [
    process.env.OPENAI_MODEL_ADVISOR_CHAT_FAST ??
      process.env.OPENAI_MODEL_ADVISOR_CHAT ??
      process.env.OPENAI_MODEL ??
      "gpt-5-mini",
  ]);
  const advisorIntentModels = splitEnvList(process.env.AI_BENCH_ADVISOR_INTENT_MODELS, [
    process.env.OPENAI_MODEL_ADVISOR_INTENT ??
      process.env.OPENAI_MODEL_ADVISOR_CHAT_FAST ??
      process.env.OPENAI_MODEL_ADVISOR_CHAT ??
      process.env.OPENAI_MODEL ??
      "gpt-5-mini",
  ]);
  const aiReviewModels = splitEnvList(process.env.AI_BENCH_AI_REVIEW_MODELS, [
    process.env.OPENAI_MODEL_AI_REVIEW_DEFAULT ?? process.env.OPENAI_MODEL ?? "gpt-5-mini",
  ]);
  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

  const results: BenchResult[] = [];
  for (let i = 0; i < repetitions; i += 1) {
    for (const testCase of CASES) {
      const models = testCase.surface === "advisor_chat" ? advisorChatModels : aiReviewModels;
      if (openai) {
        for (const model of models) {
          results.push(await runOpenAiCase(openai, model, testCase));
        }
        if (testCase.surface === "advisor_chat") {
          for (const model of advisorIntentModels) {
            results.push(await runOpenAiCase(openai, model, {
              ...testCase,
              name: `intent-${testCase.name}`,
              maxOutputTokens: 160,
            }));
          }
        }
      }
    }
  }

  if (results.length === 0) {
    throw new Error("Není nastaven OPENAI_API_KEY pro OpenAI benchmark.");
  }

  console.log(JSON.stringify({ results }, null, 2));
  printSummary(results);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
