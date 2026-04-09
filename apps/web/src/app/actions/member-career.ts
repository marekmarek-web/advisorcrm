"use server";

import type { CareerEvaluationResult } from "@/lib/career/types";
import { getTeamMemberDetail } from "./team-overview";

/**
 * Vrátí výsledek evaluace kariéry pro člena — stejná viditelnost a pravidla jako getTeamMemberDetail.
 * Pro detail stránky je výsledek už v TeamMemberDetail.careerEvaluation; tato akce je pro samostatné volání.
 */
export async function getCareerEvaluationForMember(userId: string): Promise<CareerEvaluationResult | null> {
  const detail = await getTeamMemberDetail(userId);
  return detail?.careerEvaluation ?? null;
}
