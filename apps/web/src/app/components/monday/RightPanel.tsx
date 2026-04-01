"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { useToast } from "@/app/components/Toast";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { DocumentsSection } from "@/app/dashboard/contacts/[id]/DocumentsSection";
import { createTask } from "@/app/actions/tasks";
import { createMeetingNote, getMeetingNotesFeedForContact } from "@/app/actions/meeting-notes";
import type { MeetingNoteFeedItem } from "@/app/actions/meeting-notes";
import { createEvent } from "@/app/actions/events";
import { User, X, CheckSquare, FileText, Calendar as CalendarIcon, ExternalLink } from "lucide-react";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

export type ActivityEntry = {
  id: string;
  action: string;
  meta?: { columnId?: string; oldValue?: string; newValue?: string; label?: string; partnerName?: string; productName?: string };
  createdAt: string;
  userId?: string;
};

type TabId = "updates" | "files" | "activity";

export type ContactOption = { id: string; firstName: string; lastName: string };

interface RightPanelProps {
  itemId: string;
  itemName: string;
  onClose: () => void;
  getActivity?: (itemId: string) => Promise<ActivityEntry[]>;
  appendActivity?: (itemId: string, entry: Omit<ActivityEntry, "id" | "createdAt">) => void;
  contactId?: string | null;
  contacts?: ContactOption[];
  onContactChange?: (contactId: string | null, contactName: string | null) => void;
  mobileFullScreen?: boolean;
}

function domainLabel(domain: string): string {
  const m: Record<string, string> = {
    board: "Nástěnka",
    hypo: "Hypotéky",
    financial_analysis: "Finanční analýza",
    meeting: "Schůzka",
  };
  return m[domain] ?? domain;
}

function firstLineTitle(text: string, maxLen: number): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const base = line ? line.replace(/^[-*\d.\s]+/, "").slice(0, maxLen) : text.trim().slice(0, maxLen);
  return base.trim() || "Záznam z nástěnky";
}

