"use client";

/**
 * ================================================================
 * GmailWorkspace — Standalone React modul
 * ================================================================
 * MCP napojení: Google Gmail (https://gmail.mcp.claude.com/mcp)
 *
 * Použití:
 *   import GmailWorkspace from "@/components/GmailWorkspace";
 *   <GmailWorkspace />
 *
 * Pro live data — nahraďte MOCK_EMAILS voláním Gmail MCP:
 *   const msgs = await gmailMcp.listMessages({ maxResults: 50 });
 * ================================================================
 */

import { useState, useRef, useEffect } from "react";
import s from "./gmail.module.css";

// ================================================================
// MOCK DATA — nahraďte Gmail MCP voláním
// ================================================================
const MOCK_EMAILS = [
  {
    id: 1,
    sender: "Allegro",
    senderEmail: "info@notifikace.allegro.cz",
    to: "mfragtv@gmail.com",
    subject: "250 Kč na jeden klik. Berete?",
    preview: "Udělejte si radost za zlomek ceny.",
    date: "21. 3.",
    fullDate: "21. 3. 2026, 9:14",
    unread: true,
    tag: { label: "Promo", type: "promo" },
    initials: "AL",
    avatarColor: "linear-gradient(135deg,#FF6B00,#FF8C40)",
    body: `
      <div style="display:inline-block;background:linear-gradient(135deg,#FF6B00,#FF8C40);padding:4px 14px;border-radius:6px;margin-bottom:16px;">
        <span style="font-family:var(--font-display);font-size:1.1rem;font-weight:800;color:#fff;">allegro</span>
      </div>
      <p style="font-family:var(--font-display);font-size:1rem;font-weight:700;color:var(--navy);margin-bottom:6px;">Milý zákazníku,</p>
      <p style="margin-bottom:16px;">sezóna úlovků vrcholí. Vyberte si ten svůj!</p>
      <p style="margin-bottom:8px;">👉 Získejte svůj dárek! Klikněte na „Získat kupón".</p>
      <p style="margin-bottom:20px;">👉 Pro bezproblémové přiřazení kupónu si, prosím, vypněte blokování reklam.</p>
      <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:var(--r-xl);overflow:hidden;margin:20px 0;">
        <div style="display:grid;grid-template-columns:1fr 2fr;">
          <div style="background:var(--navy);padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;">
            <span style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.45);">Váš kupón</span>
            <span style="font-family:var(--font-display);font-size:0.9rem;font-weight:700;color:#fff;">Sleva</span>
            <span style="font-size:0.62rem;color:rgba(255,255,255,0.35);">platný do 22. 3. 2026</span>
          </div>
          <div style="padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
            <div style="font-family:var(--font-display);font-size:2rem;font-weight:800;color:var(--navy);">250 Kč</div>
            <button style="width:100%;padding:9px;border-radius:var(--r-md);background:#FF6B00;border:none;cursor:pointer;font-family:var(--font-display);font-size:0.8rem;font-weight:700;color:#fff;text-transform:uppercase;">ZÍSKAT KUPÓN</button>
          </div>
        </div>
      </div>
      <p style="font-family:var(--font-display);font-size:0.9rem;font-weight:700;color:var(--navy);margin:20px 0 14px;">Jak využít kupón?</p>
      <ol style="padding-left:0;display:flex;flex-direction:column;gap:12px;list-style:none;">
        <li style="display:flex;gap:12px;"><span style="width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:0.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</span><span style="font-size:0.8rem;color:var(--text-2);line-height:1.6;padding-top:2px;">Klikněte na tlačítko „Získat kupón", abyste aktivovali svůj kupón v hodnotě 250 Kč.</span></li>
        <li style="display:flex;gap:12px;"><span style="width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:0.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</span><span style="font-size:0.8rem;color:var(--text-2);line-height:1.6;padding-top:2px;">Otevřete aplikaci Allegro a přidejte vybrané produkty do košíku.</span></li>
        <li style="display:flex;gap:12px;"><span style="width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:0.72rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</span><span style="font-size:0.8rem;color:var(--text-2);line-height:1.6;padding-top:2px;">Kupón je platný do 22. 3. 2026. Kupón nelze využít pro platbu na dobírku.</span></li>
      </ol>
    `,
  },
  {
    id: 2,
    sender: "Vercel",
    senderEmail: "notifications@vercel.com",
    to: "mfragtv@gmail.com",
    subject: "Failed production deployment on team 'marekmarek-web's project'",
    preview: "Hi marekmarek-web, There was an error deploying advisorcrm-web to the...",
    date: "20. 3.",
    fullDate: "20. 3. 2026, 14:23",
    unread: true,
    tag: { label: "Alert", type: "alert" },
    initials: "V",
    avatarColor: "linear-gradient(135deg,#000,#333)",
    body: `
      <p style="margin-bottom:12px;">Hi <strong>marekmarek-web</strong>,</p>
      <p style="margin-bottom:16px;">There was an error deploying <strong>advisorcrm-web</strong> to the production environment on marekmarek-web's projects.</p>
      <div style="background:var(--red-light);border:1.5px solid rgba(220,38,38,0.2);border-radius:var(--r-lg);padding:14px 16px;margin-bottom:16px;">
        <p style="font-size:0.82rem;font-weight:700;color:var(--red);margin-bottom:6px;">Chyba deploymentu</p>
        <code style="font-size:0.75rem;color:#991B1B;background:rgba(220,38,38,0.08);padding:2px 6px;border-radius:4px;">Build failed: Module not found 'advisorcrm-web/components'</code>
      </div>
      <p style="margin-bottom:8px;">You can also <a href="#" style="color:var(--accent);text-decoration:none;font-weight:500;">view latest deployments</a> for branch.</p>
    `,
  },
  {
    id: 3,
    sender: "Calendly",
    senderEmail: "team@send.calendly.com",
    to: "mfragtv@gmail.com",
    subject: "Which plan is right for you?",
    preview: "Explore our most popular plans",
    date: "20. 3.",
    fullDate: "20. 3. 2026, 11:05",
    unread: false,
    tag: { label: "Promo", type: "promo" },
    initials: "CA",
    avatarColor: "linear-gradient(135deg,#0068FF,#0057D9)",
    body: `
      <p style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;color:var(--navy);margin-bottom:14px;">Explore our most popular plans</p>
      <p style="margin-bottom:16px;">Hi, we noticed you've been using the free plan. Here's a quick comparison to help you decide.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div style="border:1.5px solid var(--border);border-radius:var(--r-lg);padding:14px;">
          <div style="font-weight:700;color:var(--navy);margin-bottom:4px;">Standard</div>
          <div style="font-size:0.72rem;color:var(--text-3);">$12 / měs.</div>
        </div>
        <div style="border:2px solid var(--accent);border-radius:var(--r-lg);padding:14px;background:var(--accent-light);">
          <div style="font-weight:700;color:var(--accent);margin-bottom:4px;">Teams ⭐</div>
          <div style="font-size:0.72rem;color:var(--text-3);">$20 / měs.</div>
        </div>
      </div>
    `,
  },
  {
    id: 4,
    sender: "GitHub",
    senderEmail: "noreply@github.com",
    to: "mfragtv@gmail.com",
    subject: "Vercel is requesting updated permissions",
    preview: "Updated Permissions Request — The GitHub App Vercel is requesting additional access...",
    date: "20. 3.",
    fullDate: "20. 3. 2026, 10:01",
    unread: true,
    tag: { label: "Dev", type: "client" },
    initials: "G",
    avatarColor: "linear-gradient(135deg,#1A1A1A,#333)",
    body: `<p style="margin-bottom:12px;">The GitHub App <strong>Vercel</strong> is requesting additional access to your account. Review and approve the request in your GitHub settings.</p>`,
  },
  {
    id: 5,
    sender: "Supabase",
    senderEmail: "security@supabase.com",
    to: "mfragtv@gmail.com",
    subject: "Security vulnerabilities detected in your Supabase projects",
    preview: "Security issues require your attention — please review immediately.",
    date: "18. 3.",
    fullDate: "18. 3. 2026, 8:45",
    unread: true,
    tag: { label: "Urgentní", type: "alert" },
    initials: "SB",
    avatarColor: "linear-gradient(135deg,#3ECF8E,#20B070)",
    body: `<p style="margin-bottom:12px;">Security vulnerabilities detected in your Supabase projects. Please review and update immediately.</p>`,
  },
  {
    id: 6,
    sender: "Reclaim",
    senderEmail: "weekly@reclaim.ai",
    to: "mfragtv@gmail.com",
    subject: "Weekly Report: bre 14–20",
    preview: "2026 Time Blocking Guide: 7 tips to master focus…",
    date: "20. 3.",
    fullDate: "20. 3. 2026, 7:00",
    unread: false,
    tag: null,
    initials: "RC",
    avatarColor: "linear-gradient(135deg,#FF6750,#E53935)",
    body: `<p style="margin-bottom:12px;"><strong>2026 Time Blocking Guide</strong>: 7 tips to master focus 🎯</p><p>Did you know time blocking can boost productivity up to 80%?</p>`,
  },
];

