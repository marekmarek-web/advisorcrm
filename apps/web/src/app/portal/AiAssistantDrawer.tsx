"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  UploadCloud,
  FileText,
  AlertCircle,
  MessageCircle,
  Zap,
  UserPlus,
} from "lucide-react";
import { useToast } from "@/app/components/Toast";
import { useAiAssistantDrawer } from "./AiAssistantDrawerContext";
import type { SuggestedAction } from "@/lib/ai/dashboard-types";
import {
  getCsvPreview,
  getSpreadsheetPreview,
  importContactsCsv,
  importContactsFromSpreadsheet,
  type CsvPreview,
  type ColumnMapping,
} from "@/app/actions/csv-import";

type DraftAction = { type: string; label: string; payload: Record<string, unknown> };
type ClientCandidate = { clientId: string; displayName?: string };

type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      suggestedActions?: SuggestedAction[];
      warnings?: string[];
      reviewId?: string;
      draftActions?: DraftAction[];
      clientMatchCandidates?: ClientCandidate[];
    };

type UploadPhase = "idle" | "uploading" | "processing";

function getHref(action: SuggestedAction): string | null {
  if (action.type === "open_review" && action.payload.reviewId) {
    return `/portal/contracts/review/${action.payload.reviewId}`;
  }
  if (action.type === "view_client" && action.payload.clientId) {
    return `/portal/contacts/${action.payload.clientId}`;
  }
  if (action.type === "open_task") {
    return "/portal/tasks";
  }
  return null;
}

function formatUploadSuccessMessage(detail: {
  extractedPayload?: Record<string, unknown>;
  confidence?: number | null;
  reasonsForReview?: string[] | null;
}): string {
  const extracted = detail.extractedPayload ?? {};
  const client = extracted.client as Record<string, unknown> | undefined;
  const clientName = client
    ? [client.fullName, client.firstName, client.lastName].filter(Boolean).join(" ") || "—"
    : "—";
  const lines: string[] = [];
  lines.push(`Našla jsem smlouvu od ${extracted.institutionName ?? "neznámé instituce"}.`);
  lines.push(`Pravděpodobný klient: ${clientName}.`);
  if (extracted.contractNumber) lines.push(`Číslo smlouvy: ${extracted.contractNumber}.`);
  const conf = detail.confidence != null ? Math.round(detail.confidence * 100) : null;
  if (conf != null) lines.push(`Jistota: ${conf} %.`);
  const missing = (extracted.missingFields as string[] | undefined) ?? [];
  const reasons = detail.reasonsForReview ?? [];
  if (missing.length || reasons.length) {
    const parts = [...missing, ...reasons];
    lines.push(`Chybějící / k ověření: ${parts.join(", ")}.`);
  }
  lines.push("Doporučené akce:");
  return lines.join("\n");
}

