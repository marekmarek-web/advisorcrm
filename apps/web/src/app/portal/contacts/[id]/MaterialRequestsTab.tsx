"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  createAdvisorMaterialRequest,
  getAdvisorMaterialRequestDetail,
  listAdvisorMaterialRequestsForContact,
  updateAdvisorMaterialRequestInternalNote,
  setAdvisorMaterialRequestStatus,
  deleteAdvisorMaterialRequest,
  addAdvisorMaterialRequestReply,
  linkMaterialRequestDocumentToClientVault,
} from "@/app/actions/advisor-material-requests";
import {
  MATERIAL_REQUEST_CATEGORY_IDS,
  materialRequestCategoryLabel,
  type MaterialRequestDetail,
  type MaterialRequestListItem,
  type MaterialRequestsTabInitialPayload,
} from "@/lib/advisor-material-requests/display";
import { useToast } from "@/app/components/Toast";
import { useConfirm } from "@/app/components/ConfirmDialog";

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    new: "Nový",
    seen: "Zobrazeno",
    answered: "Klient odpověděl",
    needs_more: "Čeká na doplnění",
    done: "Splněno",
    closed: "Uzavřeno",
  };
  return m[s] ?? s;
}

function priorityLabel(p: string): string {
  const m: Record<string, string> = {
    low: "Nízká",
    normal: "Běžná",
    high: "Vysoká",
  };
  return m[p] ?? p;
}

export type { MaterialRequestsTabInitialPayload };

