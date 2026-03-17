"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getGenerationById } from "@/lib/ai/ai-generations-repository";
import { db, aiFeedback } from "db";

export type AiFeedbackVerdict = "accepted" | "rejected" | "edited";
export type AiFeedbackActionTaken = "task_created" | "meeting_created" | "deal_created" | "none";

export type CreateAiFeedbackResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Submit feedback for an AI generation. Verifies the generation belongs to the user's tenant.
 */
export async function createAiFeedback(
  generationId: string,
  verdict: AiFeedbackVerdict,
  options?: { actionTaken?: AiFeedbackActionTaken | null; note?: string | null }
): Promise<CreateAiFeedbackResult> {
  try {
    const auth = await requireAuthInAction();
    const generation = await getGenerationById(generationId, auth.tenantId);
    if (!generation) {
      return { ok: false, error: "Generování nenalezeno nebo nemáte oprávnění." };
    }

    const inserted = await db
      .insert(aiFeedback as any)
      .values({
        generationId,
        userId: auth.userId,
        verdict,
        actionTaken: options?.actionTaken ?? null,
        note: options?.note?.trim() || null,
      })
      .returning({ id: aiFeedback.id } as any);
    const row = inserted[0] as { id: string } | undefined;
    const id = row?.id;
    if (!id || typeof id !== "string") return { ok: false, error: "Nepodařilo se uložit feedback." };
    return { ok: true, id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
