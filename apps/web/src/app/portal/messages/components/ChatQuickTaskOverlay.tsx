"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, CheckSquare, Loader2, User, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ContactSearchInput } from "@/app/components/ContactSearchInput";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { createTask } from "@/app/actions/tasks";
import type { ContactRow } from "@/app/actions/contacts";
import { useToast } from "@/app/components/Toast";
import { queryKeys } from "@/lib/query-keys";
import { defaultTaskDueDateYmd } from "@/lib/date/date-only";

export type ChatOpportunityOption = { id: string; title: string; contactId: string | null };

export function ChatQuickTaskOverlay({
  open,
  onClose,
  contactId,
  suggestedTitle,
  descriptionSeed,
  initialOpportunityId,
  contacts,
  contactsLoading,
  opportunities,
  opportunitiesLoading,
  onTaskCreated,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  suggestedTitle: string;
  descriptionSeed: string;
  initialOpportunityId: string | null;
  contacts: ContactRow[];
  contactsLoading: boolean;
  opportunities: ChatOpportunityOption[];
  opportunitiesLoading: boolean;
  onTaskCreated?: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cid, setCid] = useState("");
  const [oid, setOid] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(suggestedTitle);
    setDueDate(defaultTaskDueDateYmd());
    setCid(contactId);
    setOid(initialOpportunityId ?? "");
    setDesc(descriptionSeed);
  }, [open, contactId, suggestedTitle, descriptionSeed, initialOpportunityId]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const oppForContact = useMemo(() => {
    if (!cid) return [];
    return opportunities.filter((o) => !o.contactId || o.contactId === cid);
  }, [opportunities, cid]);

  useEffect(() => {
    if (!oid) return;
    if (!oppForContact.some((o) => o.id === oid)) setOid("");
  }, [oppForContact, oid]);

  const oppDropdownOptions = useMemo(
    () => [
      { id: "", label: "— Žádný obchod —" },
      ...oppForContact.map((o) => ({ id: o.id, label: o.title })),
    ],
    [oppForContact],
  );

  const loadingLists = (contactsLoading && contacts.length === 0) || (opportunitiesLoading && opportunities.length === 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || !dueDate) {
      toast.showToast("Vyplňte název a termín úkolu.", "error");
      return;
    }
    const selectedOpp = opportunities.find((o) => o.id === oid);
    const safeOpp =
      oid && selectedOpp && (!selectedOpp.contactId || selectedOpp.contactId === cid) ? oid : undefined;
    setSaving(true);
    try {
      const id = await createTask({
        title: t,
        description: desc.trim() || undefined,
        contactId: cid.trim() || undefined,
        dueDate,
        opportunityId: safeOpp,
      });
      if (id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        window.dispatchEvent(new Event("portal-tasks-badge-refresh"));
        onTaskCreated?.();
        toast.showToast("Úkol byl vytvořen", "success");
        onClose();
      } else {
        toast.showToast("Úkol se nepodařilo vytvořit.", "error");
      }
    } catch (err) {
      toast.showToast(err instanceof Error ? err.message : "Úkol se nepodařilo vytvořit.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const labelClass =
    "block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1.5 ml-1";
  const inputClass =
    "w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 text-[color:var(--wp-text)]";

  return (
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-[500px] flex-col overflow-hidden rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-xl"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50">
              <CheckSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            </div>
            <h2 className="text-lg font-black text-[color:var(--wp-text)]">Nový úkol</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)]"
            aria-label="Zavřít"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingLists ? (
          <div className="flex min-h-[200px] items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[color:var(--wp-text-tertiary)]" aria-hidden />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <label className={labelClass}>Název úkolu</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`${inputClass} text-base`}
                  placeholder="Co je potřeba udělat…"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>Termín splnění</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`${labelClass} flex items-center gap-1`}>
                  <User size={12} aria-hidden />
                  Klient
                </label>
                <ContactSearchInput
                  value={cid}
                  contacts={contacts}
                  onChange={(id) => {
                    setCid(id);
                    setOid("");
                  }}
                  placeholder="Vyhledat klienta…"
                  className={inputClass}
                />
              </div>
              {oppForContact.length > 0 ? (
                <div>
                  <label className={`${labelClass} flex items-center gap-1`}>
                    <Briefcase size={12} aria-hidden />
                    Obchod
                  </label>
                  <CustomDropdown
                    value={oid}
                    onChange={setOid}
                    options={oppDropdownOptions}
                    placeholder="— Žádný obchod —"
                    icon={Briefcase}
                    direction="up"
                  />
                </div>
              ) : null}
              <div>
                <label className={labelClass}>Popis / kontext</label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={5}
                  className={`${inputClass} min-h-[100px] resize-none font-medium`}
                  placeholder="Kontext z konverzace…"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
              >
                Zrušit
              </button>
              <CreateActionButton type="submit" disabled={saving || !title.trim() || !dueDate} isLoading={saving} icon={CheckSquare}>
                {saving ? "Vytvářím…" : "Vytvořit úkol"}
              </CreateActionButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
