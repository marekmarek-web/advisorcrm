"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { Calendar, Briefcase, CheckSquare, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";
import {
  checkAiActionDuplicates,
  createCrmActionFromAi,
  submitAiFeedbackWithAction,
} from "@/app/actions/ai-actions";
import type { AiActionType } from "@/lib/ai/actions/action-suggestions";

type Props = {
  generationId: string;
  promptType: string;
  contactId: string;
  outputText: string;
};

const ACTION_LABELS: Record<AiActionType, string> = {
  task: "Vytvořit úkol",
  meeting: "Naplánovat schůzku",
  deal: "Založit obchod",
  service_action: "Servisní akce",
};

const ACTION_ICONS = {
  task: CheckSquare,
  meeting: Calendar,
  deal: Briefcase,
  service_action: Wrench,
} satisfies Record<AiActionType, ComponentType<{ size?: number; className?: string }>>;

function deriveDefaultTitle(outputText: string, actionType: AiActionType): string {
  const firstLine = outputText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const base = firstLine ? firstLine.replace(/^[-*\d.\s]+/, "").slice(0, 120) : "";
  if (base) return base;
  if (actionType === "task") return "AI doporučený úkol";
  if (actionType === "meeting") return "AI doporučená schůzka";
  if (actionType === "deal") return "AI doporučený obchod";
  return "AI servisní akce";
}

function entityLink(entityType: "task" | "event" | "opportunity"): string {
  if (entityType === "task") return "/portal/tasks";
  if (entityType === "event") return "/portal/calendar";
  return "/portal/pipeline";
}

export function AiActionMenu({ generationId, promptType, contactId, outputText }: Props) {
  const [selectedType, setSelectedType] = useState<AiActionType | null>(null);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [caseType, setCaseType] = useState("jiné");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState<"accepted" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [created, setCreated] = useState<{ entityType: "task" | "event" | "opportunity"; entityId: string } | null>(null);

  const canSubmit = Boolean(selectedType && title.trim() && !saving);
  const actionEntries = useMemo(
    () =>
      (Object.keys(ACTION_LABELS) as AiActionType[]).map((type) => ({
        type,
        label: ACTION_LABELS[type],
        Icon: ACTION_ICONS[type],
      })),
    []
  );

  async function openActionType(type: AiActionType) {
    const suggestedTitle = deriveDefaultTitle(outputText, type);
    setSelectedType(type);
    setTitle(suggestedTitle);
    setError(null);
    setCreated(null);
    setDescription("");
    setDueAt("");
    if (type === "deal") setCaseType("jiné");

    const duplicate = await checkAiActionDuplicates(contactId, type, suggestedTitle);
    if (duplicate.existingItems.length > 0) {
      setDuplicateWarning(
        `Možná duplicita (${duplicate.existingItems.length}): ${duplicate.existingItems
          .slice(0, 2)
          .map((i) => i.title)
          .join(", ")}`
      );
    } else {
      setDuplicateWarning(null);
    }
  }

  async function handleCreate() {
    if (!selectedType || !title.trim()) return;
    setSaving(true);
    setError(null);
    setCreated(null);
    try {
      const result = await createCrmActionFromAi(
        {
          actionType: selectedType,
          title: title.trim(),
          description: description.trim() || undefined,
          dueAt: dueAt || undefined,
          caseType: selectedType === "deal" ? caseType.trim() || "jiné" : undefined,
          sourceGenerationId: generationId,
          sourcePromptType: promptType,
        },
        contactId
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCreated({ entityType: result.entityType, entityId: result.entityId });
      setDuplicateWarning(result.duplicateWarning ?? null);
    } finally {
      setSaving(false);
    }
  }

  async function submitFeedback(verdict: "accepted" | "rejected") {
    setFeedbackSaving(verdict);
    setError(null);
    try {
      const result = await submitAiFeedbackWithAction(generationId, verdict, {
        actionTaken: "none",
      });
      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      setFeedbackSaving(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actionEntries.map(({ type, label, Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => openActionType(type)}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submitFeedback("accepted")}
          disabled={feedbackSaving !== null}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-emerald-300 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
        >
          <ThumbsUp size={14} />
          Použitelné
        </button>
        <button
          type="button"
          onClick={() => submitFeedback("rejected")}
          disabled={feedbackSaving !== null}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          <ThumbsDown size={14} />
          Nevhodné
        </button>
      </div>

      {selectedType && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-600">Nová akce: {ACTION_LABELS[selectedType]}</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Název akce"
            className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Volitelný popis"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
            />
            {selectedType === "deal" && (
              <input
                value={caseType}
                onChange={(e) => setCaseType(e.target.value)}
                placeholder="Oblast obchodu (např. investice)"
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
              />
            )}
          </div>
          {duplicateWarning && (
            <p className="text-xs text-amber-700 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1">
              {duplicateWarning}
            </p>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Vytvářím..." : "Potvrdit vytvoření"}
          </button>
        </div>
      )}

      {created && (
        <p className="text-xs text-emerald-700 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1">
          Akce vytvořena.{" "}
          <Link href={entityLink(created.entityType)} className="font-semibold underline">
            Otevřít
          </Link>
        </p>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
