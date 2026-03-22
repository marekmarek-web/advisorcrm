"use client";

/**
 * ================================================================
 * DriveWorkspace — Standalone React modul
 * ================================================================
 * MCP napojení: Google Drive (gdrive MCP)
 *
 * Použití:
 *   import DriveWorkspace from "@/components/DriveWorkspace";
 *   <DriveWorkspace />
 *
 * Pro live data — nahraďte MOCK_FOLDERS a MOCK_FILES voláním:
 *   const files = await gdriveMcp.listFiles({ folderId: "..." });
 * ================================================================
 */

import { useState, useRef, useEffect } from "react";
import s from "./drive.module.css";

// ================================================================
// MOCK DATA — nahraďte Google Drive MCP voláním
// ================================================================
const MOCK_FOLDERS = [
  { id: "f1",  name: "ADAPTACE",             count: 3,  color: "#F59E0B" },
  { id: "f2",  name: "FINANCNI...",           count: 12, color: "#F59E0B" },
  { id: "f3",  name: "Fotky (akce, focení)",  count: 47, color: "#EC4899" },
  { id: "f4",  name: "Investice - podklady",  count: 9,  color: "#2563EB" },
  { id: "f5",  name: "Marketing a soc. sítě", count: 24, color: "#F59E0B" },
  { id: "f6",  name: "Office / Formuláře",    count: 8,  color: "#F59E0B" },
  { id: "f7",  name: "Penzijka/Důchody",      count: 6,  color: "#2563EB" },
  { id: "f8",  name: "Podnikatelé",           count: 11, color: "#F59E0B" },
  { id: "f9",  name: "Pojištění - podklady",  count: 15, color: "#2563EB" },
  { id: "f10", name: "Reality",               count: 5,  color: "#F59E0B" },
  { id: "f11", name: "REKRUTING",             count: 7,  color: "#F59E0B" },
  { id: "f12", name: "Úvěry - podklady",      count: 4,  color: "#2563EB" },
];

const MOCK_FILES = [
  { id: "fi1", name: "AMADEUS_Havlena.pdf",    type: "pdf",   date: "20. 3.", thumb: "pdf-dark" },
  { id: "fi2", name: "brezen2026.pptx",        type: "pptx",  date: "18. 3.", thumb: "pptx-slide" },
  { id: "fi3", name: "Callparty PO/ÚT",        type: "xlsx",  date: "15. 3.", thumb: "xlsx-sheet" },
  { id: "fi4", name: "EFEKTA-REIF-...",        type: "pdf",   date: "12. 3.", thumb: "pdf-doc" },
  { id: "fi5", name: "HYPO PŘEHLED",           type: "xlsx",  date: "10. 3.", thumb: "xlsx-sheet" },
  { id: "fi6", name: "Krátkodobé investice",   type: "docx",  date: "8. 3.",  thumb: "docx" },
  { id: "fi7", name: "MP - Představení.pptx",  type: "pptx",  date: "5. 3.",  thumb: "pptx-dark" },
  { id: "fi8", name: "RIZIKA - Rodina.docx",   type: "docx",  date: "4. 3.",  thumb: "docx" },
  { id: "fi9", name: "Investice_komerc...",    type: "pptx",  date: "3. 3.",  thumb: "pptx-dark2" },
  { id: "fi10",name: "Seznam KAM.xlsx",        type: "xlsx",  date: "1. 3.",  thumb: "xlsx-sheet" },
  { id: "fi11",name: "VID_20260117_001...",    type: "video", date: "17. 1.", thumb: "video" },
];

const NAV_ITEMS = [
  { label: "Osobní" },
  { label: "Můj disk" },
  { label: "Počítače" },
  { label: "Sdíleno se mnou" },
  { label: "Nedávné" },
  { label: "S hvězdičkou" },
  { label: "Spam" },
  { label: "Koš" },
];

