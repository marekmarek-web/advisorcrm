import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { HouseholdForContact } from "@/app/actions/households";

export function ContactHouseholdCard({
  household,
  className = "",
}: {
  household: HouseholdForContact;
  className?: string;
}) {
  return (
    <div
      className={`bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden group cursor-pointer hover:border-indigo-200 transition-colors ${className}`}
    >
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
          Součást domácnosti
        </h3>
      </div>
      <Link
        href={`/portal/households/${household.id}`}
        className="block p-6"
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--wp-surface-card)] bg-[color:var(--wp-text-secondary)] text-xs font-black text-white">
            {(household.name || "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h4 className="font-bold text-[color:var(--wp-text)] group-hover:text-indigo-600 transition-colors">{household.name}</h4>
            <p className="text-xs font-bold text-[color:var(--wp-text-secondary)]">
              {household.memberCount} {household.memberCount === 1 ? "člen" : household.memberCount >= 2 && household.memberCount <= 4 ? "členové" : "členů"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-[color:var(--wp-surface-card-border)]">
          {household.role && (
            <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">
              Role: <strong className="text-[color:var(--wp-text)]">{household.role}</strong>
            </span>
          )}
          <span className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all">
            Otevřít rodinu <ChevronRight size={14} />
          </span>
        </div>
      </Link>
    </div>
  );
}
