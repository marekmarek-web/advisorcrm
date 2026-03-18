"use client";

import { useState, useEffect } from "react";
import { CalendarPlus, CheckSquare, X } from "lucide-react";
import { createTeamEvent, createTeamTask } from "@/app/actions/team-events";
import type { TeamMemberInfo, TeamMemberMetrics, NewcomerAdaptation } from "@/app/actions/team-overview";

type ModalType = "event" | "task" | null;

export function TeamCalendarModal({
  open,
  type,
  onClose,
  members,
  metrics,
  newcomers,
  onSuccess,
}: {
  open: boolean;
  type: ModalType;
  onClose: () => void;
  members: TeamMemberInfo[];
  metrics: TeamMemberMetrics[];
  newcomers: NewcomerAdaptation[];
  onSuccess: () => void;
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
    if (open && type) setSelectedIds(new Set(members.map((m) => m.userId)));
  }, [open, type, members]);

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
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="team-calendar-modal-title" className="text-lg font-bold text-slate-900">
            {type === "event" ? "Nová týmová událost" : "Nový týmový úkol"}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 min-w-[44px] min-h-[44px]" aria-label="Zavřít">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Název *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              placeholder={type === "event" ? "Porada, briefing…" : "Úkol pro tým…"}
              required
            />
          </div>
          {type === "event" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Začátek</label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Konec</label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Místo</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-slate-900"
                  placeholder="Místnost, odkaz…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Poznámka</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-slate-900"
                  placeholder="Volitelný popis"
                />
              </div>
            </>
          )}
          {type === "task" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Popis</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-slate-900"
                  placeholder="Volitelný popis úkolu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Termín</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-slate-900"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Příjemci</label>
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => applyPreset("all")} className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">Celý tým</button>
              <button type="button" onClick={() => applyPreset("managers")} className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">Manažeři</button>
              <button type="button" onClick={() => applyPreset("advisors")} className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">Poradci</button>
              <button type="button" onClick={() => applyPreset("newcomers")} className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">Nováčci</button>
              <button type="button" onClick={() => applyPreset("risky")} className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">Rizikoví</button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedIds.size === allIds.length} onChange={toggleAll} className="rounded border-slate-300" />
                <span className="text-sm font-medium text-slate-700">Celý tým</span>
              </label>
              {members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(m.userId)} onChange={() => toggleOne(m.userId)} className="rounded border-slate-300" />
                  <span className="text-sm text-slate-700">{displayName(m)}</span>
                  <span className="text-xs text-slate-400">({m.roleName})</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
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
        className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <CalendarPlus className="w-4 h-4" />
        Týmová událost
      </button>
      <button
        type="button"
        onClick={onOpenTask}
        className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <CheckSquare className="w-4 h-4" />
        Týmový úkol
      </button>
    </div>
  );
}
