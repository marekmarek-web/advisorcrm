"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db, aiFeedback } from "db";
import { getGenerationById } from "@/lib/ai/ai-generations-repository";

export type FeedbackVerdict = "accepted" | "rejected" | "edited";
export type FeedbackActionTaken = "task_created" | "meeting_created" | "deal_created" | "none";

export async function submitAiFeedback(
  generationId: string,
  verdict: FeedbackVerdict,
  actionTaken?: FeedbackActionTaken | null,
  note?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await requireAuthInAction();
    const generation = await getGenerationById(generationId, auth.tenantId);
    if (!generation) {
      return { ok: false, error: "Generace nenalezena nebo nemáte oprávnění." };
    }

    await db.insert(aiFeedback).values({
      generationId,
      userId: auth.userId,
      verdict,
      actionTaken: actionTaken ?? null,
      note: note?.trim() || null,
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
