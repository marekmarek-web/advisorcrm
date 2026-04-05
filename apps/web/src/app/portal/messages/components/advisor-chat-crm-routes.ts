/** Sdílené cesty z chatu do existujících CRM obrazovek (bez duplicitních detailů). */

export function contactProfileHref(contactId: string): string {
  return `/portal/contacts/${contactId}`;
}

/** Záložka detailu klienta (`contact-detail-tabs`). */
export function contactTabHref(contactId: string, tab: "podklady" | "ukoly" | "obchody" | "zapisky" | "prehled"): string {
  const q = new URLSearchParams({ tab });
  return `/portal/contacts/${contactId}?${q.toString()}`;
}

/** Desktop kalendář — `PortalCalendarView` zpracuje `new=1` a volitelně `contactId`. */
export function calendarNewEventHref(contactId: string): string {
  const q = new URLSearchParams({ new: "1", contactId });
  return `/portal/calendar?${q.toString()}`;
}

/** Úkoly — wizard se otevře s předvyplněným klientem (`tasks/page.tsx`). */
export function tasksNewWithContactHref(contactId: string): string {
  const q = new URLSearchParams({ contactId });
  return `/portal/tasks?${q.toString()}`;
}

/** Zápisky — vision board otevře modal s předvybraným klientem (`NotesVisionBoard`). */
export function notesNewWithContactHref(contactId: string): string {
  const q = new URLSearchParams({ contactId });
  return `/portal/notes?${q.toString()}`;
}

/** Detail kontaktu, záložka Obchody + otevření formuláře nového obchodu (`ContactOpportunityBoard`). */
export function contactNewOpportunityHref(contactId: string): string {
  const q = new URLSearchParams({ tab: "obchody", newOpportunity: "1" });
  return `/portal/contacts/${contactId}?${q.toString()}`;
}
