"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  User,
  Users,
  Briefcase,
  Map,
  MoreHorizontal,
  ArrowRight,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import type { ClientMapItem, FreeMapItem } from "@/app/actions/mindmap";
import {
  createStandaloneMap,
  renameStandaloneMap,
  deleteStandaloneMap,
  duplicateStandaloneMap,
} from "@/app/actions/mindmap";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

function formatUpdated(updatedAt: Date): string {
  const d = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return `Dnes, ${d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return `Včera, ${d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays < 7) return `Před ${diffDays} dny`;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

function getEntityKindStyle(kind: ClientMapItem["entityKind"]): { bg: string; text: string; icon: ReactNode } {
  switch (kind) {
    case "Klient":
      return {
        bg: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:border-emerald-500/30 dark:bg-emerald-950/45 dark:text-emerald-200",
        text: "text-emerald-700 dark:text-emerald-200",
        icon: <User size={16} />,
      };
    case "Domácnost":
      return {
        bg: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:border-indigo-500/30 dark:bg-indigo-950/45 dark:text-indigo-200",
        text: "text-indigo-700 dark:text-indigo-200",
        icon: <Users size={16} />,
      };
    case "Klient (Podnikatel)":
      return {
        bg: "bg-blue-100 text-blue-700 border-blue-200 dark:border-blue-500/30 dark:bg-blue-950/45 dark:text-blue-200",
        text: "text-blue-700 dark:text-blue-200",
        icon: <Briefcase size={16} />,
      };
    default:
      return {
        bg: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]",
        text: "text-[color:var(--wp-text-secondary)]",
        icon: <User size={16} />,
      };
  }
}

