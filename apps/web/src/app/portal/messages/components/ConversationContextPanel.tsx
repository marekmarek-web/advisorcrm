"use client";

import { ChevronRight, Clock3, Loader2, Mail, Phone, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { ContactRow } from "@/app/actions/contacts";
import type { ChatContextPanelSnapshot } from "@/app/actions/messages";
import type { AdvisorChatAiSummary } from "@/lib/advisor-chat/advisor-chat-ai-types";
import {
  calendarNewEventHref,
  contactTabHref,
  notesNewWithContactHref,
  tasksNewWithContactHref,
} from "./advisor-chat-crm-routes";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Nízká priorita",
  normal: "Běžná priorita",
  high: "Vysoká priorita",
  urgent: "Urgentní priorita",
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "E-mail",
  phone: "Telefon",
  sms: "SMS",
  whatsapp: "WhatsApp",
  in_app: "V aplikaci",
};

function priorityLabel(p: string | null | undefined): string | null {
  if (!p?.trim()) return null;
  return PRIORITY_LABELS[p.trim()] ?? p.trim();
}

function channelLabel(ch: string | null | undefined): string | null {
  if (!ch?.trim()) return null;
  return CHANNEL_LABELS[ch.trim().toLowerCase()] ?? ch.trim();
}

export function ConversationContextPanel({
  contactId,
  contactName,
  contact,
  lastMessagePreview,
  lastThreadActivityAt,
  crmSnapshot,
  crmLoading,
  aiSummary,
  aiSummaryLoading,
  aiSummaryError,
  aiSummaryIdleHint,
  onRefreshAiSummary,
  onNavigate,
  asDiv,
  className,
}: {
  contactId: string;
  contactName: string;
  contact: ContactRow | null;
  lastMessagePreview: string;
  lastThreadActivityAt: Date | null;
  crmSnapshot: ChatContextPanelSnapshot | null;
  crmLoading: boolean;
  aiSummary: AdvisorChatAiSummary | null;
  aiSummaryLoading: boolean;
  aiSummaryError: string | null;
  /** Text když není souhrn a neběží načítání (např. záměrně přeskočeno kvůli úspoře API). */
  aiSummaryIdleHint: string | null;
  onRefreshAiSummary: () => void;
  onNavigate: (href: string) => void;
  asDiv?: boolean;
  className?: string;
}) {
  const email = contact?.email?.trim();
  const phone = contact?.phone?.trim();
  const stage = contact?.lifecycleStage?.trim();
  const tags = contact?.tags?.filter(Boolean).slice(0, 4) ?? [];
  const lead = contact?.leadSource?.trim();
  const prio = priorityLabel(contact?.priority ?? null);
  const bestTime = contact?.bestContactTime?.trim();
  const channel = channelLabel(contact?.preferredChannel ?? null);

  const snap = crmSnapshot;

  const metaLine = [stage, tags.length ? tags.join(" · ") : null, lead, prio].filter(Boolean).join(" · ");

  const activityLine = lastThreadActivityAt
    ? `Poslední aktivita v chatu: ${lastThreadActivityAt.toLocaleString("cs-CZ", {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : null;

  type TodoItem = { key: string; label: string; href: string };
  const todoItems: TodoItem[] = [];
  if (snap && snap.pendingMaterialRequestsCount > 0) {
    todoItems.push({
      key: "mat-pending",
      label:
        snap.pendingMaterialRequestsCount === 1
          ? "Vyřídit čekající požadavek na podklady"
          : `Vyřídit požadavky na podklady (${snap.pendingMaterialRequestsCount})`,
      href: contactTabHref(contactId, "podklady"),
    });
  }
  if (snap && snap.overdueTasksCount > 0) {
    todoItems.push({
      key: "tasks-overdue",
      label: `Úkoly po termínu (${snap.overdueTasksCount})`,
      href: contactTabHref(contactId, "ukoly"),
    });
  }
  todoItems.push(
    { key: "mat-new", label: "Vyžádat podklady od klienta", href: contactTabHref(contactId, "podklady") },
    {
      key: "verify",
      label:
        snap && snap.openTasksCount > 0
          ? `Zkontrolovat úkoly (${snap.openTasksCount} otevřených)`
          : "Zkontrolovat úkoly a schůzky",
      href: contactTabHref(contactId, "ukoly"),
    },
    { key: "cal", label: "Naplánovat schůzku", href: calendarNewEventHref(contactId) },
    { key: "task", label: "Vytvořit úkol", href: tasksNewWithContactHref(contactId) },
    { key: "note", label: "Přidat poznámku (zápisek)", href: notesNewWithContactHref(contactId) },
  );

  const Root = asDiv ? "div" : "aside";

  return (
    <Root
      className={clsx(
        "flex min-h-0 flex-col gap-4 overflow-y-auto rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm",
        asDiv && "overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none",
        className,
      )}
    >
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-violet-800 p-5 text-white shadow-sm">
        <div className="text-xs uppercase tracking-[0.16em] text-violet-200">Rychlý kontext</div>
        <div className="mt-2 text-lg font-semibold leading-snug">{contactName}</div>
        {metaLine ? <div className="mt-1 text-sm text-violet-100/90">{metaLine}</div> : null}

        {crmLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-white/80">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Načítám data z CRM…
          </div>
        ) : null}

        {!crmLoading && snap?.primaryOpportunity ? (
          <div className="mt-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm leading-snug">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-200/90">Aktivní obchod / případ</div>
            <p className="mt-1 font-medium text-white">{snap.primaryOpportunity.title}</p>
            <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-white/85">
              {snap.primaryOpportunity.caseType ? <span>Oblast: {snap.primaryOpportunity.caseType}</span> : null}
              <span>Fáze: {snap.primaryOpportunity.stageName}</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(contactTabHref(contactId, "obchody"))}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-100 underline decoration-white/30 underline-offset-2 hover:text-white"
            >
              Otevřít obchody
              <ChevronRight className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ) : null}

        {!crmLoading &&
        snap?.opportunitiesReadable &&
        !snap.primaryOpportunity &&
        snap.openOpportunitiesCount === 0 ? (
          <p className="mt-3 text-sm text-white/80">Žádný otevřený obchod u tohoto klienta.</p>
        ) : null}

        {!crmLoading && snap && snap.opportunitiesReadable && snap.openOpportunitiesCount > 1 ? (
          <p className="mt-2 text-xs text-white/75">Otevřených obchodů celkem: {snap.openOpportunitiesCount}</p>
        ) : null}

        {!crmLoading && snap ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/85">
            {snap.openTasksCount > 0 ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5">Úkoly: {snap.openTasksCount} otevřených</span>
            ) : null}
            {snap.pendingMaterialRequestsCount > 0 ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5">Podklady: {snap.pendingMaterialRequestsCount} čeká</span>
            ) : null}
          </div>
        ) : null}

        {activityLine ? <p className="mt-2 text-xs text-white/70">{activityLine}</p> : null}
        {lastMessagePreview ? (
          <p className="mt-2 line-clamp-3 border-t border-white/10 pt-2 text-sm leading-relaxed text-white/85">{lastMessagePreview}</p>
        ) : null}
      </div>

      <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--wp-text)]">
            <Sparkles className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
            AI kontext
          </div>
          <button
            type="button"
            onClick={onRefreshAiSummary}
            disabled={aiSummaryLoading}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100/80 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-950/50"
          >
            Obnovit
          </button>
        </div>
        {aiSummaryLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-[color:var(--wp-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Shrnuji konverzaci…
          </div>
        ) : aiSummaryError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{aiSummaryError}</p>
        ) : aiSummary ? (
          <dl className="mt-3 space-y-3 text-sm text-[color:var(--wp-text-secondary)]">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">
                Klient řeší
              </dt>
              <dd className="mt-1 leading-snug text-[color:var(--wp-text)]">{aiSummary.clientFocus}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">
                Chybí dodat
              </dt>
              <dd className="mt-1 leading-snug text-[color:var(--wp-text)]">{aiSummary.missing}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">
                Doporučený další krok
              </dt>
              <dd className="mt-1 leading-snug text-[color:var(--wp-text)]">{aiSummary.recommendedNextStep}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--wp-text-secondary)]">
            {aiSummaryIdleHint ?? "Souhrn doplníte kliknutím na Obnovit."}
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4">
        <div className="text-sm font-semibold text-[color:var(--wp-text)]">Co udělat teď</div>
        <div className="mt-3 space-y-2 text-sm text-[color:var(--wp-text-secondary)]">
          {todoItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.href)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl bg-[color:var(--wp-surface-card)] px-3 py-3 text-left shadow-sm transition hover:bg-[color:var(--wp-surface-muted)]"
            >
              <span className="min-w-0 font-medium text-[color:var(--wp-text)]">{item.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4">
        <div className="text-sm font-semibold text-[color:var(--wp-text)]">Kontakt</div>
        <div className="mt-3 space-y-2 text-sm text-[color:var(--wp-text-secondary)]">
          {email ? (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-[color:var(--wp-text-tertiary)]" />
              <a href={`mailto:${email}`} className="truncate text-indigo-600 underline">
                {email}
              </a>
            </div>
          ) : (
            <p className="text-xs text-[color:var(--wp-text-tertiary)]">E-mail není vyplněný.</p>
          )}
          {phone ? (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0 text-[color:var(--wp-text-tertiary)]" />
              <a href={`tel:${phone}`} className="text-indigo-600 underline">
                {phone}
              </a>
            </div>
          ) : (
            <p className="text-xs text-[color:var(--wp-text-tertiary)]">Telefon není vyplněný.</p>
          )}
          <div className="flex items-start gap-2 border-t border-[color:var(--wp-surface-card-border)] pt-2">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--wp-text-tertiary)]" />
            <div className="min-w-0 space-y-1">
              {bestTime ? (
                <p>
                  <span className="font-medium text-[color:var(--wp-text)]">Preferovaný čas: </span>
                  {bestTime}
                </p>
              ) : (
                <p className="text-xs text-[color:var(--wp-text-tertiary)]">Preferovaný čas kontaktu není uveden.</p>
              )}
              {channel ? (
                <p className="text-xs">
                  <span className="font-medium text-[color:var(--wp-text)]">Kanál: </span>
                  {channel}
                </p>
              ) : (
                <p className="text-xs text-[color:var(--wp-text-tertiary)]">Preferovaný kanál není uveden.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Root>
  );
}
