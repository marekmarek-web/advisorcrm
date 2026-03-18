"use server";

import { db, aiGenerations } from "db";
import { eq, and, desc } from "db";
import type { ContextCompleteness } from "@/lib/ai/context/completeness";

export type AiGenerationRow = {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  promptType: string;
  promptId: string;
  promptVersion: string | null;
  generatedByUserId: string;
  outputText: string;
  createdAt: Date;
  status: string;
  contextHash: string | null;
};

export async function saveGeneration(params: {
  tenantId: string;
  entityType: string;
  entityId: string;
  promptType: string;
  promptId: string;
  promptVersion?: string | null;
  generatedByUserId: string;
  outputText: string;
  status: "success" | "failure";
  contextHash?: string | null;
  contextMeta?: Pick<
    ContextCompleteness,
    "overall" | "missingAreas" | "outdatedAreas" | "flags"
  > | null;
}): Promise<string> {
  const serializedContextMeta =
    params.contextMeta != null ? JSON.stringify(params.contextMeta) : null;
  const [row] = await db
    .insert(aiGenerations)
    .values({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      promptType: params.promptType,
      promptId: params.promptId,
      promptVersion: params.promptVersion ?? null,
      generatedByUserId: params.generatedByUserId,
      outputText: params.outputText,
      status: params.status,
      contextHash: params.contextHash ?? serializedContextMeta ?? null,
    })
    .returning({ id: aiGenerations.id });
  if (!row?.id) throw new Error("Failed to save AI generation");
  return row.id;
}

export async function getLatestGeneration(
  tenantId: string,
  entityType: string,
  entityId: string,
  promptType: string
): Promise<AiGenerationRow | null> {
  const rows = await db
    .select()
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.tenantId, tenantId),
        eq(aiGenerations.entityType, entityType),
        eq(aiGenerations.entityId, entityId),
        eq(aiGenerations.promptType, promptType)
      )
    )
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    entityType: row.entityType,
    entityId: row.entityId,
    promptType: row.promptType,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    generatedByUserId: row.generatedByUserId,
    outputText: row.outputText,
    createdAt: row.createdAt,
    status: row.status,
    contextHash: row.contextHash,
  };
}

export async function getGenerationById(
  generationId: string,
  tenantId: string
): Promise<AiGenerationRow | null> {
  const rows = await db
    .select()
    .from(aiGenerations)
    .where(
      and(eq(aiGenerations.id, generationId), eq(aiGenerations.tenantId, tenantId))
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    entityType: row.entityType,
    entityId: row.entityId,
    promptType: row.promptType,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    generatedByUserId: row.generatedByUserId,
    outputText: row.outputText,
    createdAt: row.createdAt,
    status: row.status,
    contextHash: row.contextHash,
  };
}