export function RightPanel({
  itemId,
  itemName,
  onClose,
  getActivity,
  appendActivity,
  contactId,
  contacts = [],
  onContactChange,
  mobileFullScreen,
}: RightPanelProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabId>("updates");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [feedNotes, setFeedNotes] = useState<MeetingNoteFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [smartBusy, setSmartBusy] = useState<"task" | "note" | "event" | "post" | null>(null);

  const loadFeed = useCallback(async () => {
    if (!contactId) {
      setFeedNotes([]);
      return;
    }
    setFeedLoading(true);
    try {
      const list = await getMeetingNotesFeedForContact(contactId);
      setFeedNotes(list);
    } catch {
      setFeedNotes([]);
      showToast("Nepodařilo se načíst zápisky.", "error");
    } finally {
      setFeedLoading(false);
    }
  }, [contactId, showToast]);

  useEffect(() => {
    if (tab === "updates" && contactId) {
      void loadFeed();
    }
  }, [tab, contactId, loadFeed]);

  useEffect(() => {
    if (tab === "activity" && getActivity) {
      setActivityLoading(true);
      getActivity(itemId)
        .then(setActivity)
        .catch(() => setActivity([]))
        .finally(() => setActivityLoading(false));
    }
  }, [itemId, tab, getActivity]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "updates", label: "Příspěvky" },
    { id: "files", label: "Soubory" },
    { id: "activity", label: "Historie změn" },
  ];

  const panelShell =
    mobileFullScreen
      ? "fixed inset-0 z-[var(--z-drawer-panel,101)] w-full max-w-full bg-[color:var(--wp-surface-card)] flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.08)] md:relative md:inset-auto md:z-auto md:h-full md:max-w-[560px] md:w-[min(100%,560px)] md:flex-shrink-0 md:rounded-l-[24px] border-l border-[color:var(--wp-surface-card-border)]"
      : "w-full max-w-[560px] min-w-0 md:w-[min(100%,560px)] flex-shrink-0 border-l border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] flex flex-col h-full shadow-[-4px_0_24px_rgba(0,0,0,0.06)]";

  async function handleSmartPost() {
    const text = draftText.trim();
    if (!text) {
      showToast("Napište text záznamu.", "error");
      return;
    }
    setSmartBusy("post");
    try {
      const id = await createMeetingNote({
        contactId: contactId ?? null,
        meetingAt: new Date().toISOString().slice(0, 16),
        domain: "board",
        content: { obsah: text },
      });
      if (id) {
        appendActivity?.(itemId, { action: "board_post" });
        showToast("Záznam byl uložen do zápisků.", "success");
        setDraftText("");
        await loadFeed();
      } else {
        showToast("Záznam se nepodařilo uložit.", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Uložení se nepodařilo.", "error");
    } finally {
      setSmartBusy(null);
    }
  }

  async function handleSmartTask() {
    const text = draftText.trim();
    if (!text) {
      showToast("Napište text pro úkol.", "error");
      return;
    }
    setSmartBusy("task");
    try {
      const title = firstLineTitle(text, 120);
      const tid = await createTask({
        title,
        description: text,
        contactId: contactId ?? undefined,
      });
      if (tid) {
        appendActivity?.(itemId, { action: "task_created" });
        showToast("Úkol byl vytvořen.", "success");
        setDraftText("");
        router.push("/portal/tasks");
      } else {
        showToast("Úkol se nepodařilo vytvořit.", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Akci se nepodařilo dokončit.", "error");
    } finally {
      setSmartBusy(null);
    }
  }

  async function handleSmartNote() {
    const text = draftText.trim();
    if (!text) {
      showToast("Napište text zápisku.", "error");
      return;
    }
    setSmartBusy("note");
    try {
      const id = await createMeetingNote({
        contactId: contactId ?? null,
        meetingAt: new Date().toISOString().slice(0, 16),
        domain: "board",
        content: { obsah: text },
      });
      if (id) {
        appendActivity?.(itemId, { action: "note_created" });
        showToast("Zápisek byl uložen.", "success");
        setDraftText("");
        await loadFeed();
      } else {
        showToast("Zápisek se nepodařilo uložit.", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Uložení se nepodařilo.", "error");
    } finally {
      setSmartBusy(null);
    }
  }

  async function handleSmartEvent() {
    const text = draftText.trim();
    if (!text) {
      showToast("Napište text nebo název události.", "error");
      return;
    }
    setSmartBusy("event");
    try {
      const title = firstLineTitle(text, 160);
      const start = new Date();
      start.setDate(start.getDate() + 7);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const eid = await createEvent({
        title,
        contactId: contactId ?? undefined,
        eventType: "schuzka",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        notes: text,
      });
      if (eid) {
        appendActivity?.(itemId, { action: "event_created" });
        showToast("Událost byla vytvořena v kalendáři.", "success");
        setDraftText("");
        router.push("/portal/calendar");
      } else {
        showToast("Událost se nepodařilo vytvořit.", "error");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Akci se nepodařilo dokončit.", "error");
    } finally {
      setSmartBusy(null);
    }
  }

  const linkedContactName =
    contactId && contacts.length
      ? (() => {
          const c = contacts.find((x) => x.id === contactId);
          return c ? `${c.firstName} ${c.lastName}`.trim() : itemName;
        })()
      : itemName;

  const briefingHref = contactId ? `/portal/contacts/${contactId}?tab=briefing` : null;

  return (
    <div className={panelShell}>
      {/* Header */}
      <div className="shrink-0 px-4 pt-5 pb-4 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black tracking-tight text-[color:var(--wp-text)] [font-family:var(--font-jakarta),var(--font-primary),system-ui,sans-serif] truncate">
              {itemName}
            </h2>
            <p className="text-xs font-semibold text-[color:var(--wp-text-tertiary)] mt-1">Detail položky nástěnky</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {briefingHref ? (
              <Link
                href={briefingHref}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-card)] transition-colors`}
                title="AI briefing u kontaktu"
                aria-label="Otevřít AI briefing u kontaktu"
              >
                <AiAssistantBrandIcon size={22} variant="colorOnWhite" className="max-h-full max-w-full" />
              </Link>
            ) : (
              <span
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] opacity-40 cursor-not-allowed"
                title="Nejdřív propojte kontakt"
                aria-disabled
              >
                <AiAssistantBrandIcon size={22} variant="colorOnWhite" className="max-h-full max-w-full opacity-70" />
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] transition-colors"
              aria-label="Zavřít detail"
            >
              <X size={22} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* Contact link */}
      {onContactChange && (
        <div className="shrink-0 px-4 py-3 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2">Propojený kontakt</p>
          {contactId ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <span className="text-sm font-semibold text-[color:var(--wp-text)] truncate">{linkedContactName}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/portal/contacts/${contactId}`}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-semibold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)] border border-transparent hover:border-[color:var(--wp-surface-card-border)]"
                >
                  <ExternalLink size={16} aria-hidden />
                  Otevřít kontakt
                </Link>
                <button
                  type="button"
                  onClick={() => onContactChange(null, null)}
                  className="text-sm font-semibold text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] min-h-[44px] px-2"
                >
                  Zrušit vazbu
                </button>
              </div>
            </div>
          ) : (
            <CustomDropdown
              value=""
              onChange={(id) => {
                if (!id) return;
                const c = contacts.find((x) => x.id === id);
                onContactChange(id, c ? `${c.firstName} ${c.lastName}`.trim() : null);
              }}
              options={[{ id: "", label: "— Vyberte kontakt" }, ...contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))]}
              placeholder="— Vyberte kontakt"
              icon={User}
            />
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-[color:var(--wp-surface-card-border)] px-2 gap-0.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-3 text-[13px] font-semibold whitespace-nowrap transition-colors min-h-[44px] rounded-t-lg ${
              tab === t.id
                ? "text-[color:var(--wp-text)] border-b-2 border-[color:var(--brand-main)] -mb-px"
                : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        {tab === "updates" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 p-3 shadow-sm">
              <label htmlFor="board-detail-draft" className="sr-only">
                Text nového záznamu
              </label>
              <textarea
                id="board-detail-draft"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={
                  contactId
                    ? "Zapsat poznámku nebo aktivitu ke klientovi…"
                    : "Propojte kontakt pro ukládání do CRM, nebo použijte akce níže (zápisek lze uložit i bez kontaktu)."
                }
                rows={4}
                className="w-full resize-none rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-3 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-main)]/25"
              />
              <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mt-3 mb-2">Chytré uložení</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!smartBusy}
                  onClick={() => void handleSmartTask()}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <CheckSquare size={14} aria-hidden />
                  Jako úkol
                </button>
                <button
                  type="button"
                  disabled={!!smartBusy}
                  onClick={() => void handleSmartNote()}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-bold bg-sky-500/10 text-sky-800 dark:text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
                >
                  <FileText size={14} aria-hidden />
                  Do zápisků
                </button>
                <button
                  type="button"
                  disabled={!!smartBusy}
                  onClick={() => void handleSmartEvent()}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <CalendarIcon size={14} aria-hidden />
                  Událost v kalendáři
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={!!smartBusy || !draftText.trim()}
                  onClick={() => void handleSmartPost()}
                  className={`${portalPrimaryButtonClassName} min-h-[44px] px-5 text-sm font-bold disabled:opacity-50`}
                >
                  {smartBusy === "post" ? "Ukládám…" : "Přidat příspěvek"}
                </button>
              </div>
            </div>

            {!contactId ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)] text-center py-6 rounded-2xl border border-dashed border-[color:var(--wp-surface-card-border)]">
                Po propojení kontaktu se zde zobrazí zápisky z profilu klienta.
              </p>
            ) : feedLoading ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám příspěvky…</p>
            ) : feedNotes.length === 0 ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)] text-center py-8">Zatím žádné zápisky u tohoto kontaktu.</p>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Poslední zápisky</p>
                <ul className="space-y-3">
                  {feedNotes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-semibold text-[color:var(--wp-text-tertiary)]">
                          {new Date(n.meetingAt).toLocaleString("cs-CZ")} · {domainLabel(n.domain)}
                        </span>
                        <Link
                          href={`/portal/notes?noteId=${encodeURIComponent(n.id)}`}
                          className="text-xs font-bold text-[color:var(--brand-main)] hover:underline min-h-[44px] sm:min-h-0 flex items-center"
                        >
                          Otevřít
                        </Link>
                      </div>
                      {n.preview ? (
                        <p className="text-sm text-[color:var(--wp-text)] leading-relaxed">{n.preview}</p>
                      ) : (
                        <p className="text-sm text-[color:var(--wp-text-secondary)]">Zápisek bez náhledu textu.</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div>
            {!contactId ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)]">
                Pro zobrazení a nahrání souborů propojte položku s kontaktem.
              </p>
            ) : (
              <div className="[&_h2]:sr-only">
                <DocumentsSection contactId={contactId} />
              </div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-3">
            {activityLoading && <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám…</p>}
            {!activityLoading && activity.length === 0 && (
              <p className="text-sm text-[color:var(--wp-text-secondary)]">Zatím žádná historie změn u této položky.</p>
            )}
            {!activityLoading &&
              activity.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 px-3 py-3 text-sm"
                >
                  <span className="text-[color:var(--wp-text)]">
                    {entry.action === "status_change" && "Změna statusu"}
                    {entry.action === "edit" && "Úprava"}
                    {entry.action === "product_change" && "Změna produktu"}
                    {entry.action === "task_created" && "Vytvořen úkol z panelu nástěnky"}
                    {entry.action === "note_created" && "Uložen zápisek z panelu nástěnky"}
                    {entry.action === "event_created" && "Vytvořena událost z panelu nástěnky"}
                    {entry.action === "board_post" && "Přidán příspěvek z panelu nástěnky"}
                    {!["status_change", "edit", "product_change", "task_created", "note_created", "event_created", "board_post"].includes(entry.action) &&
                      entry.action}
                    {entry.meta?.label != null && ` – ${entry.meta.label}`}
                    {entry.meta?.partnerName != null && entry.meta?.productName != null && (
                      <span className="text-[color:var(--wp-text-secondary)]"> – {entry.meta.partnerName} → {entry.meta.productName}</span>
                    )}
                    {entry.meta?.oldValue != null && entry.meta?.newValue != null && (
                      <span className="text-[color:var(--wp-text-secondary)]">
                        {" "}
                        {entry.meta.oldValue} → {entry.meta.newValue}
                      </span>
                    )}
                  </span>
                  <p className="text-[color:var(--wp-text-tertiary)] text-xs mt-1.5">
                    {new Date(entry.createdAt).toLocaleString("cs-CZ")}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
