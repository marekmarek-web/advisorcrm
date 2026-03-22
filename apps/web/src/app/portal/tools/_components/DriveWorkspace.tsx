"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { DriveUploadDialog } from "./DriveUploadDialog";
import { IntegrationConnectionGate } from "./IntegrationConnectionGate";
import s from "./DriveWorkspace.module.css";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
};

type CtxState = { x: number; y: number; target?: DriveFile } | null;

type NavItem = {
  label: string;
  icon: string;
  query?: string;
  folderId?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Můj disk", icon: "folder" },
  { label: "Sdíleno se mnou", icon: "users", query: "sharedWithMe=true" },
  { label: "Nedávné", icon: "clock", query: "modifiedTime > '{{recent}}'" },
  { label: "S hvězdičkou", icon: "star", query: "starred=true" },
  { label: "Koš", icon: "trash", query: "trashed=true" },
];

function getFileCategory(mime: string): "folder" | "pdf" | "pptx" | "xlsx" | "docx" | "video" | "image" | "generic" {
  if (mime === "application/vnd.google-apps.folder") return "folder";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("presentation") || mime.includes("pptx") || mime === "application/vnd.google-apps.presentation") return "pptx";
  if (mime.includes("spreadsheet") || mime.includes("xlsx") || mime === "application/vnd.google-apps.spreadsheet") return "xlsx";
  if (mime.includes("document") || mime.includes("docx") || mime.includes("word") || mime === "application/vnd.google-apps.document") return "docx";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "generic";
}

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: "#DC2626", pptx: "#DC2626", xlsx: "#059669", docx: "#2563EB",
  video: "#8B5CF6", image: "#EC4899", folder: "#F59E0B", generic: "#64748B",
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `${d.getDate()}. ${d.getMonth() + 1}.`;
  } catch { return ""; }
}

/* ================================================================
   THUMBNAIL COMPONENTS
   ================================================================ */
function ThumbPptxSlide() {
  return (
    <div className={s.thumbSlide}>
      <div className={s.thumbSlideHeader} />
      <div className={s.thumbSlideBody}>
        <div className={s.thumbLine} style={{ width: "80%" }} />
        <div className={s.thumbLine} style={{ width: "60%" }} />
        <div className={s.thumbLine} style={{ width: "70%" }} />
      </div>
    </div>
  );
}

