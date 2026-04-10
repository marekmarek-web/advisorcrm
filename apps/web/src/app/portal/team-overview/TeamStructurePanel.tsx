"use client";

import Link from "next/link";
import clsx from "clsx";
import { Network, UserCircle } from "lucide-react";
import type { TeamOverviewScope, TeamTreeNode } from "@/lib/team-hierarchy-types";

function countDescendants(node: TeamTreeNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}

function findNodeInForest(nodes: TeamTreeNode[], userId: string): TeamTreeNode | null {
  for (const n of nodes) {
    if (n.userId === userId) return n;
    const inner = findNodeInForest(n.children, userId);
    if (inner) return inner;
  }
  return null;
}

function TreeBranch({
  nodes,
  currentUserId,
  depth,
  memberDetailQuery,
  selectedUserId,
  onSelectMember,
}: {
  nodes: TeamTreeNode[];
  currentUserId: string;
  depth: number;
  memberDetailQuery: string;
  selectedUserId?: string | null;
  onSelectMember?: (userId: string) => void;
}) {
  return (
    <ul
      className={clsx(
        "space-y-0.5",
        depth > 0 && "ml-3 sm:ml-4 mt-0.5 border-l border-[color:var(--wp-surface-card-border)] pl-3 sm:pl-4"
      )}
    >
      {nodes.map((node) => {
        const below = countDescendants(node);
        const isSelf = node.userId === currentUserId;
        const isSelected = selectedUserId != null && selectedUserId === node.userId;
        const label = node.displayName?.trim() || node.email || "Člen týmu";
        return (
          <li key={node.userId}>
            <div
              className={clsx(
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl py-2 px-2 -mx-2 text-sm",
                isSelf && "bg-indigo-50 ring-1 ring-indigo-200/80",
                isSelected && "bg-violet-50/90 ring-1 ring-violet-200/80"
              )}
            >
              {isSelf ? (
                <UserCircle className="w-4 h-4 shrink-0 text-indigo-600" aria-hidden />
              ) : null}
              {onSelectMember ? (
                <button
                  type="button"
                  onClick={() => onSelectMember(node.userId)}
                  className={clsx(
                    "font-semibold text-left text-[color:var(--wp-text)] hover:text-indigo-600 hover:underline",
                    isSelected && "text-violet-900"
                  )}
                >
                  {label}
                </button>
              ) : (
                <Link
                  href={`/portal/team-overview/${node.userId}${memberDetailQuery}`}
                  className="font-semibold text-[color:var(--wp-text)] hover:text-indigo-600 hover:underline"
                >
                  {label}
                </Link>
              )}
              <Link
                href={`/portal/team-overview/${node.userId}${memberDetailQuery}`}
                className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--wp-text-tertiary)] hover:text-indigo-600"
                title="Plný detail"
              >
                Detail
              </Link>
              <span className="text-xs text-[color:var(--wp-text-tertiary)]">{node.roleName}</span>
              {below > 0 ? (
                <span className="text-[11px] font-medium rounded-full bg-[color:var(--wp-surface-muted)] px-2 py-0.5 text-[color:var(--wp-text-secondary)]">
                  ve větvi {below}{" "}
                  {below === 1 ? "osoba" : below >= 2 && below <= 4 ? "osoby" : "osob"}
                </span>
              ) : null}
            </div>
            {node.children.length > 0 ? (
              <TreeBranch
                nodes={node.children}
                currentUserId={currentUserId}
                depth={depth + 1}
                memberDetailQuery={memberDetailQuery}
                selectedUserId={selectedUserId}
                onSelectMember={onSelectMember}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TeamStructurePanel({
  roots,
  currentUserId,
  scope,
  memberDetailQuery = "",
  hierarchyParentLinksConfigured = true,
  selectedUserId = null,
  onSelectMember,
}: {
  roots: TeamTreeNode[];
  currentUserId: string;
  scope: TeamOverviewScope;
  /** Např. ?period=month — stejné období jako Team Overview */
  memberDetailQuery?: string;
  /** False = v tenantu není žádný parent_id — „Můj tým“ je omezený (viz banner na přehledu). */
  hierarchyParentLinksConfigured?: boolean;
  /** Výběr člena pro boční panel na přehledu (volitelné). */
  selectedUserId?: string | null;
  onSelectMember?: (userId: string) => void;
}) {
  const selfNode = findNodeInForest(roots, currentUserId);
  const directChildren = selfNode?.children ?? [];

  if (roots.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-2 flex items-center gap-2">
          <Network className="w-5 h-5 text-indigo-500 shrink-0" />
          Struktura týmu
        </h2>
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          V tomto rozsahu zatím nejsou k dispozici žádná data o struktuře. Zkontrolujte nastavení nadřízených v týmu.
        </p>
      </section>
    );
  }

  const isPersonalOnly = scope === "me";

  return (
    <section className="mb-6 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-1 flex items-center gap-2">
        <Network className="w-5 h-5 text-indigo-500 shrink-0" />
        Struktura týmu
      </h2>
      {isPersonalOnly ? (
        <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4">
          Zobrazujete osobní rozsah — struktura odráží jen vás. Širší přehled týmu je dostupný podle vaší role v přepínači rozsahu.
        </p>
      ) : (
        <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4">
          Přehled větví podle nastavených nadřízených. Klik na jméno vybere člena pro souhrn vpravo; odkaz „Detail“ vede na plnou stránku.
        </p>
      )}

      {!isPersonalOnly && !hierarchyParentLinksConfigured ? (
        <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-950 sm:text-sm">
          <span className="font-semibold">Vazby nadřízenosti zatím chybí.</span>{" "}
          Strom může ukázat všechny lidi jako oddělené kořeny — jde o data v CRM, ne o chybu modulu. Doplňte pole nadřízeného u členů v Nastavení → Tým.
        </div>
      ) : null}

      {!isPersonalOnly && directChildren.length > 0 && (
        <div className="mb-4 rounded-xl bg-[color:var(--wp-surface-muted)]/60 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2">
            Přímí spolupracovníci
          </p>
          <div className="flex flex-wrap gap-2">
            {directChildren.map((c) => (
              <span key={c.userId} className="inline-flex items-center gap-1.5">
                {onSelectMember ? (
                  <button
                    type="button"
                    onClick={() => onSelectMember(c.userId)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-1.5 text-sm font-medium text-[color:var(--wp-text)] hover:border-indigo-200 hover:bg-indigo-50/50",
                      selectedUserId === c.userId && "border-violet-300 bg-violet-50/80"
                    )}
                  >
                    {c.displayName?.trim() || c.email || "Člen týmu"}
                    <span className="text-xs text-[color:var(--wp-text-tertiary)]">({c.roleName})</span>
                  </button>
                ) : (
                  <Link
                    href={`/portal/team-overview/${c.userId}${memberDetailQuery}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-1.5 text-sm font-medium text-[color:var(--wp-text)] hover:border-indigo-200 hover:bg-indigo-50/50"
                  >
                    {c.displayName?.trim() || c.email || "Člen týmu"}
                    <span className="text-xs text-[color:var(--wp-text-tertiary)]">({c.roleName})</span>
                  </Link>
                )}
                <Link
                  href={`/portal/team-overview/${c.userId}${memberDetailQuery}`}
                  className="text-[10px] font-semibold text-indigo-600 hover:underline"
                >
                  Detail
                </Link>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[min(24rem,55vh)] overflow-y-auto pr-1 -mr-1">
        <TreeBranch
          nodes={roots}
          currentUserId={currentUserId}
          depth={0}
          memberDetailQuery={memberDetailQuery}
          selectedUserId={selectedUserId}
          onSelectMember={onSelectMember}
        />
      </div>
    </section>
  );
}