const FILE_TYPE_COLORS = {
  pdf:   "#DC2626",
  pptx:  "#DC2626",
  xlsx:  "#059669",
  docx:  "#2563EB",
  video: "#8B5CF6",
};

// ================================================================
// THUMBNAILS — pure CSS/SVG mock previews
// ================================================================
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
    ["green","green","green","green"],
    ["","blue","","blue"],
    ["blue","","","blue"],
    ["","blue","blue",""],
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

function ThumbPptxDark({ text = "Prezentace" }) {
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
        <svg width={22} height={22} viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div className={s.thumbVideoLabel}>VIDEO · MP4</div>
    </div>
  );
}

function FileThumbnail({ thumb, type }) {
  const bgClass = {
    "pdf-dark":   s.thumbBgPdf,
    "pdf-doc":    s.thumbBgPdf,
    "pptx-slide": s.thumbBgPptx,
    "pptx-dark":  s.thumbBgDark,
    "pptx-dark2": s.thumbBgDark2,
    "xlsx-sheet": s.thumbBgXlsx,
    "docx":       s.thumbBgDocx,
    "video":      s.thumbBgVideo,
  }[thumb] || s.thumbBgPdf;

  const inner = {
    "pdf-dark":   <ThumbDocx />,
    "pdf-doc":    <ThumbDocx />,
    "pptx-slide": <ThumbPptxSlide />,
    "pptx-dark":  <ThumbPptxDark text="K. Představení" />,
    "pptx-dark2": <ThumbPptxDark text="Investujte do komerčních nemovitostí" />,
    "xlsx-sheet": <ThumbXlsxSheet />,
    "docx":       <ThumbDocx />,
    "video":      <ThumbVideo />,
  }[thumb];

  return (
    <div className={`${s.fileThumb} ${bgClass}`}>
      {inner}
    </div>
  );
}

function FileTypeIcon({ type }) {
  const color = FILE_TYPE_COLORS[type] || "#64748B";
  const icons = {
    pdf:   <path d="M20 2H8L2 8v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>,
    pptx:  <path d="M2 16.5A2.5 2.5 0 0 0 4.5 19H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4.5A2.5 2.5 0 0 0 2 6.5v10z"/>,
    xlsx:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    docx:  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    video: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>,
  };
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill={type === "video" ? "none" : color} stroke={type === "video" ? color : "none"} strokeWidth={2}>
      {icons[type]}
    </svg>
  );
}

// ================================================================
// CONTEXT MENU
// ================================================================
const CTX_ITEMS = [
  { label: "Otevřít",           danger: false },
  { label: "Sdílet",            danger: false },
  { label: "Stáhnout",          danger: false },
  { label: "Přidat s hvězdičkou", danger: false },
  { label: "Přejmenovat",       danger: false },
  { label: null }, // separator
  { label: "Vytvořit kopii",    danger: false },
  { label: "Přesunout do",      danger: false },
  { label: null }, // separator
  { label: "Přesunout do koše", danger: true },
];

function ContextMenu({ x, y, onClose }) {
  useEffect(() => {
    const handle = () => onClose();
    window.addEventListener("click", handle);
    window.addEventListener("keydown", e => { if (e.key === "Escape") onClose(); });
    return () => { window.removeEventListener("click", handle); };
  }, [onClose]);

  // Clamp to viewport
  const style = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 200),
    top:  Math.min(y, window.innerHeight - 320),
    zIndex: 200,
  };

  return (
    <div className={s.ctxMenu} style={style} onClick={e => e.stopPropagation()}>
      {CTX_ITEMS.map((item, i) =>
        item.label === null
          ? <div key={i} className={s.ctxSep} />
          : (
            <div key={i} className={`${s.ctxItem} ${item.danger ? s.ctxItemDanger : ""}`}
              onClick={onClose}>
              {item.label}
            </div>
          )
      )}
    </div>
  );
}