function ThumbXlsxSheet() {
  const rows = [
    ["green", "green", "green", "green"],
    ["", "blue", "", "blue"],
    ["blue", "", "", "blue"],
    ["", "blue", "blue", ""],
  ];
  return (
    <div className={s.thumbSheet}>
      {rows.map((row, ri) => (
        <div key={ri} className={`${s.thumbSheetRow} ${ri === 0 ? s.thumbSheetHeader : ""}`}>
          {row.map((c, ci) => (
            <div key={ci} className={s.thumbSheetCell}>
              <div className={`${s.thumbCellDot} ${c ? s[`dot_${c}`] : ""}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ThumbDocx() {
  return (
    <div className={s.thumbDoc}>
      <div className={s.thumbDocHeading} />
      <div style={{ height: 6 }} />
      {[80, 70, 85, 50, 70, 85].map((w, i) => (
        <div key={i} className={s.thumbDocLine} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function ThumbDarkOverlay({ text }: { text: string }) {
  return (
    <div className={s.thumbDarkOverlay}>
      <div className={s.thumbOverlayLabel}>Prezentace</div>
      <div className={s.thumbOverlayTitle}>{text}</div>
    </div>
  );
}

function ThumbVideo() {
  return (
    <div className={s.thumbVideoOverlay}>
      <div className={s.thumbVideoPlay}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><polygon points="5 3 19 12 5 21 5 3" /></svg>
      </div>
      <div className={s.thumbVideoLabel}>VIDEO</div>
    </div>
  );
}

function ThumbGeneric({ ext }: { ext: string }) {
  return (
    <div className={s.thumbGenericCenter}>
      <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={1.5}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div className={s.thumbGenericLabel}>{ext}</div>
    </div>
  );
}

function FileThumbnail({ file }: { file: DriveFile }) {
  const cat = getFileCategory(file.mimeType);
  const bgClass: Record<string, string> = {
    pdf: s.thumbBgPdf, pptx: s.thumbBgPptx, xlsx: s.thumbBgXlsx,
    docx: s.thumbBgDocx, video: s.thumbBgVideo, image: s.thumbBgImg,
    generic: s.thumbBgGeneric,
  };

  const inner: Record<string, React.ReactNode> = {
    pdf: <ThumbDocx />,
    pptx: file.name.toLowerCase().includes("představ") || file.name.toLowerCase().includes("invest")
      ? <ThumbDarkOverlay text={file.name.slice(0, 30)} /> : <ThumbPptxSlide />,
    xlsx: <ThumbXlsxSheet />,
    docx: <ThumbDocx />,
    video: <ThumbVideo />,
    image: <ThumbGeneric ext="IMG" />,
    generic: <ThumbGeneric ext={file.name.split(".").pop()?.toUpperCase() || "FILE"} />,
  };

  const thumbBg = cat === "pptx" && (file.name.toLowerCase().includes("představ") || file.name.toLowerCase().includes("invest"))
    ? s.thumbBgDark : (bgClass[cat] || s.thumbBgGeneric);

  return (
    <div className={`${s.fileThumb} ${thumbBg}`}>
      {inner[cat]}
    </div>
  );
}

function FileTypeIcon({ type }: { type: string }) {
  const color = FILE_TYPE_COLORS[type] || "#64748B";
  const icons: Record<string, React.ReactNode> = {
    pdf: <path d="M20 2H8L2 8v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />,
    pptx: <path d="M2 16.5A2.5 2.5 0 0 0 4.5 19H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4.5A2.5 2.5 0 0 0 2 6.5v10z" />,
    xlsx: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    docx: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    video: <><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></>,
    folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  };
  const isStroke = type === "video";
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill={isStroke ? "none" : color} stroke={isStroke ? color : "none"} strokeWidth={2}>
      {icons[type] || icons.docx}
    </svg>
  );
}

/* Nav icon helper — matches NAV_ITEMS order */
function NavIcon({ idx }: { idx: number }) {
  const props = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  switch (idx) {
    case 0: return <svg {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
    case 1: return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 2: return <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 3: return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
    case 4: return <svg {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
    default: return null;
  }
}

/* ================================================================
   CONTEXT MENU
   ================================================================ */
function ContextMenu({ x, y, file, onClose, onAction }: {
  x: number; y: number; file?: DriveFile; onClose: () => void;
  onAction: (action: string) => void;
}) {
  useEffect(() => {
    const handle = () => onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("click", handle);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("click", handle); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 210),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - 340),
    zIndex: 200,
  };

  const items = [
    { label: "Otevřít", action: "open" },
    { label: "Sdílet", action: "share" },
    { label: "Stáhnout", action: "download" },
    { label: "Přidat s hvězdičkou", action: "star" },
    { label: "Přejmenovat", action: "rename" },
    null,
    { label: "Vytvořit kopii", action: "copy" },
    { label: "Přesunout do", action: "move" },
    null,
    { label: "Přesunout do koše", action: "delete", danger: true },
  ];

  return (
    <div className={s.ctxMenu} style={style} onClick={e => e.stopPropagation()}>
      {items.map((item, i) =>
        item === null
          ? <div key={i} className={s.ctxSep} />
          : (
            <div key={i}
              className={`${s.ctxItem} ${item.danger ? s.ctxItemDanger : ""}`}
              onClick={() => { onAction(item.action); onClose(); }}
            >
              {item.label}
            </div>
          )
      )}
    </div>
  );
}

/* ================================================================
   RENAME DIALOG
   ================================================================ */
function RenameDialog({ name, onClose, onSave }: {
  name: string; onClose: () => void; onSave: (n: string) => void;
}) {
  const [val, setVal] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className={s.dialogOverlay} onClick={onClose}>
      <div className={s.dialog} onClick={e => e.stopPropagation()}>
        <div className={s.dialogTitle}>Přejmenovat</div>
        <input ref={ref} className={s.dialogInput} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onSave(val); if (e.key === "Escape") onClose(); }} />
        <div className={s.dialogActions}>
          <button className={s.dialogBtnCancel} onClick={onClose}>Zrušit</button>
          <button className={s.dialogBtnPrimary} disabled={!val.trim()} onClick={() => onSave(val)}>Uložit</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SHARE DIALOG
   ================================================================ */
function ShareDialog({ fileName, onClose, onShare }: {
  fileName: string; onClose: () => void; onShare: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className={s.dialogOverlay} onClick={onClose}>
      <div className={s.dialog} onClick={e => e.stopPropagation()}>
        <div className={s.dialogTitle}>Sdílet — {fileName}</div>
        <input ref={ref} className={s.dialogInput} value={email} onChange={e => setEmail(e.target.value)}
          placeholder="klient@firma.cz"
          onKeyDown={e => { if (e.key === "Enter") onShare(email); if (e.key === "Escape") onClose(); }} />
        <div className={s.dialogActions}>
          <button className={s.dialogBtnCancel} onClick={onClose}>Zrušit</button>
          <button className={s.dialogBtnPrimary} disabled={!email.trim()} onClick={() => onShare(email)}>Sdílet jako čtenář</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export function DriveWorkspace() {
  const [q, setQ] = useState("");
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeNav, setActiveNav] = useState(0);
  const [navQuery, setNavQuery] = useState<string | undefined>(undefined);
  const [alertVisible, setAlertVisible] = useState(true);
  const [ctx, setCtx] = useState<CtxState>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [folderStack, setFolderStack] = useState<{ id?: string; name: string }[]>([{ name: "Můj disk" }]);

  const loadFiles = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (folderId) params.set("folderId", folderId);
      if (navQuery) params.set("extraQuery", navQuery);
      const res = await fetch(`/api/drive/files?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as { files?: DriveFile[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Načtení souborů selhalo.");
        return;
      }
      setFiles(data.files ?? []);
    } catch {
      setError("Načtení souborů selhalo.");
    } finally {
      setLoading(false);
    }
  }, [folderId, q, navQuery]);

  useEffect(() => { loadFiles().catch(() => undefined); }, [loadFiles]);

  const folders = useMemo(() => files.filter(f => f.mimeType === "application/vnd.google-apps.folder"), [files]);
  const regularFiles = useMemo(() => files.filter(f => f.mimeType !== "application/vnd.google-apps.folder"), [files]);

  const openFolder = (folder: DriveFile) => {
    setFolderStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    setFolderId(folder.id);
    setSelected(new Set());
    setSelectedFile(null);
  };

  const navigateBreadcrumb = (idx: number) => {
    const newStack = folderStack.slice(0, idx + 1);
    setFolderStack(newStack);
    setFolderId(newStack[newStack.length - 1]?.id);
    setSelected(new Set());
    setSelectedFile(null);
  };

  const toggleSelect = (file: DriveFile, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        next.has(file.id) ? next.delete(file.id) : next.add(file.id);
        return next;
      });
    } else {
      setSelected(prev => prev.has(file.id) && prev.size === 1 ? new Set() : new Set([file.id]));
    }
    setSelectedFile(file);
  };

  const handleCtx = (e: React.MouseEvent, file?: DriveFile) => {
    e.preventDefault();
    e.stopPropagation();
    if (file) setSelectedFile(file);
    setCtx({ x: e.clientX, y: e.clientY, target: file });
  };

  async function onDelete(fileId: string) {
    const res = await fetch(`/api/drive/files/${fileId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setError(data.error ?? "Mazání selhalo."); return; }
    setSelected(new Set());
    setSelectedFile(null);
    await loadFiles();
  }

  async function onRename(newName: string) {
    if (!selectedFile || !newName.trim()) return;
    const res = await fetch(`/api/drive/files/${selectedFile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setError(data.error ?? "Přejmenování selhalo."); return; }
    setRenameOpen(false);
    await loadFiles();
  }

  async function onShare(email: string) {
    if (!selectedFile || !email.trim()) return;
    const res = await fetch(`/api/drive/files/${selectedFile.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", role: "reader", emailAddress: email.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setError(data.error ?? "Sdílení selhalo."); return; }
    setShareOpen(false);
  }

  function handleCtxAction(action: string) {
    const file = ctx?.target || selectedFile;
    if (!file) return;
    setSelectedFile(file);

    switch (action) {
      case "open":
        if (file.mimeType === "application/vnd.google-apps.folder") openFolder(file);
        else if (file.webViewLink) window.open(file.webViewLink, "_blank");
        break;
      case "download":
        window.open(`/api/drive/files/${file.id}/download`, "_blank");
        break;
      case "rename":
        setRenameOpen(true);
        break;
      case "share":
        setShareOpen(true);
        break;
      case "delete":
        onDelete(file.id);
        break;
    }
  }

  const handleNavClick = (idx: number) => {
    setActiveNav(idx);
    const item = NAV_ITEMS[idx];
    setFolderId(item?.folderId);
    setSelected(new Set());
    setSelectedFile(null);

    if (item?.query) {
      const resolved = item.query.replace(
        "{{recent}}",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      );
      setNavQuery(resolved);
      setFolderStack([{ name: item.label }]);
    } else {
      setNavQuery(undefined);
      setFolderStack([{ name: "Můj disk" }]);
    }
  };

  return (
    <IntegrationConnectionGate provider="drive">
      <div className={s.drive} onClick={() => setCtx(null)}>

        {/* ====== TOP BAR ====== */}
        <header className={s.topbar}>
          <div className={s.topbarBrand}>
            <div className={s.topbarLogo}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className={s.topbarBrandName}>Drive</span>
          </div>

          <div className={s.topbarSearch}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="Hledat na Disku..."
              value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") loadFiles(); }} />
          </div>

          <div className={s.topbarRight}>
            <button className={s.topbarIconBtn} title="Obnovit" onClick={() => loadFiles()}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            </button>
          </div>
        </header>

        {/* ====== SIDEBAR ====== */}
        <aside className={s.sidebar}>
          <button className={s.addBtn} onClick={() => setUploadOpen(true)}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Přidat
          </button>

          {NAV_ITEMS.map((item, i) => (
            <div key={i}
              className={`${s.navItem} ${activeNav === i ? s.navItemActive : ""}`}
              onClick={() => handleNavClick(i)}
            >
              <div className={s.navItemIcon}><NavIcon idx={i} /></div>
              {item.label}
            </div>
          ))}

          <div className={s.storagBlock}>
            <div className={s.storagLabel}>
              <span>Úložiště Google Disku</span>
            </div>
            <div className={s.storagBar}><div className={s.storagFill} /></div>
            <button className={s.storagUpgrade}>Získat větší úložiště</button>
          </div>
        </aside>

        {/* ====== MAIN ====== */}
        <main className={s.main}>
          {alertVisible && (
            <div className={s.alertBanner}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <span>Google Drive je připojený a funkční.</span>
              <div className={s.alertActions}>
                <button className={s.alertClose} onClick={() => setAlertVisible(false)}>✕</button>
              </div>
            </div>
          )}

          <div className={s.contentToolbar}>
            <div className={s.breadcrumb}>
              {folderStack.map((crumb, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <span className={s.breadcrumbSep}>›</span>}
                  <button
                    className={`${s.breadcrumbItem} ${i === folderStack.length - 1 ? s.breadcrumbCurrent : ""}`}
                    onClick={() => navigateBreadcrumb(i)}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <div className={s.toolbarRight}>
              {["Typ", "Lidé", "Změněno"].map(f => (
                <div key={f} className={s.filterChip}>
                  {f}
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              ))}

              <div className={s.viewToggle}>
                <button className={`${s.viewBtn} ${view === "list" ? s.viewBtnActive : ""}`} onClick={() => setView("list")} title="Seznam">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                </button>
                <button className={`${s.viewBtn} ${view === "grid" ? s.viewBtnActive : ""}`} onClick={() => setView("grid")} title="Mřížka">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                </button>
              </div>
            </div>
          </div>

          {error && <div className={s.errorBanner}>{error}</div>}

          <div className={s.contentScroll} onContextMenu={e => handleCtx(e)}>
            {loading && !files.length ? (
              <div className={s.loadingOverlay}>
                <div className={s.spinner} />
                <span style={{ fontSize: "0.82rem" }}>Načítám soubory…</span>
              </div>
            ) : (
              <>
                {folders.length > 0 && (
                  <>
                    <div className={s.sectionHeader}>
                      <span className={s.sectionTitle}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                        Složky
                      </span>
                      <button className={s.sortBtn}>
                        Název
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
                      </button>
                    </div>

                    <div className={s.folderGrid}>
                      {folders.map((folder, i) => (
                        <div key={folder.id}
                          className={`${s.folderCard} ${selected.has(folder.id) ? s.folderSelected : ""}`}
                          onClick={e => toggleSelect(folder, e)}
                          onDoubleClick={() => openFolder(folder)}
                          onContextMenu={e => handleCtx(e, folder)}
                          style={{ animationDelay: `${i * 0.02}s` }}
                        >
                          <div className={s.folderIcon} style={{ background: "#F59E0B22" }}>
                            <svg width={18} height={18} viewBox="0 0 24 24" fill="#F59E0B">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          </div>
                          <div>
                            <div className={s.folderLabel}>{folder.name}</div>
                            <div className={s.folderCount}>Složka</div>
                          </div>
                          <button className={s.folderMenuBtn} onClick={e => handleCtx(e, folder)}>
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {regularFiles.length > 0 && (
                  <>
                    <div className={s.sectionHeader} style={{ marginTop: folders.length > 0 ? 28 : 0 }}>
                      <span className={s.sectionTitle}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        Soubory
                      </span>
                    </div>

                    <div className={view === "grid" ? s.fileGrid : s.fileList}>
                      {regularFiles.map((file, i) => {
                        const cat = getFileCategory(file.mimeType);
                        return (
                          <div key={file.id}
                            className={`${view === "grid" ? s.fileCard : s.fileRow} ${selected.has(file.id) ? s.fileSelected : ""}`}
                            onClick={e => toggleSelect(file, e)}
                            onDoubleClick={() => file.webViewLink && window.open(file.webViewLink, "_blank")}
                            onContextMenu={e => handleCtx(e, file)}
                            style={{ animationDelay: `${(i + folders.length) * 0.02 + 0.1}s` }}
                          >
                            {view === "grid" ? (
                              <>
                                <div className={s.fileThumbWrap}>
                                  <FileThumbnail file={file} />
                                  <div className={`${s.fileSelectCheck} ${selected.has(file.id) ? s.fileSelectCheckOn : ""}`}>
                                    {selected.has(file.id) && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>}
                                  </div>
                                  <button className={s.fileMenuBtn} onClick={e => handleCtx(e, file)}>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                                  </button>
                                </div>
                                <div className={s.fileInfo}>
                                  <div className={s.fileTypeIcon}><FileTypeIcon type={cat} /></div>
                                  <span className={s.fileName}>{file.name}</span>
                                  <span className={s.fileDate}>{formatDate(file.modifiedTime)}</span>
                                </div>
                              </>
                            ) : (
                              <div className={s.fileRowInner}>
                                <div className={s.fileTypeIcon}><FileTypeIcon type={cat} /></div>
                                <span className={s.fileRowName}>{file.name}</span>
                                <span className={s.fileRowType}>{cat.toUpperCase()}</span>
                                <span className={s.fileRowDate}>{formatDate(file.modifiedTime)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {!files.length && !loading && (
                  <div className={s.emptyState}>
                    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth={1.5}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <div className={s.emptyTitle}>Složka je prázdná</div>
                    <div className={s.emptySub}>Nahrajte soubor nebo vytvořte složku kliknutím na &quot;Přidat&quot;</div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {ctx && <ContextMenu x={ctx.x} y={ctx.y} file={ctx.target} onClose={() => setCtx(null)} onAction={handleCtxAction} />}
        {renameOpen && selectedFile && <RenameDialog name={selectedFile.name} onClose={() => setRenameOpen(false)} onSave={onRename} />}
        {shareOpen && selectedFile && <ShareDialog fileName={selectedFile.name} onClose={() => setShareOpen(false)} onShare={onShare} />}
      </div>

      <DriveUploadDialog open={uploadOpen} folderId={folderId} onClose={() => setUploadOpen(false)} onUploaded={() => loadFiles()} />
    </IntegrationConnectionGate>
  );
}
