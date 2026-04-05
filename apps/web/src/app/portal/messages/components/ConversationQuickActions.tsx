"use client";

import { Loader2, Plus, Sparkles } from "lucide-react";
import clsx from "clsx";

const ACTIONS = [
  { id: "ai" as const, label: "Navrhnout odpověď AI", primary: true },
  { id: "meeting" as const, label: "Naplánovat schůzku", primary: false },
  { id: "task" as const, label: "Vytvořit úkol", primary: false },
];

export function ConversationQuickActions({
  onAiSuggest,
  onScheduleMeeting,
  onCreateTask,
  aiBusy,
}: {
  onAiSuggest: () => void;
  onScheduleMeeting: () => void;
  onCreateTask: () => void;
  /** Generuje se návrh AI — primární tlačítko je dočasně neaktivní. */
  aiBusy?: boolean;
}) {
  const handlers = { ai: onAiSuggest, meeting: onScheduleMeeting, task: onCreateTask };

  return (
    <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] px-5 py-3 md:px-6">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={action.primary && aiBusy}
            title={action.primary && aiBusy ? "Generuji návrh…" : undefined}
            onClick={() => handlers[action.id]()}
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
              action.primary && aiBusy && "cursor-not-allowed opacity-60",
              action.primary
                ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100/80 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]",
            )}
          >
            {action.primary && aiBusy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : action.primary ? (
              <Sparkles className="h-4 w-4 shrink-0" />
            ) : (
              <Plus className="h-4 w-4 shrink-0" />
            )}
            {action.primary && aiBusy ? "Generuji…" : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
