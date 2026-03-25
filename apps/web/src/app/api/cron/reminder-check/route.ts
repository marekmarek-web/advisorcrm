import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  try {
    const { evaluateDueDatePolicy, createReminder } = await import("@/lib/execution/reminder-engine");
    const { db, contractUploadReviews, reminders, sql } = await import("db");

    const reviews = await db
      .select({
        id: contractUploadReviews.id,
        tenantId: contractUploadReviews.tenantId,
        assignedTo: contractUploadReviews.assignedTo,
        ageHours: sql<number>`extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600`,
      })
      .from(contractUploadReviews)
      .limit(500);

    let created = 0;
    for (const review of reviews) {
      const result = evaluateDueDatePolicy("pending_review", review.ageHours);
      if (!result?.shouldCreate || !review.assignedTo) continue;

      const reminder = createReminder({
        tenantId: review.tenantId,
        reminderType: "pending_review",
        title: result.title,
        description: `Review ${review.id.slice(0, 8)} čeká ${Math.round(review.ageHours)}h`,
        dueAt: new Date(),
        severity: result.severity,
        relatedEntityType: "review",
        relatedEntityId: review.id,
        assignedTo: review.assignedTo,
      });

      try {
        await db.insert(reminders).values({
          tenantId: reminder.tenantId,
          reminderType: reminder.reminderType,
          title: reminder.title,
          description: reminder.description,
          dueAt: reminder.dueAt,
          severity: reminder.severity,
          relatedEntityType: reminder.relatedEntityType,
          relatedEntityId: reminder.relatedEntityId,
          assignedTo: reminder.assignedTo,
          suggestionOrigin: reminder.suggestionOrigin,
          status: reminder.status,
        });
        created++;
      } catch { /* dedup / constraint */ }
    }

    return NextResponse.json({ ok: true, remindersCreated: created });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
