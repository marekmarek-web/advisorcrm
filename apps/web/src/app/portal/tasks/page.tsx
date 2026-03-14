"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getTasksList,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  reopenTask,
  type TaskRow,
} from "@/app/actions/tasks";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { ContactSearchInput } from "@/app/components/ContactSearchInput";
import { EmptyState } from "@/app/components/EmptyState";
import { SkeletonLine } from "@/app/components/Skeleton";
import { SwipeTaskItem } from "@/app/components/SwipeTaskItem";
import {
  CheckCircle2,
  Circle,
  Calendar,
  User,
  Plus,
  Search,
  MoreVertical,
  AlertCircle,
  Target,
  Settings,
} from "lucide-react";

type Filter = "all" | "today" | "week" | "overdue" | "completed";

const FILTERS: { key: Filter; label: string; shortLabel: string }[] = [
  { key: "all", label: "Vše", shortLabel: "Vše" },
  { key: "today", label: "Dnes", shortLabel: "Dnes" },
  { key: "week", label: "Tento týden", shortLabel: "Týden" },
  { key: "overdue", label: "Po termínu", shortLabel: "Po termínu" },
  { key: "completed", label: "Dokončené", shortLabel: "Hotovo" },
];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("cs-CZ");
}

function isOverdue(dueDate: string | null, completedAt: Date | null) {
  if (!dueDate || completedAt) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

const inputCls = "wp-input w-full";
const selectCls = "wp-select w-full min-h-[40px]";

export default function TasksPage() {
  const searchParams = useSearchParams();
  const initialFilter = (() => {
    const f = searchParams.get("filter");
    return f && FILTERS.some((x) => x.key === f) ? (f as Filter) : "all";
  })();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [mobileEditId, setMobileEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    contactId: "",
    dueDate: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newContactId, setNewContactId] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const newTaskFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const contactId = searchParams.get("contactId");
    if (contactId) setNewContactId(contactId);
    const filterParam = searchParams.get("filter");
    if (filterParam && FILTERS.some((f) => f.key === filterParam)) setFilter(filterParam as Filter);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#new-task-form") {
      const el = newTaskFormRef.current ?? document.getElementById("new-task-form");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const reload = useCallback(
    async (f?: Filter) => {
      setLoading(true);
      setLoadError(false);
      try {
        const rows = await getTasksList(f ?? filter);
        setTasks(rows);
      } catch {
        setLoadError(true);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    reload();
    getContactsList()
      .then(setContacts)
      .catch(() => {});
  }, [reload]);

  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => {
      if (t.title.toLowerCase().includes(q)) return true;
      if (t.contactName?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [tasks, searchQuery]);

  async function handleFilterChange(f: Filter) {
    setFilter(f);
    setEditId(null);
    setLoading(true);
    try {
      const rows = await getTasksList(f);
      setTasks(rows);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(task: TaskRow) {
    if (task.completedAt) {
      await reopenTask(task.id);
    } else {
      await completeTask(task.id);
    }
    await reload();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim() || newDescription.trim() || "Úkol";
    if (!title) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const id = await createTask({
        title,
        description: newDescription.trim() && newTitle.trim() ? newDescription.trim() : undefined,
        contactId: newContactId || undefined,
        dueDate: newDueDate || undefined,
      });
      if (id) {
        setNewTitle("");
        setNewDescription("");
        setNewContactId("");
        setNewDueDate("");
        await reload();
      } else {
        setCreateError("Úkol se nepodařilo vytvořit. Zkuste to znovu.");
      }
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Nepodařilo se vytvořit úkol."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canCreateTask = Boolean(newTitle.trim() || newDescription.trim());

  function startEdit(task: TaskRow) {
    setEditId(task.id);
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      contactId: task.contactId ?? "",
      dueDate: task.dueDate ?? "",
    });
  }

  async function handleSaveEdit() {
    if (!editId) return;
    await updateTask(editId, {
      title: editForm.title,
      description: editForm.description,
      contactId: editForm.contactId,
      dueDate: editForm.dueDate,
    });
    setEditId(null);
    setMobileEditId(null);
    await reload();
  }

  function closeMobileEdit() {
    setMobileEditId(null);
    setEditId(null);
  }

  function openMobileEdit(task: TaskRow) {
    startEdit(task);
    setMobileEditId(task.id);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Opravdu smazat tento úkol?")) return;
    await deleteTask(id);
    await reload();
  }

  function renderTaskCard(t: TaskRow) {
    const completed = !!t.completedAt;
    const overdue = isOverdue(t.dueDate, t.completedAt);

    const checkbox = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleToggle(t);
        }}
        className="flex-shrink-0 p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        aria-label={completed ? "Označit jako nedokončené" : "Označit jako hotovo"}
      >
        {completed ? (
          <CheckCircle2 size={24} className="text-emerald-500" />
        ) : (
          <Circle size={24} className="text-slate-300 hover:text-indigo-500" />
        )}
      </button>
    );

    if (editId === t.id) {
      return (
        <div
          key={t.id}
          className="bg-white p-4 rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm space-y-3"
        >
          <input
            value={editForm.title}
            onChange={(e) =>
              setEditForm({ ...editForm, title: e.target.value })}
            className={inputCls}
            placeholder="Název úkolu"
            style={{ minHeight: 40 }}
          />
          <div className="flex flex-wrap gap-2">
            <div style={{ minWidth: 180 }}>
              <ContactSearchInput
                value={editForm.contactId}
                contacts={contacts}
                onChange={(contactId) => setEditForm({ ...editForm, contactId })}
                placeholder="Vyhledat klienta…"
                className="min-h-[40px]"
              />
            </div>
            <input
              type="date"
              value={editForm.dueDate}
              onChange={(e) =>
                setEditForm({ ...editForm, dueDate: e.target.value })}
              className={inputCls}
              style={{ minWidth: 160, minHeight: 40 }}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="wp-btn wp-btn-primary text-sm"
            >
              Uložit
            </button>
            <button
              type="button"
              onClick={() => setEditId(null)}
              className="wp-btn wp-btn-ghost text-sm"
            >
              Zrušit
            </button>
          </div>
        </div>
      );
    }

    const cardContent = (
      <>
        {checkbox}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {overdue && !completed && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100"
              >
                <AlertCircle size={12} /> Zpožděno
              </span>
            )}
          </div>
          <h3
            className={`font-bold text-base mb-1 ${
              completed
                ? "text-slate-400 line-through"
                : "text-slate-900"
            }`}
          >
            {t.title}
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
            {t.contactId && t.contactName ? (
              <Link
                href={`/portal/contacts/${t.contactId}`}
                className="inline-flex items-center gap-1.5 text-slate-600 hover:text-indigo-600 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <User size={14} /> {t.contactName}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <User size={14} /> —
              </span>
            )}
            <span className="w-1 h-1 bg-slate-300 rounded-full shrink-0" />
            <span
              className={
                overdue && !completed
                  ? "text-rose-600 font-semibold"
                  : ""
              }
            >
              <Calendar size={14} className="inline mr-1" />
              {formatDate(t.dueDate)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startEdit(t);
            }}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-[var(--wp-radius-sm)] transition-colors text-xs font-medium"
          >
            Upravit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(t.id);
            }}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-[var(--wp-radius-sm)] transition-colors text-xs font-medium"
          >
            Smazat
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startEdit(t);
            }}
            className="p-2 text-slate-400 hover:bg-slate-100 rounded-[var(--wp-radius-sm)] transition-colors"
            aria-label="Více možností"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </>
    );

    return (
      <div
        key={t.id}
        className={`group bg-white p-4 rounded-[var(--wp-radius-sm)] border transition-all duration-200 flex flex-col md:flex-row items-start md:items-center gap-4 ${
          completed
            ? "border-slate-100 bg-slate-50/50 opacity-90"
            : "border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300"
        }`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-[max(3rem,calc(1rem+env(safe-area-inset-bottom)))]" style={{ color: "var(--wp-text)" }}>
      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-4 md:py-8 grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-8">
        {/* --- Hlavní panel --- */}
        <div className="xl:col-span-8 space-y-4 md:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
            <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">
              Moje úkoly
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  newTaskFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  const titleInput = newTaskFormRef.current?.querySelector<HTMLInputElement>("input[type='text']");
                  if (titleInput) {
                    setTimeout(() => titleInput.focus(), 400);
                  }
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-[var(--wp-radius-sm)] text-sm font-semibold shadow-sm hover:bg-indigo-700 transition-all min-h-[44px] min-w-[44px]"
              >
                <Plus size={18} /> Vytvořit úkol
              </button>
              <Link
                href="/portal/setup?tab=osobni#quick-actions"
                className="group hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-[var(--wp-radius-sm)] text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-all min-h-[44px] min-w-[44px] justify-center"
                title="Nastavení rychlých akcí"
              >
                <Settings size={18} className="transition-transform group-hover:rotate-90 duration-300" />
              </Link>
            </div>
          </div>

          {/* Nový úkol – na mobilu single column, plná šířka, odděleno od listu */}
          <div className="rounded-[var(--wp-radius-sm)] border-2 border-indigo-100 bg-white shadow-lg shadow-indigo-900/5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-300 transition-all">
            <h2 className="pt-3 px-4 pb-1 text-xs font-bold uppercase tracking-wider text-indigo-600">
              Nový úkol
            </h2>
            <form
              ref={newTaskFormRef}
              id="new-task-form"
              onSubmit={handleCreate}
              className="p-4 md:p-3 flex flex-col gap-3"
            >
              {createError && (
                <p
                  className="text-sm font-medium text-rose-600"
                  role="alert"
                >
                  {createError}
                </p>
              )}
              <div className="flex flex-col md:flex-row md:items-center gap-3 w-full min-w-0">
                <div className="flex-1 flex flex-col gap-1 w-full min-w-0 md:px-2">
                  <label htmlFor="new-task-title" className="text-xs font-bold uppercase tracking-wider text-slate-500 md:sr-only">
                    Co je třeba udělat?
                  </label>
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <Plus size={20} className="text-indigo-500 shrink-0 hidden md:block" />
                    <input
                      id="new-task-title"
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Co potřebujete udělat? (např. Zavolat panu Novákovi)"
                      className="w-full min-w-0 py-3 px-3 md:py-2.5 md:px-0 bg-slate-50 md:bg-transparent border border-slate-200 md:border-none rounded-xl md:rounded-none text-slate-800 font-medium placeholder:text-slate-400 outline-none text-base md:text-sm min-h-[44px]"
                    />
                  </div>
                </div>
                <div className="w-full min-w-0">
                  <label htmlFor="new-task-description" className="text-xs font-bold uppercase tracking-wider text-slate-500 md:sr-only">
                    Popis úkolu
                  </label>
                  <textarea
                    id="new-task-description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Popis úkolu (volitelné)"
                    rows={2}
                    className="w-full min-w-0 py-3 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 text-base md:text-sm resize-y min-h-[60px]"
                  />
                </div>
                <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 w-full min-w-0">
                  <div className="w-full min-w-0">
                    <ContactSearchInput
                      value={newContactId}
                      contacts={contacts}
                      onChange={setNewContactId}
                      placeholder="Klient"
                      className="w-full min-w-0 min-h-[44px] py-3 md:py-2.5"
                    />
                  </div>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full min-w-0 min-h-[44px] px-3 py-3 md:py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-sm md:text-xs font-medium hover:bg-slate-100 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !canCreateTask}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-base md:text-sm font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-400 min-h-[44px]"
                  >
                    {submitting ? "…" : "Vytvořit"}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Vyhledávání – oddělený blok */}
          {tasks.length > 0 && (
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hledat úkol..."
                className="w-full pl-11 pr-4 py-3 md:py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 min-h-[44px]"
              />
            </div>
          )}

          {/* Taby: na mobilu kratší štítky, scroll, touch-friendly */}
          <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto snap-x snap-mandatory scrollbar-thin -mx-4 px-4 md:mx-0 md:px-0 pb-px">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => handleFilterChange(f.key)}
                className={`flex items-center gap-2 px-3 md:px-4 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap min-h-[44px] snap-start ${
                  filter === f.key
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                } ${f.key === "overdue" && filter !== f.key ? "text-rose-500" : ""}`}
              >
                <span className="md:hidden">{f.shortLabel}</span>
                <span className="hidden md:inline">{f.label}</span>
                {!loading && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      filter === f.key
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tasks.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loadError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
              <p className="text-sm font-medium text-amber-800">Nepodařilo se načíst úkoly.</p>
              <button
                type="button"
                onClick={() => reload()}
                className="shrink-0 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-semibold rounded-lg transition-colors"
              >
                Zkusit znovu
              </button>
            </div>
          )}

          {/* Seznam úkolů */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="bg-white p-4 rounded-[20px] border border-slate-100 flex items-center gap-4"
                >
                  <SkeletonLine className="h-6 w-6 rounded-full" />
                  <div className="flex-1">
                    <SkeletonLine className="h-4 w-3/4 mb-2" />
                    <SkeletonLine className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredBySearch.length === 0 ? (
            <div className="bg-white rounded-[20px] border border-slate-200 shadow-sm p-6 md:p-12">
              <EmptyState
                icon="✓"
                title="Žádné úkoly"
                description={
                  searchQuery.trim()
                    ? "Žádné úkoly nevyhovují hledání."
                    : "Vytvořte první úkol pomocí formuláře nahoře."
                }
                actionLabel={searchQuery.trim() ? "Zrušit hledání" : "Vytvořit úkol"}
                onAction={() => {
                  if (searchQuery.trim()) {
                    setSearchQuery("");
                  } else {
                    newTaskFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    const titleInput = newTaskFormRef.current?.querySelector<HTMLInputElement>("input[type='text']");
                    if (titleInput) setTimeout(() => titleInput.focus(), 400);
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile: swipe list s checkboxem */}
              <div className="block md:hidden wp-tasks-swipe-list">
                {filteredBySearch.map((t) => (
                  <SwipeTaskItem
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    subtitle={[t.contactName, formatDate(t.dueDate)]
                      .filter(Boolean)
                      .join(" · ")}
                    onDelete={(id) => {
                      if (window.confirm("Opravdu smazat tento úkol?"))
                        handleDelete(id);
                    }}
                    onEdit={() => openMobileEdit(t)}
                    leftSlot={
                      <button
                        type="button"
                        onClick={() => handleToggle(t)}
                        className="flex-shrink-0 p-1"
                        aria-label={t.completedAt ? "Označit jako nedokončené" : "Označit jako hotovo"}
                      >
                        {t.completedAt ? (
                          <CheckCircle2 size={24} className="text-emerald-500" />
                        ) : (
                          <Circle size={24} className="text-slate-300" />
                        )}
                      </button>
                    }
                  />
                ))}
              </div>
              {/* Desktop: karty */}
              <div className="hidden md:block space-y-3">
                {filteredBySearch.map((t) => renderTaskCard(t))}
              </div>
            </div>
          )}
        </div>

        {/* --- Pravý panel (reálná data) – na mobilu skrytý --- */}
        <div className="hidden xl:block xl:col-span-4 space-y-6">
          <div className="bg-[#1a1c2e] rounded-[var(--wp-radius-sm)] p-8 text-white shadow-xl relative overflow-hidden">
            <Target className="absolute -top-4 -right-4 w-32 h-32 text-white/5" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 mb-4">
              V tomto výběru
            </h3>
            {!loading && (
              <>
                <div className="text-4xl font-bold tracking-tight">
                  {filteredBySearch.length}
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  {filter === "today" && "úkolů na dnešek"}
                  {filter === "week" && "úkolů tento týden"}
                  {filter === "overdue" && "úkolů po termínu"}
                  {filter === "completed" && "dokončených úkolů"}
                  {filter === "all" && "aktivních úkolů"}
                </p>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Mobilní editace úkolu: fullscreen overlay (jen na mobilu) */}
      {mobileEditId && (
        <div
          className="fixed inset-0 z-modal md:hidden flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-edit-title"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
            <h2 id="mobile-edit-title" className="text-lg font-bold text-slate-900">
              Upravit úkol
            </h2>
            <button
              type="button"
              onClick={closeMobileEdit}
              className="p-2 text-slate-500 hover:text-slate-700 rounded-lg"
              aria-label="Zavřít"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Název</label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className={inputCls}
                placeholder="Název úkolu"
                style={{ minHeight: 44 }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Klient</label>
              <ContactSearchInput
                value={editForm.contactId}
                contacts={contacts}
                onChange={(contactId) => setEditForm({ ...editForm, contactId })}
                placeholder="Vyhledat klienta…"
                className="min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Termín</label>
              <input
                type="date"
                value={editForm.dueDate}
                onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                className={inputCls}
                style={{ minHeight: 44 }}
              />
            </div>
          </div>
          <div className="flex gap-3 p-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={closeMobileEdit}
              className="flex-1 wp-btn wp-btn-ghost py-3 min-h-[44px]"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="flex-1 wp-btn wp-btn-primary py-3 min-h-[44px]"
            >
              Uložit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