function MaterialRequestsTabInner({
  contactId,
  initialPayload,
}: {
  contactId: string;
  initialPayload?: MaterialRequestsTabInitialPayload;
}) {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const resolvedInitialDetail =
    initialPayload?.detail &&
    initialPayload.selectedId &&
    initialPayload.detail.id === initialPayload.selectedId
      ? initialPayload.detail
      : null;

  const [list, setList] = useState<MaterialRequestListItem[]>(() => initialPayload?.list ?? []);
  const [loading, setLoading] = useState(() => initialPayload == null);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialPayload?.selectedId ?? null);
  const [detail, setDetail] = useState<MaterialRequestDetail | null>(() => resolvedInitialDetail);
  const [detailLoading, setDetailLoading] = useState(
    () => !!(initialPayload?.selectedId && !resolvedInitialDetail),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formCategory, setFormCategory] = useState<string>(MATERIAL_REQUEST_CATEGORY_IDS[0]);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<"low" | "normal" | "high">("normal");
  const [formDue, setFormDue] = useState("");
  const [formResponseMode, setFormResponseMode] = useState<"text" | "files" | "both" | "yes_no">("both");

  const [replyText, setReplyText] = useState("");
  const [internalNote, setInternalNote] = useState(() => resolvedInitialDetail?.internalNote ?? "");

  const detailRequestSeq = useRef(0);

  const loadList = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const rows = await listAdvisorMaterialRequestsForContact(contactId);
        setList(rows);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Nepodařilo se načíst požadavky.", "error");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [contactId, showToast],
  );

  useEffect(() => {
    if (initialPayload != null) return;
    void loadList();
  }, [initialPayload, loadList]);

  const materialRequestParam = searchParams.get("materialRequest");
  useEffect(() => {
    if (materialRequestParam?.trim()) {
      setSelectedId(materialRequestParam.trim());
    }
  }, [materialRequestParam]);

  const loadDetail = useCallback(
    async (id: string) => {
      const seq = ++detailRequestSeq.current;
      setDetailLoading(true);
      try {
        const d = await getAdvisorMaterialRequestDetail(id);
        if (seq !== detailRequestSeq.current) return;
        setDetail(d);
        setInternalNote(d?.internalNote ?? "");
      } catch {
        if (seq !== detailRequestSeq.current) return;
        setDetail(null);
        showToast("Detail se nepodařilo načíst.", "error");
      } finally {
        if (seq === detailRequestSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function handleCreate() {
    const title = formTitle.trim();
    if (!title) {
      showToast("Vyplňte předmět požadavku.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const due =
        formDue.trim().length >= 8
          ? new Date(`${formDue}T12:00:00`)
          : null;
      const res = await createAdvisorMaterialRequest({
        contactId,
        category: formCategory,
        title,
        description: formDescription.trim() || null,
        priority: formPriority,
        dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
        responseMode: formResponseMode,
      });
      if (res.ok) {
        showToast("Požadavek byl odeslán klientovi.", "success");
        setModalOpen(false);
        setFormTitle("");
        setFormDescription("");
        setFormDue("");
        await loadList({ silent: true });
        setSelectedId(res.id);
      } else {
        showToast(res.error, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveInternalNote() {
    if (!selectedId) return;
    const r = await updateAdvisorMaterialRequestInternalNote(selectedId, internalNote.trim() || null);
    if (r.ok) showToast("Interní poznámka uložena.", "success");
    else showToast(r.error, "error");
  }

  async function sendReply() {
    if (!selectedId || !replyText.trim()) return;
    const r = await addAdvisorMaterialRequestReply(selectedId, replyText);
    if (r.ok) {
      showToast("Zpráva odeslána klientovi.", "success");
      setReplyText("");
      await loadDetail(selectedId);
      await loadList({ silent: true });
    } else showToast(r.error, "error");
  }

  async function setStatus(
    status: "new" | "seen" | "answered" | "needs_more" | "done" | "closed"
  ) {
    if (!selectedId) return;
    const r = await setAdvisorMaterialRequestStatus(selectedId, status);
    if (r.ok) {
      showToast("Stav uložen.", "success");
      await loadDetail(selectedId);
      await loadList({ silent: true });
    } else showToast(r.error, "error");
  }

  async function removeFulfilledRequest() {
    if (!selectedId || detail?.status !== "done") return;
    if (
      !(await confirm({
        title: "Smazat požadavek",
        message:
          "Požadavek a komunikace k němu se odstraní z přehledu. Nahrané soubory v dokumentech klienta zůstanou uložené.",
        confirmLabel: "Smazat",
        variant: "destructive",
      }))
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const idToRemove = selectedId;
      const r = await deleteAdvisorMaterialRequest(idToRemove);
      if (r.ok) {
        showToast("Požadavek byl smazán.", "success");
        const nextFocus = list.find((x) => x.id !== idToRemove)?.id ?? null;
        setSelectedId(nextFocus);
        setDetail(null);
        await loadList({ silent: true });
      } else {
        showToast(r.error, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function promoteDoc(documentId: string, visible: boolean) {
    if (!selectedId) return;
    if (
      visible &&
      !(await confirm({
        title: "Zobrazit klientovi",
        message: "Soubor bude v klientském portálu viditelný pod dokumenty.",
        confirmLabel: "Zobrazit",
      }))
    ) {
      return;
    }
    const r = await linkMaterialRequestDocumentToClientVault(selectedId, documentId, {
      visibleToClient: visible,
    });
    if (r.ok) {
      showToast(visible ? "Dokument je viditelný klientovi." : "Uloženo.", "success");
      await loadDetail(selectedId);
    } else showToast(r.error, "error");
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8 min-h-[420px]">
      <div className="w-full lg:w-[min(100%,380px)] shrink-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="min-h-[44px] rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            Nový požadavek
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Zatím žádné požadavky. Vytvořte první a klient uvidí úkol v portálu.
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors min-h-[44px] ${
                    selectedId === row.id
                      ? "border-indigo-300 bg-indigo-50/80"
                      : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] hover:bg-[color:var(--wp-surface-muted)]"
                  }`}
                >
                  <p className="font-bold text-[color:var(--wp-text)] line-clamp-2">{row.title}</p>
                  <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">
                    {row.categoryLabel} · {statusLabel(row.status)}
                    {row.dueAt ? ` · do ${new Date(row.dueAt).toLocaleDateString("cs-CZ")}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 min-w-0 rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 md:p-6">
        {!selectedId ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Vyberte požadavek v seznamu vlevo nebo vytvořte nový.
          </p>
        ) : detailLoading ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám detail…</p>
        ) : !detail ? (
          <p className="text-sm text-red-600">Detail se nepodařilo načíst.</p>
        ) : (
          <div className="space-y-6">
            <header className="space-y-2 border-b border-[color:var(--wp-surface-card-border)] pb-4">
              <h2 className="text-lg font-black text-[color:var(--wp-text)]">{detail.title}</h2>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-[color:var(--wp-text-secondary)]">
                <span>{detail.categoryLabel}</span>
                <span>·</span>
                <span>{statusLabel(detail.status)}</span>
                <span>·</span>
                <span>Priorita: {priorityLabel(detail.priority)}</span>
                {detail.dueAt ? (
                  <>
                    <span>·</span>
                    <span>Termín: {new Date(detail.dueAt).toLocaleDateString("cs-CZ")}</span>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void setStatus("done")}
                  className="min-h-[40px] rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900"
                >
                  Označit jako splněno
                </button>
                <button
                  type="button"
                  onClick={() => void setStatus("closed")}
                  className="min-h-[40px] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] px-3 text-xs font-bold text-[color:var(--wp-text)]"
                >
                  Uzavřít
                </button>
                <button
                  type="button"
                  onClick={() => void setStatus("needs_more")}
                  className="min-h-[40px] rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900"
                >
                  Čeká na doplnění
                </button>
                {detail.status === "done" ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void removeFulfilledRequest()}
                    className="min-h-[40px] rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-900 disabled:opacity-50"
                  >
                    Smazat
                  </button>
                ) : null}
              </div>
            </header>

            <section aria-label="Komunikace">
              <h3 className="text-sm font-black text-[color:var(--wp-text)] mb-3">Komunikace</h3>
              <ul className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {detail.messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-xl px-3 py-2.5 text-sm ${
                      m.authorRole === "client"
                        ? "bg-emerald-50 border border-emerald-100"
                        : "bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)]"
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-tertiary)] mb-1">
                      {m.authorRole === "client" ? "Klient" : m.authorRole === "advisor" ? "Poradce" : "Systém"} ·{" "}
                      {new Date(m.createdAt).toLocaleString("cs-CZ")}
                    </p>
                    <p className="whitespace-pre-wrap text-[color:var(--wp-text)]">{m.body}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Přílohy">
              <h3 className="text-sm font-black text-[color:var(--wp-text)] mb-2">Přílohy</h3>
              {detail.attachments.length === 0 ? (
                <p className="text-xs text-[color:var(--wp-text-secondary)]">Zatím žádné přílohy.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.attachments.map((a) => (
                    <li
                      key={a.documentId}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-[color:var(--wp-surface-card-border)] px-3 py-2"
                    >
                      <a
                        href={`/api/documents/${a.documentId}/download`}
                        className="text-sm font-semibold text-indigo-600 hover:underline break-all"
                      >
                        {a.name}
                      </a>
                      <div className="flex flex-wrap gap-2">
                        {a.attachmentRole === "client" ? (
                          a.visibleToClient ? (
                            <span className="text-xs font-semibold text-emerald-700 min-h-[40px] inline-flex items-center">
                              Viditelné klientovi v dokumentech
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => void promoteDoc(a.documentId, true)}
                                className="text-xs font-bold min-h-[40px] px-2 rounded-lg bg-indigo-600 text-white"
                              >
                                Zobrazit v portálu
                              </button>
                              <button
                                type="button"
                                onClick={() => void promoteDoc(a.documentId, false)}
                                className="text-xs font-bold min-h-[40px] px-2 rounded-lg border border-[color:var(--wp-border)]"
                              >
                                Jen interně
                              </button>
                            </>
                          )
                        ) : (
                          <span className="text-xs text-[color:var(--wp-text-secondary)]">Příloha poradce</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <label className="text-sm font-bold text-[color:var(--wp-text)]">Další instrukce klientovi</label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-sm"
                placeholder="Krátká zpráva se objeví klientovi v portálu…"
              />
              <button
                type="button"
                disabled={!replyText.trim()}
                onClick={() => void sendReply()}
                className="min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                Odeslat klientovi
              </button>
            </section>

            <section className="space-y-2 border-t border-[color:var(--wp-surface-card-border)] pt-4">
              <label className="text-sm font-bold text-[color:var(--wp-text)]">Interní poznámka (klient nevidí)</label>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void saveInternalNote()}
                className="min-h-[40px] rounded-lg border border-[color:var(--wp-border)] px-3 text-xs font-bold"
              >
                Uložit poznámku
              </button>
            </section>
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Zavřít"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative z-[121] w-full max-w-lg rounded-t-2xl md:rounded-2xl bg-[color:var(--wp-surface-card)] p-6 shadow-2xl max-h-[90dvh] overflow-y-auto">
            <h3 className="text-lg font-black text-[color:var(--wp-text)] mb-4">Nový požadavek na podklady</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">Kategorie</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-border)] px-3 text-sm"
                >
                  {MATERIAL_REQUEST_CATEGORY_IDS.map((id) => (
                    <option key={id} value={id}>
                      {materialRequestCategoryLabel(id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">Předmět</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-border)] px-3 text-sm"
                  placeholder="např. Doložit občanský průkaz"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">Popis</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-[color:var(--wp-border)] px-3 py-2 text-sm"
                  placeholder="Co přesně klient má dodat…"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">Priorita</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as "low" | "normal" | "high")}
                    className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-border)] px-3 text-sm"
                  >
                    <option value="low">Nízká</option>
                    <option value="normal">Běžná</option>
                    <option value="high">Vysoká</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                    Termín (volitelně)
                  </label>
                  <input
                    type="date"
                    value={formDue}
                    onChange={(e) => setFormDue(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-border)] px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                  Typ odpovědi od klienta
                </label>
                <select
                  value={formResponseMode}
                  onChange={(e) =>
                    setFormResponseMode(e.target.value as "text" | "files" | "both" | "yes_no")
                  }
                  className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-border)] px-3 text-sm"
                >
                  <option value="text">Jen text</option>
                  <option value="files">Jen soubory</option>
                  <option value="both">Text a soubory</option>
                  <option value="yes_no">Potvrzení ano/ne</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-6">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[color:var(--wp-border)] text-sm font-bold"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleCreate()}
                className="min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
              >
                {submitting ? "Odesílám…" : "Odeslat klientovi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MaterialRequestsTab({
  contactId,
  initialPayload,
}: {
  contactId: string;
  initialPayload?: MaterialRequestsTabInitialPayload;
}) {
  return (
    <Suspense
      fallback={<p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám požadavky…</p>}
    >
      <MaterialRequestsTabInner contactId={contactId} initialPayload={initialPayload} />
    </Suspense>
  );
}
