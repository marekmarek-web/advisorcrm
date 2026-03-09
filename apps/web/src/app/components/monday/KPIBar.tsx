"use client";

interface KPIBarProps {
  openCasesCount: number;
  potentialDeals: number;
}

export function KPIBar({ openCasesCount, potentialDeals }: KPIBarProps) {
  return (
    <div className="flex items-center gap-6 h-9 px-4 border-b border-monday-border bg-monday-surface shrink-0 text-[13px]">
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
