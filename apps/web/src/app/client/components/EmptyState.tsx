import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * B3.8 — Sjednocený Empty State napříč klientským portálem.
 *
 * Cíl: stejná hierarchie (ikona, nadpis, popis, CTA) všude, kde je sekce
 * prázdná. Nahrazuje ad-hoc inline karty (viz `requests/page.tsx`,
 * `pozadavky-poradce/page.tsx`, dokumenty, platby).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "info" | "success";
}) {
  const toneClasses =
    tone === "info"
      ? "bg-indigo-50 text-indigo-600 border-indigo-100"
      : tone === "success"
        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
        : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)] border-[color:var(--wp-surface-card-border)]";

  return (
    <div className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-10 text-center space-y-3">
      <div
        className={`mx-auto w-12 h-12 rounded-2xl border grid place-items-center ${toneClasses}`}
      >
        <Icon size={22} />
      </div>
      <p className="text-[color:var(--wp-text)] font-semibold">{title}</p>
      {description && (
        <p className="text-[color:var(--wp-text-secondary)] text-sm max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="pt-2 flex justify-center">{action}</div>}
    </div>
  );
}
