"use client";

/** Typing / thinking indicator (three bouncing dots). */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span
      className={`wp-typing-dots inline-flex gap-1.5 items-center ${className ?? ""}`}
      role="status"
      aria-label="Načítání"
    >
      <span />
      <span />
      <span />
    </span>
  );
}
