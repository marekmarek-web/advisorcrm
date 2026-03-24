/**
 * Follow-up recommendation engine (Plan 5C.3).
 * Rule-based suggestions with dedup and dismiss/snooze support.
 */

export type FollowUpSuggestionType =
  | "review_waiting_too_long"
  | "payment_setup_blocked"
  | "client_no_followup"
  | "change_document_unresolved"
  | "apply_candidate_ready";

export type FollowUpSeverity = "high" | "medium" | "low";

export type FollowUpSuggestion = {
  type: FollowUpSuggestionType;
  severity: FollowUpSeverity;
  title: string;
  description: string;
  entityLinks: { type: string; id: string }[];
  suggestedAction: string;
  dueHint?: string;
  reasonCodes: string[];
};

type DedupeEntry = {
  key: string;
  createdAt: number;
  dismissed: boolean;
  snoozedUntil?: number;
};

const dedupeStore = new Map<string, DedupeEntry>();
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function dedupeKey(type: string, entityId: string): string {
  return `${type}:${entityId}`;
}

function isDuplicate(type: string, entityId: string): boolean {
  const key = dedupeKey(type, entityId);
  const entry = dedupeStore.get(key);
  if (!entry) return false;
  if (entry.dismissed) return true;
  if (entry.snoozedUntil && Date.now() < entry.snoozedUntil) return true;
  if (Date.now() - entry.createdAt < DEDUP_WINDOW_MS) return true;
  dedupeStore.delete(key);
  return false;
}

function recordSuggestion(type: string, entityId: string): void {
  const key = dedupeKey(type, entityId);
  dedupeStore.set(key, { key, createdAt: Date.now(), dismissed: false });
}

export function dismissSuggestion(type: string, entityId: string): void {
  const key = dedupeKey(type, entityId);
  const entry = dedupeStore.get(key);
  if (entry) {
    entry.dismissed = true;
  } else {
    dedupeStore.set(key, { key, createdAt: Date.now(), dismissed: true });
  }
}

export function snoozeSuggestion(type: string, entityId: string, hours: number): void {
  const key = dedupeKey(type, entityId);
  const until = Date.now() + hours * 60 * 60 * 1000;
  const entry = dedupeStore.get(key);
  if (entry) {
    entry.snoozedUntil = until;
  } else {
    dedupeStore.set(key, { key, createdAt: Date.now(), dismissed: false, snoozedUntil: until });
  }
}

export type FollowUpDataSources = {
  pendingReviews: { id: string; fileName: string; createdAt: Date; daysOld: number }[];
  blockedPayments: { id: string; contactId: string; title: string; reasons: string[] }[];
  clientsWithoutFollowup: { id: string; name: string; daysSinceContact: number }[];
  changeDocuments: { id: string; fileName: string; resolved: boolean }[];
  readyForApply: { id: string; fileName: string; readiness: string }[];
};

const REVIEW_PENDING_THRESHOLD_DAYS = 3;
const CLIENT_NO_FOLLOWUP_THRESHOLD_DAYS = 14;

export function generateFollowUpSuggestions(
  data: FollowUpDataSources,
): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = [];

  for (const r of data.pendingReviews) {
    if (r.daysOld >= REVIEW_PENDING_THRESHOLD_DAYS && !isDuplicate("review_waiting_too_long", r.id)) {
      suggestions.push({
        type: "review_waiting_too_long",
        severity: r.daysOld >= 7 ? "high" : "medium",
        title: `Review čeká ${r.daysOld} dní: ${r.fileName}`,
        description: "Smlouva čeká na review déle než obvykle.",
        entityLinks: [{ type: "review", id: r.id }],
        suggestedAction: "Otevřít a zkontrolovat review.",
        dueHint: "co nejdříve",
        reasonCodes: ["REVIEW_PENDING_OLD"],
      });
      recordSuggestion("review_waiting_too_long", r.id);
    }
  }

  for (const p of data.blockedPayments) {
    if (!isDuplicate("payment_setup_blocked", p.id)) {
      suggestions.push({
        type: "payment_setup_blocked",
        severity: "high",
        title: `Blokovaná platba: ${p.title}`,
        description: `Důvody: ${p.reasons.join(", ")}.`,
        entityLinks: [{ type: "payment", id: p.id }, { type: "client", id: p.contactId }],
        suggestedAction: "Vyžádat chybějící údaje od klienta.",
        reasonCodes: p.reasons,
      });
      recordSuggestion("payment_setup_blocked", p.id);
    }
  }

  for (const c of data.clientsWithoutFollowup) {
    if (c.daysSinceContact >= CLIENT_NO_FOLLOWUP_THRESHOLD_DAYS && !isDuplicate("client_no_followup", c.id)) {
      suggestions.push({
        type: "client_no_followup",
        severity: c.daysSinceContact >= 30 ? "high" : "medium",
        title: `${c.name} – ${c.daysSinceContact} dní bez kontaktu`,
        description: "Klient nebyl kontaktován delší dobu.",
        entityLinks: [{ type: "client", id: c.id }],
        suggestedAction: "Připravit follow-up email nebo naplánovat schůzku.",
        dueHint: "tento týden",
        reasonCodes: ["CLIENT_NO_FOLLOWUP"],
      });
      recordSuggestion("client_no_followup", c.id);
    }
  }

  for (const d of data.changeDocuments) {
    if (!d.resolved && !isDuplicate("change_document_unresolved", d.id)) {
      suggestions.push({
        type: "change_document_unresolved",
        severity: "medium",
        title: `Změnový dokument nevyřešen: ${d.fileName}`,
        description: "Změnový dokument čeká na zpracování.",
        entityLinks: [{ type: "review", id: d.id }],
        suggestedAction: "Vytvořit úkol pro zpracování změny.",
        reasonCodes: ["CHANGE_UNRESOLVED"],
      });
      recordSuggestion("change_document_unresolved", d.id);
    }
  }

  for (const a of data.readyForApply) {
    if (a.readiness === "ready_for_apply" && !isDuplicate("apply_candidate_ready", a.id)) {
      suggestions.push({
        type: "apply_candidate_ready",
        severity: "low",
        title: `Připraveno k apply: ${a.fileName}`,
        description: "Review prošla kvalitní bránou a je připravena k aplikaci.",
        entityLinks: [{ type: "review", id: a.id }],
        suggestedAction: "Aplikovat do CRM.",
        reasonCodes: ["APPLY_READY"],
      });
      recordSuggestion("apply_candidate_ready", a.id);
    }
  }

  return suggestions.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}

export function clearDedupeStore(): void {
  dedupeStore.clear();
}
