"use client";

import Link from "next/link";
import { ChevronLeft, Plus, User } from "lucide-react";
import { StatusDot } from "./StatusDot";
import type { PresenceTier } from "./chat-format";
import { initialsFromFullName } from "./chat-format";
import { contactProfileHref } from "./advisor-chat-crm-routes";

export function ConversationHeader({
  contactName,
  contactId,
  presenceTier,
  lastActiveLabel,
  onBack,
  onNewAction,
  showMobileBack,
  onOpenContext,
  showContextTrigger,
}: {
  contactName: string;
  contactId: string;
  presenceTier: PresenceTier;
  lastActiveLabel: string;
  onBack: () => void;
  onNewAction: () => void;
  showMobileBack: boolean;
  /** Na užších šířkách bez pravého panelu. */
  onOpenContext?: () => void;
  showContextTrigger?: boolean;
}) {
  const initials = initialsFromFullName(contactName);

  return (
    <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] px-5 py-4 md:px-6 md:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {showMobileBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] lg:hidden"
              aria-label="Zpět na seznam"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-slate-900 to-violet-700 text-xl font-semibold text-white md:h-16 md:w-16 md:rounded-[var(--wp-radius-card)] md:text-2xl">
            {initials.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="truncate text-lg font-semibold tracking-tight text-[color:var(--wp-text)] md:text-[22px]">{contactName}</h2>
              <StatusDot tier={presenceTier} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[color:var(--wp-text-secondary)]">
              <span>Klient</span>
              <span className="text-[color:var(--wp-surface-card-border)]">•</span>
              <span>{lastActiveLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {showContextTrigger && onOpenContext ? (
            <button
              type="button"
              onClick={onOpenContext}
              className="xl:hidden inline-flex items-center rounded-[22px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-2.5 text-sm font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
            >
              Kontext
            </button>
          ) : null}
          <Link
            href={contactProfileHref(contactId)}
            prefetch
            className="inline-flex items-center gap-2 rounded-[22px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-2.5 text-sm font-medium text-[color:var(--wp-text)] shadow-sm hover:bg-[color:var(--wp-surface-muted)] sm:px-5 sm:py-3"
            aria-label={`Profil klienta ${contactName}`}
          >
            <User className="h-4 w-4" />
            Profil
          </Link>
          <button
            type="button"
            onClick={onNewAction}
            className="inline-flex items-center gap-2 rounded-[22px] bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95 sm:px-5 sm:py-3"
          >
            <Plus className="h-4 w-4" />
            Nová akce
          </button>
        </div>
      </div>
    </div>
  );
}
