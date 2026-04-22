import type { PresenceTier } from "./chat-format";

export function StatusDot({ tier }: { tier: PresenceTier }) {
  const color =
    tier === "online" ? "bg-emerald-500" : tier === "away" ? "bg-amber-400" : "bg-[color:var(--wp-surface-card-border)]";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} title={tier} />;
}
