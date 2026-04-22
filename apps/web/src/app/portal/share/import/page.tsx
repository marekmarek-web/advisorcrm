"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ContactPicker, type ContactPickerValue } from "@/app/components/upload/ContactPicker";
import { useShareIntent } from "@/lib/share/useShareIntent";
import { useFileUpload } from "@/lib/upload/useFileUpload";

type FileStatus = "pending" | "uploading" | "done" | "error";

type UploadRow = {
  key: string;
  file: File;
  status: FileStatus;
  progress: number;
  error: string | null;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isImage(file: File) {
  return file.type.startsWith("image/");
}

export default function ShareImportPage() {
  const router = useRouter();
  const { sharedFiles, hasSharedFiles, clearSharedFiles, error: shareError } = useShareIntent();
  const { uploadFile, progress } = useFileUpload();

  const [selectedContact, setSelectedContact] = useState<ContactPickerValue | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [note, setNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  /**
   * Bez okamžitého `router.replace("/portal/today")`.
   * Dřívější verze způsobovala „kliknu v nativním share a Aidvisora mě rovnou
   * hodí na dashboard“ — když share intent plugin krátce oznámil prázdný stav
   * dřív, než doručil soubory. Nyní jen naplníme řádky když jsou soubory;
   * prázdný stav render komponenta níže dá uživateli explicitní tlačítko.
   */
  useEffect(() => {
    if (!hasSharedFiles) return;
    setUploadRows(
      sharedFiles.map((file) => ({
        key: fileKey(file),
        file,
        status: "pending",
        progress: 0,
        error: null,
      })),
    );
  }, [hasSharedFiles, sharedFiles]);

  useEffect(() => {
    if (!activeKey) return;
    setUploadRows((rows) =>
      rows.map((row) => (row.key === activeKey ? { ...row, progress, status: "uploading", error: null } : row)),
    );
  }, [activeKey, progress]);

  const hasErrors = useMemo(() => uploadRows.some((row) => row.status === "error"), [uploadRows]);
  const hasDone = useMemo(() => uploadRows.some((row) => row.status === "done"), [uploadRows]);

  const tags = useMemo(() => {
    const nextTags = [];
    if (documentType.trim()) nextTags.push(documentType.trim());
    // NOTE: documents table currently does not have a dedicated note column.
    if (note.trim()) nextTags.push(`poznamka:${note.trim()}`);
    return nextTags;
  }, [documentType, note]);

  const startUpload = async (onlyFailed = false) => {
    if (!selectedContact) {
      setGlobalError("Vyberte klienta.");
      return;
    }

    setGlobalError(null);
    setIsUploading(true);
    try {
      for (const row of uploadRows) {
        if (onlyFailed && row.status !== "error") continue;
        if (!onlyFailed && row.status === "done") continue;

        setActiveKey(row.key);
        setUploadRows((current) =>
          current.map((candidate) =>
            candidate.key === row.key ? { ...candidate, status: "uploading", progress: 0, error: null } : candidate,
          ),
        );

        try {
          await uploadFile(row.file, {
            contactId: selectedContact.id,
            name: row.file.name,
            tags,
            uploadSource: "mobile_share",
          });

          setUploadRows((current) =>
            current.map((candidate) =>
              candidate.key === row.key ? { ...candidate, status: "done", progress: 100, error: null } : candidate,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Nahrání dokumentu selhalo.";
          setUploadRows((current) =>
            current.map((candidate) =>
              candidate.key === row.key ? { ...candidate, status: "error", error: message } : candidate,
            ),
          );
        }
      }
    } finally {
      setActiveKey(null);
      setIsUploading(false);
    }
  };

  if (!hasSharedFiles) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 text-center">
          <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Žádné sdílené dokumenty</h1>
          <p className="mt-2 text-sm text-[color:var(--wp-text-secondary)]">
            Nenašli jsme žádné soubory ze share intentu. Otevřete dokument v jiné
            aplikaci a zvolte „Sdílet → Aidvisora“, nebo se vraťte zpět.
          </p>
          {shareError ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-700">
              {shareError}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              router.push("/portal/today");
            }}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-lg border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] px-5 text-sm font-semibold text-[color:var(--wp-text)]"
          >
            Zpět na Dnešek
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
      <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
        <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Import sdílených dokumentů</h1>
        <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
          Vyberte klienta a potvrďte nahrání dokumentů sdílených z jiné aplikace.
        </p>
      </div>

      {shareError ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{shareError}</div> : null}
      {globalError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{globalError}</div> : null}

      <ContactPicker value={selectedContact} onChange={setSelectedContact} />

      <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
        <label className="mb-2 block text-sm font-medium text-[color:var(--wp-text-secondary)]" htmlFor="share-doc-type">
          Typ dokumentu
        </label>
        <input
          id="share-doc-type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          placeholder="Např. smlouva, pojistka, faktura"
          className="h-11 w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />

        <label className="mb-2 mt-3 block text-sm font-medium text-[color:var(--wp-text-secondary)]" htmlFor="share-note">
          Poznámka
        </label>
        <textarea
          id="share-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Krátká poznámka k importu (volitelné)"
          className="min-h-24 w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
        <h2 className="mb-2 text-sm font-medium text-[color:var(--wp-text-secondary)]">Sdílené soubory</h2>
        <div className="space-y-2">
          {uploadRows.map((row) => (
            <div key={row.key} className="rounded-xl border border-[color:var(--wp-surface-card-border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[color:var(--wp-text)]">{row.file.name}</div>
                  <div className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                    {isImage(row.file) ? "Obrázek" : "PDF"} · {formatSize(row.file.size)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                    row.status === "done"
                      ? "bg-emerald-100 text-emerald-700"
                      : row.status === "error"
                        ? "bg-red-100 text-red-700"
                        : row.status === "uploading"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                  }`}
                >
                  {row.status === "done"
                    ? "Hotovo"
                    : row.status === "error"
                      ? "Chyba"
                      : row.status === "uploading"
                        ? "Nahrávám"
                        : "Čeká"}
                </span>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-[color:var(--wp-surface-muted)]">
                <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${row.progress}%` }} />
              </div>

              {row.error ? <div className="mt-2 text-xs text-red-600">{row.error}</div> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isUploading || !uploadRows.length}
            onClick={() => {
              void startUpload(false);
            }}
            className="h-11 flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[color:var(--wp-surface-card-border)]"
          >
            {isUploading ? "Nahrávám..." : "Nahrát dokumenty"}
          </button>

          <button
            type="button"
            disabled={isUploading || !hasErrors}
            onClick={() => {
              void startUpload(true);
            }}
            className="h-11 flex-1 rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Zkusit znovu chybné
          </button>
        </div>

        {hasDone && !isUploading ? (
          <button
            type="button"
            onClick={() => {
              clearSharedFiles();
              router.push(selectedContact ? `/portal/contacts/${selectedContact.id}` : "/portal/today");
            }}
            className="mt-2 h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700"
          >
            Otevřít klienta
          </button>
        ) : null}
      </div>
    </div>
  );
}
