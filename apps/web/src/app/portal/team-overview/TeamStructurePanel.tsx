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
}: {
  nodes: TeamTreeNode[];
  currentUserId: string;
  depth: number;
  memberDetailQuery: string;
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
        const label = node.displayName?.trim() || node.email || "Člen týmu";
        return (
          <li key={node.userId}>
            <div
              className={clsx(
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl py-2 px-2 -mx-2 text-sm",
                isSelf && "bg-indigo-50 ring-1 ring-indigo-200/80"
              )}
            >
              {isSelf ? (
                <UserCircle className="w-4 h-4 shrink-0 text-indigo-600" aria-hidden />
              ) : null}
              <Link
                href={`/portal/team-overview/${node.userId}${memberDetailQuery}`}
                className="font-semibold text-[color:var(--wp-text)] hover:text-indigo-600 hover:underline"
              >
                {label}
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
}: {
  roots: TeamTreeNode[];
  currentUserId: string;
  scope: TeamOverviewScope;
  /** Např. ?period=month — stejné období jako Team Overview */
  memberDetailQuery?: string;
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
          Přehled větví podle nastavených nadřízených. Kliknutím otevřete detail člena.
        </p>
      )}

      {!isPersonalOnly && directChildren.length > 0 && (
        <div className="mb-4 rounded-xl bg-[color:var(--wp-surface-muted)]/60 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2">
            Přímí spolupracovníci
          </p>
          <div className="flex flex-wrap gap-2">
            {directChildren.map((c) => (
              <Link
                key={c.userId}
                href={`/portal/team-overview/${c.userId}${memberDetailQuery}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-1.5 text-sm font-medium text-[color:var(--wp-text)] hover:border-indigo-200 hover:bg-indigo-50/50"
              >
                {c.displayName?.trim() || c.email || "Člen týmu"}
                <span className="text-xs text-[color:var(--wp-text-tertiary)]">({c.roleName})</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[min(24rem,55vh)] overflow-y-auto pr-1 -mr-1">
        <TreeBranch nodes={roots} currentUserId={currentUserId} depth={0} memberDetailQuery={memberDetailQuery} />
      </div>
    </section>
  );
}
