"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Send,
  Save,
  Eye,
  Clock,
  Gift,
  Newspaper,
  Calendar,
  Sparkles,
  Leaf,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Image as ImageIcon,
  ChevronDown,
  CheckCircle2,
  MousePointerClick,
  Loader2,
  Smartphone,
  Monitor,
  Trash2,
  PenSquare,
  Info,
  Code,
  Type,
} from "lucide-react";
import {
  createEmailCampaignDraft,
  updateEmailCampaignDraft,
  deleteEmailCampaignDraft,
  sendEmailCampaign,
  sendTestCampaign,
} from "@/app/actions/email-campaigns";
import {
  CAMPAIGN_SEGMENTS,
  type CampaignListRow,
  type CampaignSegmentId,
  type SegmentCount,
} from "@/lib/email/campaign-shared";
import { CAMPAIGN_TEMPLATES, findTemplate } from "@/lib/email/campaign-templates";
import { useToast } from "@/app/components/Toast";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { PortalPageShell } from "@/app/components/layout/PortalPageShell";
import { formatInTimeZone } from "date-fns-tz";

const PRAGUE = "Europe/Prague";

function formatPragueDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return formatInTimeZone(d, PRAGUE, "dd.MM.yyyy HH:mm");
}

function formatPragueDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return formatInTimeZone(d, PRAGUE, "dd.MM.yyyy");
}

const TEMPLATE_ICONS = {
  Mail,
  Gift,
  Newspaper,
  Calendar,
  Sparkles,
  Leaf,
} as const;

type ViewMode = "editor" | "preview" | "history";
type PreviewDevice = "desktop" | "mobile";

type Props = {
  initialRows: CampaignListRow[];
  initialSegments: SegmentCount[];
  /** Jméno (nebo e-mail) autora — pro náhled „Od:“ a branding. */
  fromName?: string;
};

type EditorMode = "visual" | "source";

type FormState = {
  /** id draftu – pokud je null, ještě není uložen. */
  draftId: string | null;
  internalName: string;
  subject: string;
  bodyHtml: string;
  segment: CampaignSegmentId;
  templateId: string;
};

const EMPTY_TEMPLATE = CAMPAIGN_TEMPLATES[0]!;

function makeInitialForm(): FormState {
  return {
    draftId: null,
    internalName: "",
    subject: EMPTY_TEMPLATE.subject,
    bodyHtml: EMPTY_TEMPLATE.body,
    segment: "all",
    templateId: EMPTY_TEMPLATE.id,
  };
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Koncept";
    case "sending":
      return "Odesílání";
    case "sent":
      return "Odesláno";
    case "failed":
      return "Selhalo";
    default:
      return status;
  }
}

/** Nahrazuje proměnné pro náhled (client-side mirror z personalizeHtml). */
function previewReplace(input: string): string {
  return input
    .replace(/\{\{jmeno\}\}/gi, "Jan")
    .replace(/\{\{cele_jmeno\}\}/gi, "Jan Novák")
    .replace(/\{\{unsubscribe_url\}\}/gi, "#");
}