const NAV_FOLDERS = [
  { icon: "inbox",    label: "Doručená pošta", badge: 441, badgeType: "accent" },
  { icon: "star",     label: "Důležité",        badge: 12,  badgeType: "muted" },
  { icon: "send",     label: "Odeslané",        badge: null },
  { icon: "draft",    label: "Koncepty",        badge: 3,   badgeType: "amber" },
  { icon: "trash",    label: "Koš",             badge: null },
  { icon: "shield",   label: "Spam",            badge: 7,   badgeType: "red" },
];

const NAV_CATEGORIES = [
  { label: "Primární",     color: "#8B5CF6", badge: null },
  { label: "Aktualizace",  color: "#F59E0B", badge: 500, badgeType: "red" },
  { label: "Propagace",    color: "#10B981", badge: 125, badgeType: "muted" },
  { label: "Sociální sítě",color: "#3B82F6", badge: 451, badgeType: "muted" },
];

// ================================================================
// ICONS (inline SVG helpers)
// ================================================================
const Icon = ({ d, size = 14, fill = "none", stroke = "currentColor", sw = 2, vb = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={vb} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ================================================================
// SUB-COMPONENTS
// ================================================================

function Badge({ count, type }) {
  if (!count) return null;
  return <span className={`${s.navBadge} ${s[`badge_${type}`] || ""}`}>{count > 999 ? "999+" : count}</span>;
}

function EmailTag({ tag }) {
  if (!tag) return null;
  return <span className={`${s.emailTag} ${s[`tag_${tag.type}`]}`}>{tag.label}</span>;
}

function Avatar({ initials, color, size = 34 }) {
  return (
    <div className={s.avatar} style={{ background: color, width: size, height: size, fontSize: size < 36 ? "0.72rem" : "0.8rem" }}>
      {initials}
    </div>
  );
}

// ================================================================
// MAIN COMPONENT
// ================================================================
export default function GmailWorkspace() {
  const [activeFolder, setActiveFolder]   = useState(0);
  const [activeEmail,  setActiveEmail]    = useState(0);
  const [emails,       setEmails]         = useState(MOCK_EMAILS);
  const [replyOpen,    setReplyOpen]      = useState(false);
  const [replyText,    setReplyText]      = useState("");
  const [filterTab,    setFilterTab]      = useState(0);
  const [search,       setSearch]         = useState("");
  const replyRef = useRef(null);

  const selectedEmail = emails[activeEmail];

  const filteredEmails = emails.filter(e => {
    if (filterTab === 1 && !e.unread) return false;
    if (filterTab === 2 && !e.starred) return false;
    if (search && !e.subject.toLowerCase().includes(search.toLowerCase()) &&
        !e.sender.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const markRead = (idx) => {
    setEmails(prev => prev.map((e, i) => i === idx ? { ...e, unread: false } : e));
  };

  const handleSelectEmail = (i) => {
    setActiveEmail(i);
    markRead(i);
    setReplyOpen(false);
    setReplyText("");
  };

  const handleReply = () => {
    setReplyOpen(v => !v);
    if (!replyOpen) setTimeout(() => replyRef.current?.focus(), 50);
  };

  return (
    <div className={s.workspace}>

      {/* ====== SIDEBAR ====== */}
      <aside className={s.sidebar}>
        <div className={s.sidebarHeader}>
          <div className={s.sidebarBrand}>
            <div className={s.sidebarLogo}>A</div>
            <span className={s.sidebarBrandName}>Aidvisora</span>
          </div>
          <button className={s.composeBtn} onClick={() => { setReplyOpen(true); setReplyText(""); }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Napsat e-mail
          </button>
        </div>

        <nav className={s.sidebarNav}>
          <span className={s.navSectionLabel}>Složky</span>

          {NAV_FOLDERS.map((f, i) => (
            <div key={i}
              className={`${s.navItem} ${activeFolder === i ? s.navItemActive : ""}`}
              onClick={() => setActiveFolder(i)}
            >
              <div className={s.navIcon}>
                {/* Folder icons */}
                {i === 0 && <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v2H4z"/><path d="M4 8l8 5 8-5v10H4V8z"/></svg>}
                {i === 1 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
                {i === 2 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                {i === 3 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                {i === 4 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>}
                {i === 5 && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
              </div>
              {f.label}
              <Badge count={f.badge} type={f.badgeType} />
            </div>
          ))}

          <span className={s.navSectionLabel} style={{ marginTop: 8 }}>Kategorie</span>

          {NAV_CATEGORIES.map((c, i) => (
            <div key={i} className={s.navItem} onClick={() => {}}>
              <div className={s.navIcon}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill={c.color}><circle cx="12" cy="12" r="12"/></svg>
              </div>
              {c.label}
              <Badge count={c.badge} type={c.badgeType} />
            </div>
          ))}
        </nav>

        <div className={s.sidebarFooter}>
          <div className={s.storageBarLabel}>
            <span>Úložiště</span>
            <span>6,3 GB / 15 GB</span>
          </div>
          <div className={s.storageBar}><div className={s.storageBarFill} /></div>
        </div>
      </aside>

      {/* ====== EMAIL LIST ====== */}
      <div className={s.emailListPanel}>
        {/* Toolbar */}
        <div className={s.listToolbar}>
          <div className={s.searchBox}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Hledat e-maily, kontakty..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className={s.toolbarBtn} title="Obnovit">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className={s.filterTabs}>
          {["Vše", "Nepřečtené", "S hvězdičkou", "Přílohy"].map((t, i) => (
            <div key={i}
              className={`${s.filterTab} ${filterTab === i ? s.filterTabActive : ""}`}
              onClick={() => setFilterTab(i)}
            >
              {t}
              {i === 1 && <span className={s.filterTabCount}>{emails.filter(e => e.unread).length}</span>}
            </div>
          ))}
        </div>

        {/* Email list */}
        <div className={s.emailList}>
          {filteredEmails.map((email, i) => (
            <div key={email.id}
              className={`${s.emailItem} ${email.unread ? s.emailUnread : ""} ${activeEmail === i ? s.emailActive : ""}`}
              onClick={() => handleSelectEmail(i)}
            >
              <Avatar initials={email.initials} color={email.avatarColor} size={34} />
              <div className={s.emailBody}>
                <div className={s.emailSender}>{email.sender}</div>
                <div className={s.emailSubject}>{email.subject}</div>
                <div className={s.emailPreview}>{email.preview}</div>
              </div>
              <div className={s.emailMeta}>
                <span className={s.emailDate}>{email.date}</span>
                <EmailTag tag={email.tag} />
              </div>
            </div>
          ))}
        </div>

        <div className={s.listLoadMore}>Načíst další →</div>
      </div>

      {/* ====== EMAIL DETAIL ====== */}
      <div className={s.emailDetail}>
        {/* Detail toolbar */}
        <div className={s.detailToolbar}>
          <button className={s.detailActionBtn} onClick={handleReply}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Odpovědět
          </button>
          <button className={s.detailActionBtn}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
            Přeposlat
          </button>
          <button className={s.detailActionBtn}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 9v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"/><path d="M9 22V12h6v10M2 10.5L12 2l10 8.5"/></svg>
            Archivovat
          </button>
          <button className={`${s.detailActionBtn} ${s.detailActionDanger}`} style={{ marginLeft: "auto" }}
            onClick={() => {
              setEmails(prev => prev.filter((_, i) => i !== activeEmail));
              setActiveEmail(0);
            }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Smazat
          </button>
        </div>

        {/* Email content */}
        <div className={s.detailScroll}>
          {selectedEmail && (
            <div className={s.detailContent}>
              <div className={s.detailSubject}>{selectedEmail.subject}</div>

              <div className={s.detailMeta}>
                <Avatar initials={selectedEmail.initials} color={selectedEmail.avatarColor} size={38} />
                <div className={s.detailMetaText}>
                  <div className={s.detailFrom}>
                    {selectedEmail.sender} <span>&lt;{selectedEmail.senderEmail}&gt;</span>
                  </div>
                  <div className={s.detailTo}>Komu: {selectedEmail.to}</div>
                </div>
                <div className={s.detailTimestamp}>{selectedEmail.fullDate}</div>
              </div>

              <div
                className={s.detailBody}
                dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
              />
            </div>
          )}
        </div>

        {/* Reply composer */}
        {replyOpen && (
          <div className={s.replyComposer}>
            <div className={s.replyHeader}>
              <span className={s.replyLabel}>Odpověď</span>
              <span className={s.replyTo}>{selectedEmail?.senderEmail}</span>
            </div>
            <textarea
              ref={replyRef}
              className={s.replyTextarea}
              placeholder="Napište odpověď..."
              rows={3}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
            />
            <div className={s.replyActions}>
              <div className={s.replyBtnGroup}>
                <button className={s.replyIconBtn} title="Příloha">
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <button className={s.replyIconBtn} title="Zavřít" onClick={() => setReplyOpen(false)}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <button className={s.replySendBtn} onClick={() => { setReplyOpen(false); setReplyText(""); }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Odeslat
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