export function MindmapListClient({
  clientMaps,
  standaloneMaps,
  onRefresh,
}: {
  clientMaps: ClientMapItem[];
  standaloneMaps: FreeMapItem[];
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [newMapName, setNewMapName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const totalCount = clientMaps.length + standaloneMaps.length;

  const filteredClientMaps = useMemo(() => {
    if (!searchQuery.trim()) return clientMaps;
    const q = searchQuery.trim().toLowerCase();
    return clientMaps.filter(
      (m) =>
        m.entityName.toLowerCase().includes(q) || m.entityKind.toLowerCase().includes(q)
    );
  }, [clientMaps, searchQuery]);

  const filteredStandaloneMaps = useMemo(() => {
    if (!searchQuery.trim()) return standaloneMaps;
    const q = searchQuery.trim().toLowerCase();
    return standaloneMaps.filter((m) => m.name.toLowerCase().includes(q));
  }, [standaloneMaps, searchQuery]);

  async function handleCreateStandaloneMap(nameFromInput?: string) {
    const name = (nameFromInput ?? newMapName).trim() || "Nová mapa";
    setCreating(true);
    setError(null);
    try {
      const { mapId } = await createStandaloneMap(name);
      router.refresh();
      setNewMapName("");
      router.push(`/portal/mindmap/${mapId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se vytvořit mapu");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(mapId: string, currentName: string) {
    setOpenMenuId(null);
    const newName = window.prompt("Nový název mapy:", currentName);
    if (newName == null || newName.trim() === "") return;
    setRenamingId(mapId);
    setError(null);
    try {
      await renameStandaloneMap(mapId, newName.trim());
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se přejmenovat");
    } finally {
      setRenamingId(null);
    }
  }

  async function handleDelete(mapId: string) {
    setOpenMenuId(null);
    if (!confirm("Opravdu chcete smazat tuto mapu? Akci nelze vrátit.")) return;
    setDeletingId(mapId);
    setError(null);
    try {
      await deleteStandaloneMap(mapId);
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se smazat");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDuplicate(mapId: string) {
    setOpenMenuId(null);
    setDuplicatingId(mapId);
    setError(null);
    try {
      const { mapId: newId } = await duplicateStandaloneMap(mapId);
      onRefresh?.();
      router.push(`/portal/mindmap/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se duplikovat");
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--wp-main-scroll-bg)] pb-20">
      <style>{`
        .mindmap-hub-bg {
          background-image:
            linear-gradient(to right, rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        html.dark .mindmap-hub-bg {
          background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
        }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <main className="max-w-[1200px] mx-auto p-4 sm:p-6 md:p-8 mindmap-hub-bg min-h-[calc(100vh-73px)]">
        {/* Hlavička stránky */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-[color:var(--wp-text)] tracking-tight">
                Mindmap
              </h1>
              <span className="px-3 py-1 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] text-xs font-black rounded-lg border border-[color:var(--wp-surface-card-border)]">
                {totalCount} celkem
              </span>
            </div>
            <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
              Klientské a libovolné mapy. Přehled, vyhledávání a rychlý přístup k editoru.
            </p>
          </div>
          <CreateActionButton
            type="button"
            onClick={() => handleCreateStandaloneMap()}
            isLoading={creating}
          >
            {creating ? "Vytvářím…" : "Nová mapa"}
          </CreateActionButton>
        </div>

        {/* Hlavní vyhledávání */}
        <div className="mb-8 md:mb-10">
          <div className="relative bg-[color:var(--wp-surface-card)] rounded-3xl border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
            <Search
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] pointer-events-none"
            />
            <input
              type="search"
              placeholder="Hledat podle názvu mapy, klienta, domácnosti…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-5 py-3.5 text-sm font-medium text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 border-0 min-h-[52px]"
              aria-label="Hledat mapy"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
            <button type="button" onClick={() => setError(null)} className="font-bold hover:underline">
              Zavřít
            </button>
          </div>
        )}

        {/* Sekce 1 – Nedávno upravené klientské mapy */}
        <section className="mb-10 sm:mb-12">
          <h2 className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-4 flex items-center gap-2">
            <Map size={14} />
            Nedávno upravené klientské mapy
          </h2>
          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
            {filteredClientMaps.length === 0 ? (
              <div className="px-6 py-10 text-center text-[color:var(--wp-text-secondary)] text-sm">
                {clientMaps.length === 0
                  ? "Zatím žádné klientské mapy. Otevřete mapu u klienta nebo domácnosti a uložte ji."
                  : "Žádné výsledky pro hledaný výraz."}
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--wp-surface-card-border)]" role="list">
                {filteredClientMaps.map((m) => {
                  const style = getEntityKindStyle(m.entityKind);
                  return (
                    <li key={`${m.entityType}-${m.entityId}`}>
                      <Link
                        href={m.openRoute}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:p-5 hover:bg-[color:var(--wp-surface-muted)]/80 transition-all duration-200 group"
                      >
                        <div
                          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 border ${style.bg}`}
                        >
                          {style.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-bold text-[color:var(--wp-text)] transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                            {m.entityName}
                          </h3>
                          <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider mt-0.5">
                            {m.entityKind}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                          <span className="text-xs font-bold text-[color:var(--wp-text-tertiary)] uppercase tracking-wider">
                            {m.nodeCount} uzlů
                          </span>
                          <span className="text-xs font-medium text-[color:var(--wp-text-secondary)]">
                            {formatUpdated(m.updatedAt)}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-[color:var(--wp-surface-muted)] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-secondary)] transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:group-hover:bg-indigo-950/50 dark:group-hover:text-indigo-200">
                            <ArrowRight size={14} />
                            Otevřít
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Sekce 2 – Libovolné mapy */}
        <section>
          <h2 className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-4 flex items-center gap-2">
            <Map size={14} />
            Libovolné mapy
          </h2>

          {/* Inline vytvoření */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Název nové mapy"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateStandaloneMap(newMapName)}
              className="flex-1 min-w-[200px] max-w-md rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 bg-[color:var(--wp-surface-card)] shadow-sm min-h-[44px]"
            />
            <button
              type="button"
              onClick={() => handleCreateStandaloneMap(newMapName)}
              disabled={creating}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-sm font-bold shadow-sm hover:bg-[color:var(--wp-surface-muted)] hover:border-indigo-200 transition-all min-h-[44px] disabled:opacity-50"
            >
              <Plus size={16} />
              {creating ? "Vytvářím…" : "Nová mapa"}
            </button>
          </div>

          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
            {filteredStandaloneMaps.length === 0 ? (
              <div className="p-8 sm:p-12 text-center border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-2xl bg-[color:var(--wp-surface-muted)]/50 mx-4 my-6 sm:mx-6 sm:my-8">
                <div className="w-16 h-16 bg-[color:var(--wp-surface-card)] rounded-2xl flex items-center justify-center text-[color:var(--wp-text-tertiary)] mx-auto mb-4 shadow-sm">
                  <Map size={32} />
                </div>
                <h3 className="text-lg font-bold text-[color:var(--wp-text-secondary)] mb-2">Zatím žádné libovolné mapy</h3>
                <p className="text-sm text-[color:var(--wp-text-secondary)] mb-6">
                  Vytvořte mapu výše (brainstorming, projekty, schůzky) nebo otevřete mapu u klienta.
                </p>
                <button
                  type="button"
                  onClick={() => handleCreateStandaloneMap()}
                  disabled={creating}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-sm font-bold shadow-sm hover:bg-[color:var(--wp-surface-muted)] transition-all"
                >
                  <Plus size={16} />
                  Nová mapa
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--wp-surface-card-border)]" role="list">
                {filteredStandaloneMaps.map((m) => (
                  <li key={m.id} className="group">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:p-5 hover:bg-[color:var(--wp-surface-muted)]/80 transition-all duration-200">
                      <Link href={`/portal/mindmap/${m.id}`} className="min-w-0 flex-1">
                        <h3 className="truncate font-bold text-[color:var(--wp-text)] transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                          {m.name}
                        </h3>
                        <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] mt-0.5">
                          {formatUpdated(m.updatedAt)}
                          {m.nodeCount > 0 && ` · ${m.nodeCount} uzlů`}
                        </p>
                      </Link>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                          href={`/portal/mindmap/${m.id}`}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[color:var(--wp-surface-muted)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-secondary)] transition-colors hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-200"
                        >
                          <ArrowRight size={14} />
                          Otevřít
                        </Link>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                            className="p-2.5 rounded-xl text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors min-h-[44px] min-w-[44px]"
                            aria-label="Další akce"
                            aria-expanded={openMenuId === m.id}
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {openMenuId === m.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                aria-hidden
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] py-1 shadow-lg dark:shadow-black/40">
                                <Link
                                  href={`/portal/mindmap/${m.id}`}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg"
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  <ArrowRight size={14} />
                                  Otevřít
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleRename(m.id, m.name)}
                                  disabled={renamingId === m.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg disabled:opacity-50"
                                >
                                  <Pencil size={14} />
                                  Přejmenovat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicate(m.id)}
                                  disabled={duplicatingId === m.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg disabled:opacity-50"
                                >
                                  <Copy size={14} />
                                  Duplikovat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(m.id)}
                                  disabled={deletingId === m.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/45"
                                >
                                  <Trash2 size={14} />
                                  Smazat
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
