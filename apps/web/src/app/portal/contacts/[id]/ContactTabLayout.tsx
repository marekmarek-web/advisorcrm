"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ContactTabId = "prehled" | "timeline" | "smlouvy" | "dokumenty" | "zapisky" | "aktivita" | "ukoly" | "obchody" | "briefing";

const TAB_IDS: ContactTabId[] = ["prehled", "timeline", "smlouvy", "dokumenty", "zapisky", "aktivita", "ukoly", "obchody", "briefing"];

export const ContactTabContext = createContext<ContactTabId>("prehled");

export function useContactTab(): ContactTabId {
  return useContext(ContactTabContext);
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

  return (
    <ContactTabContext.Provider value={activeId}>
      <div className="wp-contact-v2-tabs">
        <nav
        className="flex items-center gap-6 md:gap-8 border-b border-slate-200 px-2 overflow-x-auto hide-scrollbar min-h-[48px]"
        aria-label="Záložky"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`relative pb-4 pt-2 text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap min-h-[44px] flex items-center ${
              activeId === tab.id ? "text-indigo-600" : "text-slate-400 hover:text-slate-800"
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
        {tabs.map((tab) => (
          <div key={tab.id} className={activeId === tab.id ? "block" : "hidden"}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
    </ContactTabContext.Provider>
  );
}