export function EmailCampaignsClient({ initialRows, initialSegments, fromName }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(makeInitialForm());
  const [mobileView, setMobileView] = useState<ViewMode>("editor");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [editorMode, setEditorMode] = useState<EditorMode>("visual");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const fromLabel = (fromName && fromName.trim()) || "Vy (Aidvisora)";

  const segmentMap = useMemo(() => {
    const m = new Map<string, SegmentCount>();
    for (const s of initialSegments) m.set(s.id, s);
    return m;
  }, [initialSegments]);

  const inputClass =
    "w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)]";
  const labelClass =
    "block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 ml-1";

  const loadTemplate = useCallback((templateId: string) => {
    const t = findTemplate(templateId);
    if (!t) return;
    setForm((prev) => ({
      ...prev,
      templateId: t.id,
      internalName: prev.internalName || t.name,
      subject: t.subject,
      bodyHtml: t.body,
    }));
  }, []);

  const loadDraft = useCallback(
    (row: CampaignListRow) => {
      setForm({
        draftId: row.id,
        internalName: row.name,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        segment: "all",
        templateId: "blank",
      });
      setMobileView("editor");
      toast.showToast(`Koncept „${row.name}“ byl načten k úpravě.`, "success");
    },
    [toast]
  );

  const resetForm = useCallback(() => {
    setForm(makeInitialForm());
  }, []);

  const handleField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** Vložení značky do textarea na pozici kurzoru, případně obalení výběru. */
  const wrapSelection = useCallback(
    (before: string, after: string = "", placeholder: string = "") => {
      const ta = textareaRef.current;
      if (!ta) return;
      const { selectionStart, selectionEnd, value } = ta;
      const selected = value.slice(selectionStart, selectionEnd) || placeholder;
      const next =
        value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
      setForm((prev) => ({ ...prev, bodyHtml: next }));
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = selectionStart + before.length + selected.length;
        ta.setSelectionRange(newPos, newPos);
      });
    },
    []
  );

  /** Bezpečné execCommand pro contenteditable ve vizuálním režimu. */
  const execCmd = useCallback(
    (command: string, value?: string) => {
      if (editorMode !== "visual" || !visualRef.current) return;
      visualRef.current.focus();
      try {
        document.execCommand(command, false, value);
        setForm((prev) => ({ ...prev, bodyHtml: visualRef.current?.innerHTML ?? prev.bodyHtml }));
      } catch {
        /* fallback – režim zdroje */
      }
    },
    [editorMode]
  );

  const insertVariable = useCallback(
    (variable: string) => {
      if (editorMode === "visual") {
        execCmd("insertText", `{{${variable}}}`);
      } else {
        wrapSelection(`{{${variable}}}`);
      }
    },
    [editorMode, execCmd, wrapSelection]
  );

  const insertLink = useCallback(() => {
    const url = window.prompt("URL odkazu:", "https://");
    if (!url) return;
    if (editorMode === "visual") {
      execCmd("createLink", url);
    } else {
      wrapSelection(`<a href="${url}" style="color:#4f46e5;">`, "</a>", "text odkazu");
    }
  }, [editorMode, execCmd, wrapSelection]);

  const insertImage = useCallback(() => {
    const url = window.prompt("URL obrázku:", "https://");
    if (!url) return;
    if (editorMode === "visual") {
      execCmd("insertImage", url);
    } else {
      wrapSelection(`<img src="${url}" alt="" style="max-width:100%;border-radius:8px;"/>`);
    }
  }, [editorMode, execCmd, wrapSelection]);

  /** Synchronizuje vizuální editor s aktuálním bodyHtml (např. po loadDraft/loadTemplate/reset). */
  useEffect(() => {
    if (editorMode !== "visual") return;
    const el = visualRef.current;
    if (!el) return;
    if (el.innerHTML !== form.bodyHtml) {
      el.innerHTML = form.bodyHtml;
    }
  }, [editorMode, form.bodyHtml]);

  const previewSubject = previewReplace(form.subject);
  const previewBody = previewReplace(form.bodyHtml);

  // --- Akce ---

  const validateForSave = () => {
    const name = form.internalName.trim();
    const subject = form.subject.trim();
    const body = form.bodyHtml.trim();
    if (!name) {
      toast.showToast("Vyplňte interní název kampaně.", "error");
      return null;
    }
    if (!subject) {
      toast.showToast("Vyplňte předmět e-mailu.", "error");
      return null;
    }
    if (!body) {
      toast.showToast("Vyplňte obsah e-mailu.", "error");
      return null;
    }
    return { name, subject, bodyHtml: body };
  };

  const saveDraft = () => {
    const v = validateForSave();
    if (!v) return;
    startTransition(async () => {
      try {
        if (form.draftId) {
          await updateEmailCampaignDraft({ id: form.draftId, ...v });
          toast.showToast("Koncept byl aktualizován.", "success");
        } else {
          const r = await createEmailCampaignDraft(v);
          setForm((prev) => ({ ...prev, draftId: r.id }));
          toast.showToast("Koncept byl uložen.", "success");
        }
        router.refresh();
      } catch (e) {
        toast.showToast(
          e instanceof Error ? e.message : "Nepodařilo se uložit koncept.",
          "error"
        );
      }
    });
  };

  const sendTest = () => {
    const v = validateForSave();
    if (!v) return;
    startTransition(async () => {
      try {
        const r = await sendTestCampaign({
          campaignId: form.draftId ?? null,
          subject: v.subject,
          bodyHtml: v.bodyHtml,
        });
        if (r.ok) {
          toast.showToast(`Test odeslán na ${r.to}.`, "success");
        } else {
          toast.showToast(r.error, "error");
        }
      } catch (e) {
        toast.showToast(
          e instanceof Error ? e.message : "Nepodařilo se odeslat test.",
          "error"
        );
      }
    });
  };

  const sendCampaign = () => {
    const v = validateForSave();
    if (!v) return;
    const segment = form.segment;
    if (segment === "test") {
      toast.showToast("Pro testovací odeslání použijte tlačítko „Odeslat test“.", "error");
      return;
    }
    const seg = segmentMap.get(segment);
    const audience = seg?.count ?? 0;
    if (audience === 0) {
      toast.showToast("V tomto segmentu není žádný způsobilý příjemce.", "error");
      return;
    }

    void confirm({
      title: "Odeslat kampaň?",
      message: `Zpráva se odešle segmentu „${seg?.label ?? segment}“ (${audience} příjemců).
Odeslání nelze vrátit zpět.`,
      confirmLabel: "Odeslat",
      cancelLabel: "Zrušit",
      variant: "destructive",
    }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        try {
          let id = form.draftId;
          if (!id) {
            const r = await createEmailCampaignDraft(v);
            id = r.id;
            setForm((prev) => ({ ...prev, draftId: id }));
          } else {
            await updateEmailCampaignDraft({ id, ...v });
          }
          const result = await sendEmailCampaign(id, segment);
          const parts = [`Odesláno: ${result.sent}`];
          if (result.failed) parts.push(`chyby: ${result.failed}`);
          if (result.skipped) parts.push(`přeskočeno: ${result.skipped}`);
          if (result.capped) parts.push(`(omezeno na ${result.cap} příjemců)`);
          toast.showToast(
            parts.join(", "),
            result.failed && !result.sent ? "error" : "success"
          );
          resetForm();
          router.refresh();
        } catch (e) {
          toast.showToast(
            e instanceof Error ? e.message : "Odeslání se nepovedlo.",
            "error"
          );
        }
      });
    });
  };

  const deleteDraft = (row: CampaignListRow) => {
    void confirm({
      title: "Smazat koncept?",
      message: `Koncept „${row.name}“ bude nenávratně smazán.`,
      confirmLabel: "Smazat",
      cancelLabel: "Zrušit",
      variant: "destructive",
    }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        try {
          await deleteEmailCampaignDraft(row.id);
          toast.showToast("Koncept byl smazán.", "success");
          if (form.draftId === row.id) resetForm();
          router.refresh();
        } catch (e) {
          toast.showToast(
            e instanceof Error ? e.message : "Nepodařilo se smazat koncept.",
            "error"
          );
        }
      });
    });
  };

  // --- Sub-komponenty ---

  const TemplateGallery = (
    <div>
      <h2 className="mb-3 ml-1 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
        Rychlý start (šablony)
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
        {CAMPAIGN_TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICONS[t.iconName] ?? Mail;
          const isActive = form.templateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => loadTemplate(t.id)}
              className={`group rounded-2xl border p-4 text-left transition-all duration-200 ${
                isActive
                  ? "border-indigo-500 bg-white shadow-md ring-2 ring-indigo-50"
                  : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] hover:border-indigo-200 hover:bg-white hover:shadow-sm"
              }`}
            >
              <div
                className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${t.accentClass}`}
              >
                <Icon size={18} />
              </div>
              <h3
                className={`text-xs font-bold leading-tight ${
                  isActive ? "text-indigo-700" : "text-[color:var(--wp-text)]"
                }`}
              >
                {t.name}
              </h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                {t.style}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const EditorBlock = (
    <div className="space-y-5 rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white p-5 shadow-sm md:p-7">
      <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] pb-4">
        <h2 className="text-base font-black text-[color:var(--wp-text)] md:text-lg">
          {form.draftId ? "Úprava konceptu" : "Nový koncept"}
        </h2>
        {form.draftId && (
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-1.5 text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-main-scroll-bg)]"
          >
            Nový
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="ec-name" className={labelClass}>
            Název (interní)
          </label>
          <input
            id="ec-name"
            type="text"
            value={form.internalName}
            onChange={(e) => handleField("internalName", e.target.value)}
            placeholder="Např. Jarní newsletter 2026"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ec-segment" className={labelClass}>
            Segment klientů (příjemci)
          </label>
          <div className="relative">
            <select
              id="ec-segment"
              value={form.segment}
              onChange={(e) => handleField("segment", e.target.value as CampaignSegmentId)}
              className={`${inputClass} cursor-pointer appearance-none pr-10`}
            >
              {CAMPAIGN_SEGMENTS.map((s) => {
                const count = segmentMap.get(s.id)?.count ?? 0;
                const label =
                  s.id === "test" ? s.label : `${s.label} (${count})`;
                return (
                  <option key={s.id} value={s.id}>
                    {label}
                  </option>
                );
              })}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]"
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="ec-subject" className={labelClass}>
          Předmět e-mailu
        </label>
        <input
          id="ec-subject"
          type="text"
          value={form.subject}
          onChange={(e) => handleField("subject", e.target.value)}
          placeholder="Předmět, který uvidí klient..."
          className={inputClass}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className={labelClass + " !mb-0"}>Obsah e-mailu</label>
          <div className="inline-flex rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-0.5 text-[11px] font-bold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setEditorMode("visual")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                editorMode === "visual"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
              }`}
              aria-pressed={editorMode === "visual"}
            >
              <Type size={12} /> Vizuálně
            </button>
            <button
              type="button"
              onClick={() => setEditorMode("source")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                editorMode === "source"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
              }`}
              aria-pressed={editorMode === "source"}
            >
              <Code size={12} /> Zdroj HTML
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[color:var(--wp-surface-card-border)] transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] px-3 py-2">
            <ToolbarBtn
              onClick={() =>
                editorMode === "visual"
                  ? execCmd("bold")
                  : wrapSelection("<strong>", "</strong>", "text")
              }
              label="Tučně"
            >
              <Bold size={16} />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() =>
                editorMode === "visual"
                  ? execCmd("italic")
                  : wrapSelection("<em>", "</em>", "text")
              }
              label="Kurzíva"
            >
              <Italic size={16} />
            </ToolbarBtn>
            <div className="mx-1 h-5 w-px bg-[color:var(--wp-surface-card-border)]" />
            <ToolbarBtn
              onClick={() =>
                editorMode === "visual"
                  ? execCmd("insertUnorderedList")
                  : wrapSelection("<ul><li>", "</li></ul>", "položka")
              }
              label="Odrážky"
            >
              <List size={16} />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() =>
                editorMode === "visual"
                  ? execCmd("insertOrderedList")
                  : wrapSelection("<ol><li>", "</li></ol>", "položka")
              }
              label="Číslovaný seznam"
            >
              <ListOrdered size={16} />
            </ToolbarBtn>
            <div className="mx-1 h-5 w-px bg-[color:var(--wp-surface-card-border)]" />
            <ToolbarBtn onClick={insertLink} label="Odkaz">
              <Link2 size={16} />
            </ToolbarBtn>
            <ToolbarBtn onClick={insertImage} label="Obrázek">
              <ImageIcon size={16} />
            </ToolbarBtn>
          </div>
          {editorMode === "visual" ? (
            <div
              ref={visualRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) =>
                setForm((prev) => ({
                  ...prev,
                  bodyHtml: (e.currentTarget as HTMLDivElement).innerHTML,
                }))
              }
              onBlur={(e) =>
                setForm((prev) => ({
                  ...prev,
                  bodyHtml: (e.currentTarget as HTMLDivElement).innerHTML,
                }))
              }
              className="block min-h-[240px] w-full resize-y overflow-auto bg-white p-4 text-sm leading-relaxed text-[color:var(--wp-text)] outline-none [&_a]:text-indigo-600 [&_a]:underline [&_img]:max-w-full [&_img]:rounded-md [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
              data-placeholder="Začněte psát obsah e-mailu..."
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={form.bodyHtml}
              onChange={(e) => handleField("bodyHtml", e.target.value)}
              className="block min-h-[240px] w-full resize-y bg-white p-4 font-mono text-xs leading-relaxed text-[color:var(--wp-text)] outline-none md:text-[13px]"
              placeholder="Začněte psát obsah e-mailu..."
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--wp-surface-card-border)] bg-indigo-50/50 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
              Vložit proměnnou
            </span>
            <div className="flex flex-wrap gap-2">
              <VariableBtn onClick={() => insertVariable("jmeno")}>{"{{jmeno}}"}</VariableBtn>
              <VariableBtn onClick={() => insertVariable("cele_jmeno")}>
                {"{{cele_jmeno}}"}
              </VariableBtn>
              <VariableBtn onClick={() => insertVariable("unsubscribe_url")}>
                {"{{unsubscribe_url}}"}
              </VariableBtn>
            </div>
          </div>
        </div>
        <p className="mt-2 ml-1 flex items-start gap-1.5 text-[11px] font-medium text-[color:var(--wp-text-secondary)]">
          <Info size={12} className="mt-0.5 shrink-0 text-indigo-400" />
          {editorMode === "visual"
            ? "Pište jako ve Wordu – formátování se uloží jako HTML."
            : "Pole podporuje HTML."}{" "}
          Proměnné <code className="mx-1 rounded bg-[color:var(--wp-surface-muted)] px-1 font-mono text-[10px]">{"{{jmeno}}"}</code>
          a <code className="mx-1 rounded bg-[color:var(--wp-surface-muted)] px-1 font-mono text-[10px]">{"{{cele_jmeno}}"}</code> se při odeslání nahradí.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={saveDraft}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-5 py-2.5 text-sm font-bold text-[color:var(--wp-text)] shadow-sm transition-all hover:bg-[color:var(--wp-main-scroll-bg)] disabled:opacity-50"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {form.draftId ? "Uložit změny" : "Uložit jako koncept"}
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={sendTest}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--wp-surface-muted)] px-4 py-2.5 text-sm font-bold text-[color:var(--wp-text)] transition-all hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
          >
            <Eye size={16} /> Odeslat test
          </button>
          <button
            type="button"
            onClick={sendCampaign}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--wp-primary)] px-5 py-2.5 text-sm font-black tracking-wide text-white shadow-lg shadow-indigo-900/20 transition-all hover:bg-[color:var(--wp-primary-hover)] active:scale-95 disabled:opacity-60"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Odeslat kampaň
          </button>
        </div>
      </div>
    </div>
  );

  const PreviewBlock = (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
          <Eye size={16} /> Živý náhled e-mailu
        </h3>
        <div className="flex rounded-lg bg-[color:var(--wp-surface-muted)] p-1">
          <button
            type="button"
            onClick={() => setPreviewDevice("desktop")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold transition-colors ${
              previewDevice === "desktop"
                ? "bg-white text-[color:var(--wp-text)] shadow-sm"
                : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
            }`}
          >
            <Monitor size={12} /> Desktop
          </button>
          <button
            type="button"
            onClick={() => setPreviewDevice("mobile")}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold transition-colors ${
              previewDevice === "mobile"
                ? "bg-white text-[color:var(--wp-text)] shadow-sm"
                : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
            }`}
          >
            <Smartphone size={12} /> Mobil
          </button>
        </div>
      </div>

      <div className="flex h-[620px] flex-col overflow-hidden rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white shadow-xl shadow-[color:var(--wp-surface-card-border)]/50">
        <div className="shrink-0 space-y-3 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-5">
          <div className="flex items-center gap-4 text-sm">
            <span className="w-12 shrink-0 font-bold text-[color:var(--wp-text-tertiary)]">Od:</span>
            <span className="truncate font-bold text-[color:var(--wp-text)]">{fromLabel}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="w-12 shrink-0 font-bold text-[color:var(--wp-text-tertiary)]">Komu:</span>
            <span className="truncate rounded-md bg-[color:var(--wp-surface-muted)] px-2 py-0.5 font-bold text-[color:var(--wp-text)]">
              jan.novak@email.cz
            </span>
          </div>
          <div className="flex items-start gap-4 border-t border-[color:var(--wp-surface-card-border)]/60 pt-3 text-sm">
            <span className="mt-0.5 w-12 shrink-0 font-bold text-[color:var(--wp-text-tertiary)]">Předmět:</span>
            <span className="font-bold text-[color:var(--wp-text)]">
              {previewSubject || (
                <span className="font-medium italic text-[color:var(--wp-text-tertiary)]">Bez předmětu</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-[color:var(--wp-surface-muted)] p-4">
          <div
            className={`mx-auto transition-all ${
              previewDevice === "mobile" ? "max-w-[320px]" : "max-w-[600px]"
            }`}
          >
            {form.bodyHtml.trim() ? (
              <div
                className="overflow-hidden rounded-lg bg-white shadow-sm"
                dangerouslySetInnerHTML={{ __html: previewBody }}
              />
            ) : (
              <div className="rounded-lg bg-white p-6 text-center text-sm italic text-[color:var(--wp-text-tertiary)]">
                Zde se zobrazí obsah vašeho e-mailu…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const HistoryDesktop = (
    <div className="overflow-hidden rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]">
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Název kampaně
              </th>
              <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Předmět
              </th>
              <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Odesláno
              </th>
              <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                {/* Nový sloupec — failedCount byl dostupný v datech, ale na desktopu se nikde nezobrazoval. */}
                Chyby
              </th>
              <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Výkon
              </th>
              <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Status
              </th>
              <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Akce
              </th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-[color:var(--wp-text-tertiary)]">
                  Zatím žádný koncept ani odeslaná kampaň.
                </td>
              </tr>
            ) : (
              initialRows.map((row) => (
                <tr
                  key={row.id}
                  className="group border-b border-[color:var(--wp-surface-card-border)] transition-colors last:border-0 hover:bg-[color:var(--wp-main-scroll-bg)]/80"
                >
                  <td className="px-5 py-4">
                    <div className="text-[15px] font-bold text-[color:var(--wp-text)] transition-colors group-hover:text-indigo-600">
                      {row.name}
                    </div>
                    <div className="text-xs font-bold text-[color:var(--wp-text-secondary)]">
                      {formatPragueDate(row.createdAt)}
                    </div>
                  </td>
                  <td className="max-w-[260px] truncate px-5 py-4 text-sm font-medium text-[color:var(--wp-text-secondary)]">
                    {row.subject}
                  </td>
                  <td className="px-5 py-4 text-center text-sm font-bold text-[color:var(--wp-text-secondary)]">
                    {row.status === "sent" || row.status === "sending"
                      ? `${row.sentCount} příjemců`
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-center text-sm">
                    {row.status === "sent" || row.status === "sending" ? (
                      row.failedCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-600"
                          title={`${row.failedCount} selhaných odeslání`}
                        >
                          {row.failedCount}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600">0</span>
                      )
                    ) : (
                      <span className="text-xs font-bold text-[color:var(--wp-text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {row.status === "sent" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                        <MousePointerClick size={12} className="text-[color:var(--wp-text-tertiary)]" />
                        Metriky nejsou sledovány
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-[color:var(--wp-text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {row.status === "draft" && (
                        <>
                          <button
                            type="button"
                            onClick={() => loadDraft(row)}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
                          >
                            <PenSquare size={12} /> Pokračovat
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDraft(row)}
                            className="inline-flex items-center rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white p-1.5 text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-main-scroll-bg)] hover:text-rose-600"
                            aria-label="Smazat koncept"
                            title="Smazat koncept"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const HistoryMobile = (
    <div className="space-y-3">
      {initialRows.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-8 text-center text-sm text-[color:var(--wp-text-tertiary)]">
          Zatím žádný koncept ani odeslaná kampaň.
        </div>
      ) : (
        initialRows.map((row) => (
          <div
            key={row.id}
            className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-4 shadow-sm"
          >
            <div className="absolute right-0 top-0">
              <StatusBadgeCorner status={row.status} />
            </div>
            <div className="pr-20">
              <h3 className="mb-1 text-sm font-bold leading-tight text-[color:var(--wp-text)]">{row.name}</h3>
              <p className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)]">
                {formatPragueDateTime(row.createdAt)}
              </p>
              <p className="mt-1 line-clamp-2 text-xs font-medium text-[color:var(--wp-text-secondary)]">{row.subject}</p>
            </div>

            {(row.status === "sent" || row.status === "sending") && (
              <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-3 text-center">
                <div>
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                    Odesláno
                  </span>
                  <span className="text-sm font-black text-[color:var(--wp-text)]">{row.sentCount}</span>
                </div>
                <div>
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                    Chyby
                  </span>
                  <span className="text-sm font-black text-rose-500">{row.failedCount}</span>
                </div>
              </div>
            )}

            {row.status === "draft" && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => loadDraft(row)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700"
                >
                  <PenSquare size={12} /> Pokračovat
                </button>
                <button
                  type="button"
                  onClick={() => deleteDraft(row)}
                  className="inline-flex items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white p-2 text-[color:var(--wp-text-secondary)]"
                  aria-label="Smazat koncept"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  // --- Layout ---

  return (
    <PortalPageShell
      maxWidth="full"
      flushTop
      outerClassName="pb-24 md:pb-12 text-[color:var(--wp-text)]"
      innerClassName="!max-w-[1600px] !px-0 !pt-0"
    >
      {/* Mobile header + tabs */}
      <div className="sticky top-0 z-30 border-b border-[color:var(--wp-surface-card-border)] bg-white/90 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <h1 className="text-lg font-black tracking-tight text-[color:var(--wp-text)]">
              E-mail kampaně
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              Nástroje poradce
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-4">
          {(["editor", "preview", "history"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMobileView(v)}
              className={`relative flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors ${
                mobileView === v ? "text-indigo-600" : "text-[color:var(--wp-text-tertiary)]"
              }`}
            >
              {v === "editor" ? "Editor" : v === "preview" ? "Náhled" : "Historie"}
              {mobileView === v && (
                <span className="absolute bottom-0 left-0 h-[3px] w-full rounded-t-md bg-indigo-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 p-4 md:space-y-8 md:p-8">
        {/* Desktop header */}
        <div className="hidden items-end justify-between gap-6 md:flex">
          <div>
            <h1 className="mb-2 flex items-center gap-3 text-3xl font-black tracking-tight text-[color:var(--wp-text)]">
              <Mail className="text-indigo-500" size={32} />
              E-mailové kampaně
            </h1>
            <p className="max-w-xl text-sm font-medium text-[color:var(--wp-text-secondary)]">
              Hromadné a personalizované oslovení vašich klientů. Vytvořte kampaň od nuly
              nebo použijte předpřipravenou šablonu.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-medium leading-relaxed text-amber-900">
          <Info size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            <strong className="font-black">MVP:</strong> Základní rozesílka je funkční (Resend,
            personalizace, testovací odeslání). Sledování otevření a prokliků zatím není k dispozici.
          </span>
        </div>

        {/* Desktop: template gallery always visible; mobile: only in editor */}
        <div className={`${mobileView === "editor" ? "block" : "hidden"} md:block`}>
          {TemplateGallery}
        </div>

        {/* Desktop split view */}
        <div className="hidden grid-cols-12 items-start gap-8 md:grid">
          <div className="col-span-7">{EditorBlock}</div>
          <div className="col-span-5 sticky top-24">{PreviewBlock}</div>
        </div>

        {/* Mobile single-column view */}
        <div className="md:hidden">
          {mobileView === "editor" && EditorBlock}
          {mobileView === "preview" && PreviewBlock}
          {mobileView === "history" && HistoryMobile}
        </div>

        {/* Desktop history */}
        <div className="hidden border-t border-[color:var(--wp-surface-card-border)] pt-10 md:block">
          <h2 className="mb-6 flex items-center gap-3 text-2xl font-black tracking-tight text-[color:var(--wp-text)]">
            <Clock className="text-indigo-500" size={24} />
            Poslední kampaně
          </h2>
          {HistoryDesktop}
        </div>
      </div>

      {/* Mobile fixed action bar */}
      {(mobileView === "editor" || mobileView === "preview") && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--wp-surface-card-border)] bg-white/95 p-3 pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-10px_30px_rgba(0,0,0,0.04)] backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={pending}
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white px-4 text-[color:var(--wp-text)] shadow-sm active:scale-95 disabled:opacity-50"
              aria-label="Uložit koncept"
            >
              {pending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            </button>
            <button
              type="button"
              onClick={sendTest}
              disabled={pending}
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-2xl bg-[color:var(--wp-surface-muted)] px-4 text-xs font-bold text-[color:var(--wp-text)] active:scale-95 disabled:opacity-50"
            >
              <Eye size={16} />
            </button>
            <button
              type="button"
              onClick={sendCampaign}
              disabled={pending}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[color:var(--wp-primary)] text-sm font-black tracking-wide text-white shadow-lg shadow-black/20 active:scale-95 disabled:opacity-60"
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Odeslat
            </button>
          </div>
        </div>
      )}
    </PortalPageShell>
  );
}

function ToolbarBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
    >
      {children}
    </button>
  );
}

function VariableBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100"
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
        <CheckCircle2 size={12} /> Odesláno
      </span>
    );
  }
  if (status === "sending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
        <Loader2 size={12} className="animate-spin" /> Odesílání
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700">
        Selhalo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
      <Clock size={12} /> {statusLabel(status)}
    </span>
  );
}

function StatusBadgeCorner({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-amber-100 text-amber-700",
    sent: "bg-emerald-100 text-emerald-700",
    sending: "bg-blue-100 text-blue-700",
    failed: "bg-rose-100 text-rose-700",
  };
  const cls = styles[status] ?? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]";
  return (
    <span
      className={`rounded-bl-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${cls}`}
    >
      {statusLabel(status)}
    </span>
  );
}
