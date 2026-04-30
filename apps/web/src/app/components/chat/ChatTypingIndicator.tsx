"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export type ChatTypingIndicatorRole = "assistant" | "user";

const STAGGER_S = 0.15;

/**
 * Tři tečky v bublině + popisek (AI asistent nebo odesílající strana).
 */
export function ChatTypingIndicator({
  role = "assistant",
  label,
  leadingSlot,
  trailingSlot,
  className,
}: {
  role?: ChatTypingIndicatorRole;
  label: string;
  /** Vlevo u asistenta (např. ikona značky). */
  leadingSlot?: ReactNode;
  /** Vpravo u uživatele/poradce (např. avatar). */
  trailingSlot?: ReactNode;
  className?: string;
}) {
  const isAssistant = role === "assistant";

  const bubble = (
    <div className={clsx("flex flex-col gap-1", isAssistant ? "items-center" : "items-end")}>
      <div
        className={clsx(
          "inline-flex min-h-[40px] min-w-[64px] items-center justify-center rounded-[20px] border px-3.5 py-2.5",
          isAssistant
            ? "border-[#d1d9e6] bg-[#f0f4f8]"
            : "border-indigo-100 bg-indigo-50 shadow-[0_18px_34px_-30px_rgba(15,23,42,.34)]",
        )}
      >
        <span className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={clsx(
                "chat-typing-dot h-2 w-2 shrink-0 rounded-full",
                isAssistant ? "bg-slate-500" : "bg-indigo-500",
              )}
              style={{ animationDelay: `${i * STAGGER_S}s` }}
            />
          ))}
        </span>
      </div>
      <p
        className={clsx(
          "max-w-[240px] text-[12px] font-semibold leading-snug",
          isAssistant ? "text-center text-slate-600" : "text-right text-indigo-800/90",
        )}
      >
        {label}
      </p>
    </div>
  );

  return (
    <div
      className={clsx(
        "flex gap-3",
        isAssistant ? "justify-start" : "justify-end",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {isAssistant ? leadingSlot : null}
      <div className={clsx("max-w-[85%]", !isAssistant && "flex flex-col items-end")}>{bubble}</div>
      {!isAssistant ? trailingSlot : null}
    </div>
  );
}