// ================================================================
// UPLOAD TOAST
// ================================================================
function UploadToast({ onDone }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setPct(p => {
        if (p >= 100) { clearInterval(t); setTimeout(onDone, 800); return 100; }
        return p + Math.random() * 18;
      });
    }, 180);
    return () => clearInterval(t);
  }, [onDone]);
  return (
    <div className={s.uploadToast}>
      <div className={s.toastLabel}>Nahrávám soubor...</div>
      <div className={s.toastBar}>
        <div className={s.toastBarFill} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className={s.toastSub}>{Math.min(Math.round(pct), 100)} % dokončeno</div>
    </div>
  );
}

// ================================================================
// MAIN COMPONENT
// ================================================================
export default function DriveWorkspace() {
  const [activeNav,    setActiveNav]    = useState(3); // "Sdíleno se mnou"
  const [breadcrumb,   setBreadcrumb]   = useState(["Sdíleno se mnou", "Premium Brokers"]);
  const [selected,     setSelected]     = useState(new Set());
  const [ctx,          setCtx]          = useState(null); // { x, y }
  const [viewMode,     setViewMode]     = useState("grid"); // "grid" | "list"
  const [alertVisible, setAlertVisible] = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [search,       setSearch]       = useState("");

  const visibleFolders = MOCK_FOLDERS.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );
  const visibleFiles = MOCK_FILES.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id, e) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else {
      setSelected(prev => prev.has(id) && prev.size === 1 ? new Set() : new Set([id]));
    }
  };

  const handleCtx = (e) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className={s.drive} onClick={() => setCtx(null)}>

      {/* ====== TOP BAR ====== */}
      <header className={s.topbar}>
        <div className={s.topbarBrand}>
          <div className={s.topbarLogo}>A</div>
          <span className={s.topbarBrandName}>Aidvisora</span>
          <span className={s.topbarModule}>Drive</span>
        </div>

        <div className={s.topbarSearch}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text" placeholder="Hledat na Disku..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className={s.topbarRight}>
          <button className={s.topbarIconBtn}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button className={s.topbarIconBtn}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div className={s.topbarAvatar}>MF</div>
        </div>
      </header>

      {/* ====== SIDEBAR ====== */}
      <aside className={s.sidebar}>
        <button className={s.addBtn} onClick={() => setUploading(true)}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Přidat
        </button>

        {NAV_ITEMS.map((item, i) => (
          <div key={i}
            className={`${s.navItem} ${activeNav === i ? s.navItemActive : ""}`}
            onClick={() => setActiveNav(i)}
          >
            <div className={s.navItemIcon}>
              {/* Minimal SVG icons */}
              {i === 0 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>}
              {i === 1 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}
              {i === 2 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
              {i === 3 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
              {i === 4 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              {i === 5 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
              {i === 6 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
              {i === 7 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>}
            </div>
            {item.label}
          </div>
        ))}

        <div className={s.storagBlock}>
          <div className={s.storagLabel}>
            <span>Využito 192,5 GB z 200 GB</span>
            <span className={s.storagPct}>96 %</span>
          </div>
          <div className={s.storagBar}><div className={s.storagFill} /></div>
          <button className={s.storagUpgrade}>Získat větší úložiště</button>
        </div>
      </aside>

      {/* ====== MAIN ====== */}
      <main className={s.main}>

        {/* Alert banner */}
        {alertVisible && (
          <div className={s.alertBanner}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Dochází vám úložný prostor. Nemůžete ukládat na Disk, zálohovat Fotky ani používat Gmail.</span>
            <div className={s.alertActions}>
              <a className={s.alertLink} href="#">Uvolněte si místo</a>
              <a className={s.alertLink} href="#">Koupit úložiště</a>
              <button className={s.alertClose} onClick={() => setAlertVisible(false)}>✕</button>
            </div>
          </div>
        )}

        {/* Content toolbar */}
        <div className={s.contentToolbar}>
          <div className={s.breadcrumb}>
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span className={s.breadcrumbSep}>›</span>}
                <span
                  className={`${s.breadcrumbItem} ${i === breadcrumb.length - 1 ? s.breadcrumbCurrent : ""}`}
                  onClick={() => setBreadcrumb(prev => prev.slice(0, i + 1))}
                >{crumb}</span>
              </span>
            ))}
          </div>

          <div className={s.toolbarRight}>
            {["Typ", "Lidé", "Změněno"].map(f => (
              <div key={f} className={s.filterChip}>
                {f}
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            ))}

            <div className={s.viewToggle}>
              <button
                className={`${s.viewBtn} ${viewMode === "list" ? s.viewBtnActive : ""}`}
                onClick={() => setViewMode("list")}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </button>
              <button
                className={`${s.viewBtn} ${viewMode === "grid" ? s.viewBtnActive : ""}`}
                onClick={() => setViewMode("grid")}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content scroll */}
        <div className={s.contentScroll} onContextMenu={handleCtx}>

          {/* Folders */}
          <div className={s.sectionHeader}>
            <span className={s.sectionTitle}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Složky
            </span>
            <button className={s.sortBtn}>
              Název
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            </button>
          </div>

          <div className={s.folderGrid}>
            {visibleFolders.map((folder, i) => (
              <div
                key={folder.id}
                className={`${s.folderCard} ${selected.has(folder.id) ? s.folderSelected : ""}`}
                onClick={e => toggleSelect(folder.id, e)}
                onDoubleClick={() => setBreadcrumb(prev => [...prev, folder.name])}
                onContextMenu={handleCtx}
                style={{ animationDelay: `${i * 0.02}s` }}
              >
                <div className={s.folderIcon} style={{ background: folder.color + "22" }}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill={folder.color}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div>
                  <div className={s.folderLabel}>{folder.name}</div>
                  <div className={s.folderCount}>{folder.count} položek</div>
                </div>
                <button className={s.folderMenuBtn} onClick={e => { e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY }); }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </button>
              </div>
            ))}
          </div>

          {/* Files */}
          <div className={s.sectionHeader} style={{ marginTop: 28 }}>
            <span className={s.sectionTitle}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Soubory
            </span>
          </div>

          <div className={viewMode === "grid" ? s.fileGrid : s.fileList}>
            {visibleFiles.map((file, i) => (
              <div
                key={file.id}
                className={`${viewMode === "grid" ? s.fileCard : s.fileRow} ${selected.has(file.id) ? s.fileSelected : ""}`}
                onClick={e => toggleSelect(file.id, e)}
                onDoubleClick={() => console.log("open", file.name)}
                onContextMenu={handleCtx}
                style={{ animationDelay: `${(i + visibleFolders.length) * 0.02 + 0.1}s` }}
              >
                {viewMode === "grid" ? (
                  <>
                    <div className={s.fileThumbWrap}>
                      <FileThumbnail thumb={file.thumb} type={file.type} />
                      <div className={`${s.fileSelectCheck} ${selected.has(file.id) ? s.fileSelectCheckOn : ""}`}>
                        {selected.has(file.id) && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <button className={s.fileMenuBtn} onClick={e => { e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY }); }}>
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                      </button>
                    </div>
                    <div className={s.fileInfo}>
                      <div className={s.fileTypeIcon}><FileTypeIcon type={file.type} /></div>
                      <span className={s.fileName}>{file.name}</span>
                      <span className={s.fileDate}>{file.date}</span>
                    </div>
                  </>
                ) : (
                  <div className={s.fileRowInner}>
                    <div className={s.fileTypeIcon}><FileTypeIcon type={file.type} /></div>
                    <span className={s.fileRowName}>{file.name}</span>
                    <span className={s.fileRowType}>{file.type.toUpperCase()}</span>
                    <span className={s.fileRowDate}>{file.date}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </main>

      {/* Context menu */}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />}

      {/* Upload toast */}
      {uploading && <UploadToast onDone={() => setUploading(false)} />}

    </div>
  );
}