export function AiAssistantDrawer() {
  const { open, setOpen } = useAiAssistantDrawer();
  const router = useRouter();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contactsImportFileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadZoneRef = useRef<HTMLDivElement>(null);

  const [importContactsStep, setImportContactsStep] = useState<"idle" | "mapping" | "preview" | "done">("idle");
  const [importContactsFile, setImportContactsFile] = useState<File | null>(null);
  const [importContactsPreview, setImportContactsPreview] = useState<CsvPreview | null>(null);
  const [importContactsMapping, setImportContactsMapping] = useState<ColumnMapping>({ firstName: 0, lastName: 1, email: 2, phone: 3 });
  const [importContactsResult, setImportContactsResult] = useState<{ imported: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const [importContactsLoading, setImportContactsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const handleSendChat = async () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.showToast(data.error ?? "Odeslání selhalo.", "error");
        setMessages((prev) => prev.slice(0, -1));
        setInput(msg);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message ?? "",
          suggestedActions: data.suggestedActions ?? [],
          warnings: data.warnings ?? [],
        },
      ]);
    } catch {
      toast.showToast("Odeslání zprávy selhalo.", "error");
      setMessages((prev) => prev.slice(0, -1));
      setInput(msg);
    } finally {
      setChatLoading(false);
    }
  };

  const handleUrgent = async () => {
    setMessages((prev) => [...prev, { role: "user", content: "Co je dnes urgentní?" }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/dashboard-summary");
      const data = await res.json();
      if (!res.ok) {
        toast.showToast("Načtení shrnutí selhalo.", "error");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      const summary = data.assistantSummaryText ?? "Nemám žádné urgentní položky.";
      const actions = data.suggestedActions ?? [];
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: summary, suggestedActions: actions, warnings: [] },
      ]);
    } catch {
      toast.showToast("Načtení selhalo.", "error");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  };

  const handleDraftEmail = async (clientId: string) => {
    try {
      const res = await fetch("/api/ai/assistant/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, context: "follow_up" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.showToast(data.error ?? "Návrh e-mailu selhal.", "error");
        return;
      }
      const text = `${data.subject}\n\n${data.body}`;
      await navigator.clipboard.writeText(text);
      toast.showToast("Návrh e-mailu zkopírován do schránky.", "success");
    } catch {
      toast.showToast("Kopírování selhalo.", "error");
    }
  };

  const handleAction = (action: SuggestedAction, reviewId?: string) => {
    const href = getHref(action);
    if (href) {
      setOpen(false);
      router.push(href);
      return;
    }
    if (action.type === "draft_email" && action.payload.clientId) {
      handleDraftEmail(action.payload.clientId as string);
      return;
    }
    if (action.type === "create_task") {
      setOpen(false);
      router.push("/portal/tasks");
    }
    if (reviewId) {
      setOpen(false);
      router.push(`/portal/contracts/review/${reviewId}`);
    }
  };

  const handleOpenReview = (reviewId: string) => {
    setOpen(false);
    router.push(`/portal/contracts/review/${reviewId}`);
  };

  const handleFile = async (file: File) => {
    if (!file?.size) return;
    if (file.type !== "application/pdf") {
      toast.showToast("Povolený formát je pouze PDF.", "error");
      return;
    }
    setUploadError(null);
    setUploadPhase("uploading");
    setMessages((prev) => [...prev, { role: "user", content: `Nahrán soubor: ${file.name}` }]);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/contracts/upload", { method: "POST", body: formData });
      const uploadData = await res.json();
      if (!res.ok) {
        setUploadError(uploadData.error ?? "Nahrání selhalo.");
        setMessages((prev) => prev.slice(0, -1));
        setUploadPhase("idle");
        return;
      }
      const reviewId = uploadData.id as string;
      setUploadPhase("processing");
      const detailRes = await fetch(`/api/contracts/review/${reviewId}`);
      const detail = await detailRes.json();
      if (!detailRes.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Smlouva byla nahrána. Stav: ${uploadData.processingStatus ?? "—"}. Otevřete review pro další kroky.`,
            reviewId,
            draftActions: [],
            clientMatchCandidates: [],
          },
        ]);
        setUploadPhase("idle");
        return;
      }
      const content = formatUploadSuccessMessage(detail);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content,
          reviewId,
          draftActions: detail.draftActions ?? [],
          clientMatchCandidates: (detail.clientMatchCandidates ?? []).map(
            (c: { clientId: string; displayName?: string }) => ({
              clientId: c.clientId,
              displayName: c.displayName,
            })
          ),
        },
      ]);
    } catch {
      setUploadError("Zpracování souboru selhalo.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setUploadPhase("idle");
    }
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  };

  const handleImportContactsClick = () => {
    setImportContactsResult(null);
    contactsImportFileRef.current?.click();
  };

  const isExcelFile = (f: File) =>
    f.name.toLowerCase().endsWith(".xlsx") ||
    f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const handleImportContactsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportContactsFile(file);
    setImportContactsPreview(null);
    setImportContactsResult(null);
    setImportContactsStep("mapping");
    setImportContactsLoading(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const preview = isExcelFile(file)
        ? await getSpreadsheetPreview(fd)
        : await getCsvPreview(fd);
      if (preview) {
        setImportContactsPreview(preview);
      } else {
        toast.showToast("Nepodařilo se načíst náhled souboru.", "error");
        setImportContactsStep("idle");
        setImportContactsFile(null);
      }
    } catch {
      toast.showToast("Načtení souboru selhalo.", "error");
      setImportContactsStep("idle");
      setImportContactsFile(null);
    } finally {
      setImportContactsLoading(false);
    }
  };

  const handleImportContactsConfirm = async () => {
    if (!importContactsFile || !importContactsPreview) return;
    setImportContactsLoading(true);
    setImportContactsResult(null);
    const fd = new FormData();
    fd.set("file", importContactsFile);
    try {
      const result = isExcelFile(importContactsFile)
        ? await importContactsFromSpreadsheet(fd, importContactsMapping)
        : await importContactsCsv(fd, importContactsMapping, importContactsPreview.hasHeader);
      setImportContactsResult(result);
      setImportContactsStep("done");
      if (result.imported > 0) {
        router.refresh();
        toast.showToast(`Importováno ${result.imported} klientů.`);
      }
    } catch {
      toast.showToast("Import selhal.", "error");
    } finally {
      setImportContactsLoading(false);
    }
  };

  const handleImportContactsReset = () => {
    setImportContactsFile(null);
    setImportContactsPreview(null);
    setImportContactsResult(null);
    setImportContactsStep("idle");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay jen vlevo od panelu (na desktopu), aby klik do panelu nezavíral */}
      <div
        className="fixed inset-0 md:right-[420px] z-[var(--z-drawer-overlay,100)] bg-transparent"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className="fixed inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-full md:max-w-[420px] z-[101] flex flex-col bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-label="AI asistent"
      >
        {/* Header - reference style */}
        <div className="shrink-0 px-4 py-4 border-b border-slate-100 bg-white/80">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-[20px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 flex-shrink-0">
                <Sparkles size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">AI asistent</h2>
                <p className="text-sm font-medium text-slate-500 mt-0.5">
                  Nahrajte smlouvu nebo se zeptejte. Pomůžu s revizí a CRM.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors flex-shrink-0"
              aria-label="Zavřít"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="shrink-0 px-4 py-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhase !== "idle"}
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-slate-100 bg-white text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <UploadCloud size={18} className="text-indigo-500" />
            Nahrát smlouvu
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-slate-100 bg-white text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <MessageCircle size={18} className="text-indigo-500" />
            Zeptat se AI
          </button>
          <button
            type="button"
            onClick={handleUrgent}
            disabled={chatLoading}
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-slate-100 bg-white text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Zap size={18} className="text-indigo-500" />
            Co je dnes urgentní
          </button>
          <button
            type="button"
            onClick={handleImportContactsClick}
            disabled={importContactsLoading}
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-slate-100 bg-white text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <UserPlus size={18} className="text-indigo-500" />
            Import klientů
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleUploadInput}
        />
        <input
          ref={contactsImportFileRef}
          type="file"
          accept=".csv,.txt,.xlsx"
          className="hidden"
          onChange={handleImportContactsFileChange}
        />

        {/* Upload block - reference dropzone */}
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div
            ref={uploadZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => uploadPhase === "idle" && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-[24px] p-6 bg-white text-center cursor-pointer transition-all ${
              uploadPhase === "idle"
                ? "border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                : "border-slate-200 bg-slate-50/50 cursor-wait pointer-events-none"
            }`}
          >
            {uploadPhase === "idle" && !uploadError && (
              <>
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 mx-auto mb-3">
                  <UploadCloud size={28} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-black text-slate-800 mb-1">Přetáhněte smlouvu sem</p>
                <p className="text-xs text-slate-500 font-medium">nebo klikněte pro výběr (PDF)</p>
              </>
            )}
            {uploadPhase === "uploading" && (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 size={28} className="animate-spin text-indigo-500" />
                <p className="text-sm font-bold text-slate-600">Nahrávám…</p>
              </div>
            )}
            {uploadPhase === "processing" && (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <p className="text-sm font-medium text-slate-600">AI čte dokument a extrahuje data…</p>
              </div>
            )}
          </div>
          {uploadError && (
            <div className="mt-2 rounded-2xl p-3 bg-rose-50 border border-rose-200 flex items-start gap-2">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-rose-800">{uploadError}</p>
                <button
                  type="button"
                  onClick={() => { setUploadError(null); fileInputRef.current?.click(); }}
                  className="text-xs font-bold text-rose-600 hover:underline mt-1"
                >
                  Zkusit znovu
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Import klientů block */}
        {importContactsStep !== "idle" && (
          <div className="shrink-0 px-4 pb-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Import klientů</h3>
              {importContactsLoading && importContactsStep === "mapping" && (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                  <Loader2 size={16} className="animate-spin" />
                  Načítám náhled…
                </div>
              )}
              {importContactsStep === "mapping" && importContactsPreview && !importContactsLoading && (
                <>
                  <p className="text-xs text-slate-500 mb-2">Soubor: {importContactsFile?.name}</p>
                  <p className="text-xs text-slate-500 mb-2">Namapujte sloupce:</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {(["firstName", "lastName", "email", "phone"] as const).map((field) => (
                      <div key={field} className="flex flex-col gap-0.5">
                        <label className="text-xs font-medium text-slate-600">
                          {field === "firstName" ? "Jméno" : field === "lastName" ? "Příjmení" : field === "email" ? "E-mail" : "Telefon"}
                        </label>
                        <select
                          value={importContactsMapping[field]}
                          onChange={(e) => setImportContactsMapping((m) => ({ ...m, [field]: Number(e.target.value) }))}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        >
                          {importContactsPreview.headers.map((h, i) => (
                            <option key={i} value={i}>{i}: {h || "(prázdný)"}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleImportContactsReset}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportContactsStep("preview")}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                    >
                      Další: Náhled
                    </button>
                  </div>
                </>
              )}
              {importContactsStep === "preview" && importContactsPreview && (
                <>
                  <p className="text-xs text-slate-500 mb-2">Náhled (max 10 řádků):</p>
                  <div className="overflow-x-auto max-h-32 overflow-y-auto border border-slate-100 rounded-lg mb-3 text-xs">
                    <table className="border-collapse w-full">
                      <tbody>
                        {importContactsPreview.rows.slice(0, 10).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="border border-slate-100 px-2 py-0.5">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setImportContactsStep("mapping")}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
                    >
                      Zpět
                    </button>
                    <button
                      type="button"
                      onClick={handleImportContactsConfirm}
                      disabled={importContactsLoading}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {importContactsLoading ? "Importuji…" : `Přidat ${importContactsPreview.totalRows ?? importContactsPreview.rows.length} klientů`}
                    </button>
                  </div>
                </>
              )}
              {importContactsStep === "done" && importContactsResult && (
                <>
                  <div className="text-sm mb-3">
                    <p className="text-green-700 font-medium">Importováno: {importContactsResult.imported}</p>
                    {importContactsResult.skipped > 0 && <p className="text-amber-700">Přeskočeno (duplicity): {importContactsResult.skipped}</p>}
                    {importContactsResult.errors.length > 0 && (
                      <p className="text-amber-700">Chyby: {importContactsResult.errors.length} řádků</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleImportContactsReset}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50"
                    >
                      Importovat znovu
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOpen(false); router.push("/portal/contacts"); }}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
                    >
                      Přejít na Klienti
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Chat history */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 space-y-3">
            {messages.length === 0 && uploadPhase === "idle" && (
              <p className="text-sm text-slate-500 font-medium py-2">
                Napište zprávu nebo nahrajte PDF. Po zpracování vám nabídneme další kroky.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white border border-slate-100 shadow-sm"
                  }`}
                >
                  <p className={`whitespace-pre-wrap ${m.role === "user" ? "text-white" : "text-slate-600"}`}>{m.content}</p>
                  {m.role === "assistant" && m.warnings && m.warnings.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 text-amber-700 text-xs font-medium">
                      <AlertCircle size={14} />
                      {m.warnings.join(" ")}
                    </div>
                  )}
                  {m.role === "assistant" && (m.suggestedActions?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {m.suggestedActions!.map((a, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => handleAction(a)}
                          className="text-xs px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 font-bold hover:bg-indigo-100 transition-colors"
                        >
                          {a.label.length > 28 ? a.label.slice(0, 26) + "…" : a.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && m.reviewId && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => handleOpenReview(m.reviewId!)}
                        className="text-xs font-black px-4 py-2 rounded-xl bg-[#1a1c2e] text-white shadow-sm hover:bg-[#2a2d4a] transition-colors uppercase tracking-wider"
                      >
                        Otevřít review
                      </button>
                      {(() => {
                        const clientId = m.clientMatchCandidates?.[0]?.clientId;
                        return clientId ? (
                          <button
                            type="button"
                            onClick={() => handleDraftEmail(clientId)}
                            className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                          >
                            Připravit email
                          </button>
                        ) : null;
                      })()}
                      {(m.draftActions ?? []).map((d, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => handleOpenReview(m.reviewId!)}
                          className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                        >
                          {d.label.length > 24 ? d.label.slice(0, 22) + "…" : d.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 bg-white border border-slate-100 shadow-sm flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-indigo-500" />
                  <span className="text-sm text-slate-500 font-medium">Přemýšlím…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area - reference */}
          <div className="shrink-0 p-4 pt-2 border-t border-slate-100 bg-white/80">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                placeholder="Zeptejte se asistenta…"
                className="flex-1 min-w-0 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={handleSendChat}
                disabled={chatLoading || !input.trim()}
                className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                aria-label="Odeslat"
              >
                {chatLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Např. přiřaď smlouvu ke klientovi, vytvoř úkol, připrav email…
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
