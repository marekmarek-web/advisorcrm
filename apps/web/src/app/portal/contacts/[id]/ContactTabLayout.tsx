"use client";

import { createContext, useCallback, useContext, useEffect, useState, Suspense } from "react";

export type ContactTabId = "prehled" | "timeline" | "smlouvy" | "dokumenty" | "zapisky" | "aktivita" | "ukoly" | "obchody" | "briefing";

const TAB_IDS: ContactTabId[] = ["prehled", "timeline", "smlouvy", "dokumenty", "zapisky", "aktivita", "ukoly", "obchody", "briefing"];

export const ContactTabContext = createContext<ContactTabId>("prehled");

export function useContactTab(): ContactTabId {
  return useContext(ContactTabContext);
}

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-48 bg-[color:var(--wp-surface-card-border)] rounded" />
      <div className="h-4 w-full bg-[color:var(--wp-surface-muted)] rounded" />
      <div className="h-4 w-3/4 bg-[color:var(--wp-surface-muted)] rounded" />
      <div className="h-32 w-full bg-[color:var(--wp-surface-muted)] rounded-xl" />
    </div>
  );
}

export function ContactTabLayout({
  tabs,
  defaultTab = "prehled",
}: {
  tabs: { id: ContactTabId; label: string; content: React.ReactNode }[];
  defaultTab?: ContactTabId;
}) {
  const [activeId, setActiveId] = useState<ContactTabId>(defaultTab);

  const readHash = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = window.location.hash.slice(1);
    const tabPart = raw.split("&")[0] as ContactTabId;
    if (tabPart && TAB_IDS.includes(tabPart)) setActiveId(tabPart);
  }, []);

  useEffect(() => {
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [readHash]);

  const setTab = useCallback((id: ContactTabId) => {
    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <ContactTabContext.Provider value={activeId}>
      <div className="wp-contact-v2-tabs">
        <nav
        className="flex items-center gap-6 md:gap-8 border-b border-[color:var(--wp-surface-card-border)] px-2 overflow-x-auto hide-scrollbar min-h-[48px]"
        aria-label="Záložky"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`relative pb-4 pt-2 text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap min-h-[44px] flex items-center ${
              activeId === tab.id ? "text-indigo-600" : "text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)]"
            }`}
          >
            {tab.label}
            {activeId === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-indigo-600 rounded-t-full" aria-hidden />
            )}
          </button>
        ))}
      </nav>
      <div className="pt-6 pb-8">
        {activeTab ? (
          <Suspense key={activeTab.id} fallback={<TabSkeleton />}>
            {activeTab.content}
          </Suspense>
        ) : null}
      </div>
    </div>
    </ContactTabContext.Provider>
  );
}
