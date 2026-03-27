"use client";

interface KPIBarProps {
  openCasesCount: number;
  potentialDeals: number;
}

export function KPIBar({ openCasesCount, potentialDeals }: KPIBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-6 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60 px-3 text-[13px]">
      <span className="text-monday-text-muted">
        <strong className="text-monday-text">Otevřené případy:</strong> {openCasesCount}
      </span>
      <span className="text-monday-text-muted">
        <strong className="text-monday-text">Potenciální obchody:</strong>{" "}
        <span className="text-amber-600 font-semibold">{potentialDeals}</span>
      </span>
    </div>
  );
}
