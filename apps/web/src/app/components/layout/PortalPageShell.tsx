"use client";

import clsx from "clsx";

/**
 * Sdílený page shell pro všechny stránky pod `/portal/**`.
 *
 * Cíl: jednotná šířka, padding, pozadí a hlavička napříč portálem.
 *
 * Šířky (max-w):
 * - `standard` → 1200px (default; většina detailních stránek, setup, production, analyses)
 * - `wide`     → 1400px (today, business-plan, tasks)
 * - `full`     → 1600px (list views, email-campaigns, team-overview)
 *
 * Použití:
 * ```tsx
 * <PortalPageShell
 *   title="Nastavení"
 *   description="Spravujte workspace, profil a integrace."
 *   actions={<CreateActionButton label="Uložit" />}
 *   tabs={<PremiumToggleGroup />}
 * >
 *   {pageBody}
 * </PortalPageShell>
 * ```
 *
 * Kdy NEpoužívat: list stránky, které používají `ListPageShell` + `ListPageHeader`
 * (kontakty, domácnosti) – ty mají vlastní (tabulkový) pattern.
 */

export type PortalPageShellWidth = "standard" | "wide" | "full";

export interface PortalPageShellProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  /** Šířka obsahu. Default `standard` (1200px). */
  maxWidth?: PortalPageShellWidth;
  /** Vypne vnitřní vertikální padding (`pt`/`pb`) – pro custom hero sekce. */
  flushTop?: boolean;
  /** Extra třídy na outer wrapperu. */
  outerClassName?: string;
  /** Extra třídy na inner kontejneru. */
  innerClassName?: string;
  children: React.ReactNode;
}

const MAX_WIDTH_CLASS: Record<PortalPageShellWidth, string> = {
  standard: "max-w-[1200px]",
  wide: "max-w-[1400px]",
  full: "max-w-[1600px]",
};

export function PortalPageShell({
  title,
  description,
  actions,
  tabs,
  maxWidth = "standard",
  flushTop = false,
  outerClassName,
  innerClassName,
  children,
}: PortalPageShellProps) {
  const hasHeader = Boolean(title || description || actions || tabs);
  return (
    <div
      className={clsx(
        "min-h-screen bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text)]",
        outerClassName,
      )}
    >
      <div
        className={clsx(
          "mx-auto w-full px-4 sm:px-6 md:px-8",
          !flushTop && "pt-6 pb-6 md:pt-8 md:pb-8",
          MAX_WIDTH_CLASS[maxWidth],
          innerClassName,
        )}
      >
        {hasHeader ? (
          <header className="mb-6 md:mb-8 flex flex-col gap-4">
            {(title || description || actions) && (
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  {title ? (
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[color:var(--wp-text)]">
                      {title}
                    </h1>
                  ) : null}
                  {description ? (
                    <p className="mt-1.5 max-w-2xl text-sm text-[color:var(--wp-text-secondary)]">
                      {description}
                    </p>
                  ) : null}
                </div>
                {actions ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                  </div>
                ) : null}
              </div>
            )}
            {tabs ? <div className="flex min-w-0 flex-wrap items-center gap-2">{tabs}</div> : null}
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
}
