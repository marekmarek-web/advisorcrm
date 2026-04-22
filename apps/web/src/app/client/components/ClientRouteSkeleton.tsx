/**
 * B3.5 — Shared skeleton for per-route `loading.tsx` inside the client portal.
 * Keeps loading states predictable (no layout shift) while RSC streams.
 */
export function ClientRouteSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-6 client-fade-in" aria-busy="true">
      <div className="h-8 w-64 rounded-lg bg-[color:var(--wp-surface-muted)] animate-pulse" aria-label={`Načítám ${title}`} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-28 rounded-[24px] bg-white border border-[color:var(--wp-surface-card-border)] shadow-sm animate-pulse" />
        <div className="h-28 rounded-[24px] bg-white border border-[color:var(--wp-surface-card-border)] shadow-sm animate-pulse" />
        <div className="h-28 rounded-[24px] bg-white border border-[color:var(--wp-surface-card-border)] shadow-sm animate-pulse" />
      </div>
      <div className="space-y-3">
        <div className="h-20 rounded-2xl bg-white border border-[color:var(--wp-surface-card-border)] shadow-sm animate-pulse" />
        <div className="h-20 rounded-2xl bg-white border border-[color:var(--wp-surface-card-border)] shadow-sm animate-pulse" />
        <div className="h-20 rounded-2xl bg-white border border-[color:var(--wp-surface-card-border)] shadow-sm animate-pulse" />
      </div>
    </div>
  );
}
