import type { SuggestedNextStepItem } from "./suggested-next-step-types";

/**
 * Když existují strukturované `stepItems`, legacy `suggestedNextSteps` se nesmí rendrovat —
 * jinak by texty typu „balíček obrázků“ šly omylem odeslat jako zpráva.
 */
export function effectiveLegacySuggestedNextSteps(
  steps: string[] | undefined,
  stepItems: SuggestedNextStepItem[] | undefined,
): string[] {
  const hasItems = (stepItems?.length ?? 0) > 0;
  return hasItems ? [] : (steps ?? []);
}

/** Čistá logika kliknutí na strukturovaný doporučený krok (testovatelná bez Reactu). */
export function dispatchSuggestedNextStepItem(
  item: SuggestedNextStepItem,
  handlers: { onSend?: (msg: string) => void; onFocusComposer?: () => void },
): void {
  switch (item.kind) {
    case "send_message":
      handlers.onSend?.(item.label);
      return;
    case "focus_composer":
      handlers.onFocusComposer?.();
      return;
    case "hint":
      return;
  }
}
