"use client";

import { useState, useEffect } from "react";
import { CalendarPlus, CheckSquare, X } from "lucide-react";
import clsx from "clsx";
import { createTeamEvent, createTeamTask } from "@/app/actions/team-events";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import type { TeamMemberInfo, TeamMemberMetrics, NewcomerAdaptation } from "@/app/actions/team-overview";

type ModalType = "event" | "task" | null;

export type TeamCalendarModalPrefill = {
  title?: string;
  description?: string;
  notes?: string;
  dueDate?: string;
  startAt?: string;
  /** Omezí výběr příjemců na tyto user id (musí být v `members`). */
  memberUserIds?: string[];
};

export function TeamCalendarModal({
  open,
  type,
  onClose,
  members,
  metrics,
  newcomers,
  onSuccess,
  prefill,
}: {
  open: boolean;
  type: ModalType;
  onClose: () => void;
  members: TeamMemberInfo[];
  metrics: TeamMemberMetrics[];
  newcomers: NewcomerAdaptation[];
  onSuccess: () => void;
  prefill?: TeamCalendarModalPrefill | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(members.map((m) => m.userId)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !type) return;
    const all = members.map((m) => m.userId);
    const fromPrefill = prefill?.memberUserIds?.filter((id) => members.some((m) => m.userId === id)) ?? [];
    setSelectedIds(new Set(fromPrefill.length > 0 ? fromPrefill : all));
    setTitle(prefill?.title ?? "");
    setDescription(prefill?.description ?? "");
    setNotes(prefill?.notes ?? "");
    setDueDate(prefill?.dueDate ?? "");
    setStartAt(prefill?.startAt ?? "");
    setEndAt("");
    setLocation("");
    setError("");
  }, [open, type, members, prefill]);

  if (!open || !type) return null;

  const allIds = members.map((m) => m.userId);
  const riskIds = new Set(metrics.filter((m) => m.riskLevel !== "ok").map((m) => m.userId));
  const newcomerIds = new Set(newcomers.map((n) => n.userId));
  const managerIds = new Set(members.filter((m) => m.roleName === "Manager" || m.roleName === "Director").map((m) => m.userId));
  const advisorIds = new Set(members.filter((m) => m.roleName === "Advisor").map((m) => m.userId));
  const toggleAll = () => {
    if (selectedIds.size === allIds.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const applyPreset = (preset: "all" | "managers" | "advisors" | "newcomers" | "risky") => {
    if (preset === "all") return setSelectedIds(new Set(allIds));
    if (preset === "managers") return setSelectedIds(new Set([...managerIds]));
    if (preset === "advisors") return setSelectedIds(new Set([...advisorIds]));
    if (preset === "newcomers") return setSelectedIds(new Set([...newcomerIds]));
    setSelectedIds(new Set([...riskIds]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const userIds = Array.from(selectedIds);
    if (userIds.length === 0) {
      setError("Vyberte alespoň jednoho příjemce.");
      return;
    }
    if (!title.trim()) {
      setError("Zadejte název.");
      return;
    }
    setSaving(true);
    try {
      if (type === "event") {
        const start = startAt || new Date().toISOString().slice(0, 16);
        await createTeamEvent(
          { title: title.trim(), startAt: start, endAt: endAt || undefined, location: location || undefined, notes: notes || undefined },
          userIds
        );
      } else {
        await createTeamTask(
          { title: title.trim(), description: description || undefined, dueDate: dueDate || undefined },
          userIds
        );
      }
      setTitle("");
      setDescription("");
      setStartAt("");
      setEndAt("");
      setDueDate("");
      setLocation("");
      setNotes("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodařilo se vytvořit.");
    } finally {
      setSaving(false);
    }
  };

  const displayName = (m: TeamMemberInfo) => m.displayName || m.email || "Člen týmu";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="team-calendar-modal-title">
      <div
        className="w-full max-w-md bg-[color:var(--wp-surface-card)] rounded-2xl shadow-xl border border-[color:var(--wp-surface-card-border)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--wp-surface-card-border)]">
          <h2 id="team-calendar-modal-title" className="text-lg font-bold text-[color:var(--wp-text)]">
            {type === "event" ? "Nová týmová událost" : "Nový týmový úkol"}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text-secondary)] min-w-[44px] min-h-[44px]" aria-label="Zavřít">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Název *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-[color:var(--wp-text)] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              placeholder={type === "event" ? "Porada, briefing…" : "Úkol pro tým…"}
              required
            />
          </div>
          {type === "event" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Začátek</label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-[color:var(--wp-text)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Konec</label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-[color:var(--wp-text)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Místo</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-[color:var(--wp-text)]"
                  placeholder="Místnost, odkaz…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Poznámka</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-[color:var(--wp-text)]"
                  placeholder="Volitelný popis"
                />
              </div>
            </>
          )}
          {type === "task" && (
            <>
              <div>
                <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Popis</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-[color:var(--wp-text)]"
                  placeholder="Volitelný popis úkolu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Termín</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-[color:var(--wp-text)]"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-2">Příjemci</label>
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => applyPreset("all")} className="min-h-[36px] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2.5 py-1 text-xs text-[color:var(--wp-text-secondary)]">Celý tým</button>
              <button type="button" onClick={() => applyPreset("managers")} className="min-h-[36px] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2.5 py-1 text-xs text-[color:var(--wp-text-secondary)]">Manažeři</button>
              <button type="button" onClick={() => applyPreset("advisors")} className="min-h-[36px] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2.5 py-1 text-xs text-[color:var(--wp-text-secondary)]">Poradci</button>
              <button type="button" onClick={() => applyPreset("newcomers")} className="min-h-[36px] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2.5 py-1 text-xs text-[color:var(--wp-text-secondary)]">Nováčci</button>
              <button type="button" onClick={() => applyPreset("risky")} className="min-h-[36px] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2.5 py-1 text-xs text-[color:var(--wp-text-secondary)]">Rizikoví</button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto rounded-xl border border-[color:var(--wp-surface-card-border)] p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedIds.size === allIds.length} onChange={toggleAll} className="rounded border-[color:var(--wp-border-strong)]" />
                <span className="text-sm font-medium text-[color:var(--wp-text-secondary)]">Celý tým</span>
              </label>
              {members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(m.userId)} onChange={() => toggleOne(m.userId)} className="rounded border-[color:var(--wp-border-strong)]" />
                  <span className="text-sm text-[color:var(--wp-text-secondary)]">{displayName(m)}</span>
                  <span className="text-xs text-[color:var(--wp-text-tertiary)]">({m.roleName})</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={saving}
              className={clsx(portalPrimaryButtonClassName, "flex-1 px-4 py-2 text-sm font-medium disabled:opacity-60")}
            >
              {saving ? "Vytvářím…" : type === "event" ? "Vytvořit událost" : "Vytvořit úkol"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TeamCalendarButtons({
  canCreate,
  onOpenEvent,
  onOpenTask,
}: {
  canCreate: boolean;
  onOpenEvent: () => void;
  onOpenTask: () => void;
}) {
  if (!canCreate) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpenEvent}
        className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] shadow-sm hover:bg-[color:var(--wp-surface-muted)]"
      >
        <CalendarPlus className="w-4 h-4" />
        Týmová událost
      </button>
      <button
        type="button"
        onClick={onOpenTask}
        className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] shadow-sm hover:bg-[color:var(--wp-surface-muted)]"
      >
        <CheckSquare className="w-4 h-4" />
        Týmový úkol
      </button>
    </div>
  );
}
