"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { setContactTags } from "@/app/actions/contacts";
import { useToast } from "@/app/components/Toast";

const BADGE_CLS =
  "inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-slate-200";

type ContactTagsEditorProps = {
  contactId: string;
  initialTags: string[];
};

export function ContactTagsEditor({ contactId, initialTags }: ContactTagsEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const persist = useCallback(
    async (next: string[], action: "add" | "remove") => {
      setSaving(true);
      setErrorMessage(null);
      try {
        await setContactTags(contactId, next);
        setTags(next);
        toast.showToast(action === "add" ? "Štítek přidán" : "Štítek odebrán", "success");
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Štítky se nepodařilo uložit";
        toast.showToast(msg, "error");
        setErrorMessage(msg);
      } finally {
        setSaving(false);
      }
    },
    [contactId, toast, router]
  );

  const handleRemove = useCallback(
    (tag: string) => {
      const next = tags.filter((t) => t !== tag);
      persist(next, "remove");
    },
    [tags, persist]
  );

  const handleAdd = useCallback(() => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setNewTag("");
      return;
    }
    const next = [...tags, trimmed];
    setNewTag("");
    persist(next, "add");
  }, [newTag, tags, persist]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-3" role="group" aria-label="Štítky">
      {tags.map((tag) => (
        <span key={tag} className={BADGE_CLS}>
          {tag}
          <button
            type="button"
            onClick={() => handleRemove(tag)}
            disabled={saving}
            className="min-h-[44px] min-w-[44px] -m-1 flex items-center justify-center rounded hover:bg-slate-200/80 text-slate-500 disabled:opacity-50 touch-manipulation"
            aria-label={`Odebrat štítek ${tag}`}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Přidat štítek"
          disabled={saving}
          className="min-h-[44px] px-3 py-1.5 rounded-md border border-slate-200 text-[13px] font-medium w-28 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
          aria-label="Nový štítek"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !newTag.trim()}
          className="min-h-[44px] px-3 py-1.5 rounded-md border border-indigo-200 text-indigo-700 text-xs font-bold bg-white hover:bg-indigo-50 transition-colors disabled:opacity-50 touch-manipulation"
        >
          Přidat
        </button>
      </div>
      {errorMessage && (
        <p className="text-red-600 text-xs font-medium mt-1 w-full" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
