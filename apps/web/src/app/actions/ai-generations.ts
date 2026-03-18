"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getContact } from "@/app/actions/contacts";
import { getEvent } from "@/app/actions/events";
import {
  generateClientSummary,
  generateClientOpportunities,
  generateNextBestAction,
  generatePreMeetingBriefing,
  generatePostMeetingFollowup,
} from "@/lib/ai/ai-service";
import { getLatestGeneration } from "@/lib/ai/ai-generations-repository";
import {
  createAiFeedback,
  type AiFeedbackVerdict,
  type AiFeedbackActionTaken,
  type CreateAiFeedbackResult,
} from "@/app/actions/ai-feedback";

export type ResultOk = { ok: true; text: string; generationId?: string };
export type ResultErr = { ok: false; error: string; generationId?: string };
export type GenResult = ResultOk | ResultErr;

/** Submit feedback for an AI generation (alias for createAiFeedback). */
export async function submitAiFeedbackAction(
  generationId: string,
  verdict: AiFeedbackVerdict,
  options?: { actionTaken?: AiFeedbackActionTaken | null; note?: string | null }
): Promise<CreateAiFeedbackResult> {
  return createAiFeedback(generationId, verdict, options);
}

export type { AiFeedbackVerdict, AiFeedbackActionTaken, CreateAiFeedbackResult };

function ensureContactAccess(contactId: string): Promise<void> {
  return (async () => {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client") {
      if (!auth.contactId || auth.contactId !== contactId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }
    const contact = await getContact(contactId);
    if (!contact) throw new Error("Kontakt nenalezen");
  })();
}

export async function generateClientSummaryAction(contactId: string): Promise<GenResult> {
  try {
    const auth = await requireAuthInAction();
    await ensureContactAccess(contactId);
    return await generateClientSummary(contactId, auth.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message === "Kontakt nenalezen") {
      return { ok: false, error: message };
    }
    return { ok: false, error: "Generování se nepovedlo. Zkuste to později." };
  }
}

export async function generateClientOpportunitiesAction(contactId: string): Promise<GenResult> {
  try {
    const auth = await requireAuthInAction();
    await ensureContactAccess(contactId);
    return await generateClientOpportunities(contactId, auth.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message === "Kontakt nenalezen") {
      return { ok: false, error: message };
    }
    return { ok: false, error: "Generování se nepovedlo. Zkuste to později." };
  }
}

export async function generateNextBestActionAction(contactId: string): Promise<GenResult> {
  try {
    const auth = await requireAuthInAction();
    await ensureContactAccess(contactId);
    return await generateNextBestAction(contactId, auth.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message === "Kontakt nenalezen") {
      return { ok: false, error: message };
    }
    return { ok: false, error: "Generování se nepovedlo. Zkuste to později." };
  }
}

export async function generatePreMeetingBriefingAction(
  contactId: string,
  eventId?: string | null
): Promise<GenResult> {
  try {
    const auth = await requireAuthInAction();
    await ensureContactAccess(contactId);
    if (eventId) {
      const ev = await getEvent(eventId);
      if (ev && ev.contactId !== contactId) return { ok: false, error: "Forbidden" };
    }
    return await generatePreMeetingBriefing(contactId, auth.userId, eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message === "Kontakt nenalezen") {
      return { ok: false, error: message };
    }
    return { ok: false, error: "Generování se nepovedlo. Zkuste to později." };
  }
}

export async function generatePostMeetingFollowupAction(
  contactId: string,
  meetingNotes: string,
  meetingId?: string | null
): Promise<GenResult> {
  try {
    const auth = await requireAuthInAction();
    await ensureContactAccess(contactId);
    return await generatePostMeetingFollowup(
      contactId,
      auth.userId,
      meetingNotes,
      meetingId
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden" || message === "Kontakt nenalezen") {
      return { ok: false, error: message };
    }
    return { ok: false, error: "Generování se nepovedlo. Zkuste to později." };
  }
}

export type ClientGenerationItem = {
  promptType: string;
  outputText: string;
  createdAt: Date;
  id: string;
};

export async function getLatestClientGenerations(
  contactId: string
): Promise<{
  clientSummary: ClientGenerationItem | null;
  clientOpportunities: ClientGenerationItem | null;
  nextBestAction: ClientGenerationItem | null;
}> {
  try {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client") {
      if (!auth.contactId || auth.contactId !== contactId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }

    const [s, o, n] = await Promise.all([
      getLatestGeneration(auth.tenantId, "contact", contactId, "clientSummary"),
      getLatestGeneration(auth.tenantId, "contact", contactId, "clientOpportunities"),
      getLatestGeneration(auth.tenantId, "contact", contactId, "nextBestAction"),
    ]);

    const toItem = (r: Awaited<ReturnType<typeof getLatestGeneration>>): ClientGenerationItem | null =>
      r && r.status === "success"
        ? {
            promptType: r.promptType,
            outputText: r.outputText,
            createdAt: r.createdAt,
            id: r.id,
          }
        : null;

    return {
      clientSummary: toItem(s),
      clientOpportunities: toItem(o),
      nextBestAction: toItem(n),
    };
  } catch {
    return {
      clientSummary: null,
      clientOpportunities: null,
      nextBestAction: null,
    };
  }
}

export type MeetingGenerationItem = {
  promptType: string;
  outputText: string;
  createdAt: Date;
  id: string;
} | null;

export async function getLatestMeetingGeneration(
  entityType: "event" | "meeting_note",
  entityId: string,
  promptType: "preMeetingBriefing" | "postMeetingFollowup"
): Promise<MeetingGenerationItem> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:read")) return null;
    const r = await getLatestGeneration(auth.tenantId, entityType, entityId, promptType);
    if (!r || r.status !== "success") return null;
    return {
      promptType: r.promptType,
      outputText: r.outputText,
      createdAt: r.createdAt,
      id: r.id,
    };
  } catch {
    return null;
  }
}

/** Get latest AI generation for any entity and prompt type. Auth + tenant scoped. */
export async function getLatestGenerationAction(
  entityType: string,
  entityId: string,
  promptType: string
): Promise<ClientGenerationItem | null> {
  try {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client") return null;
    if (!hasPermission(auth.roleName, "contacts:read")) return null;
    const r = await getLatestGeneration(auth.tenantId, entityType, entityId, promptType);
    if (!r || r.status !== "success") return null;
    return {
      promptType: r.promptType,
      outputText: r.outputText,
      createdAt: r.createdAt,
      id: r.id,
    };
  } catch {
    return null;
  }
}

/** Latest pre-meeting briefing for a contact (optionally for a specific event). */
export async function getLatestPreMeetingBriefing(
  contactId: string,
  eventId?: string | null
): Promise<MeetingGenerationItem> {
  try {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client" && auth.contactId !== contactId) return null;
    if (auth.roleName !== "Client" && !hasPermission(auth.roleName, "contacts:read")) return null;
    const entityType = eventId ? "event" : "contact";
    const entityId = eventId ?? contactId;
    const r = await getLatestGeneration(auth.tenantId, entityType, entityId, "preMeetingBriefing");
    if (!r || r.status !== "success") return null;
    return {
      promptType: r.promptType,
      outputText: r.outputText,
      createdAt: r.createdAt,
      id: r.id,
    };
  } catch {
    return null;
  }
}
