"use client";

import { useCallback, useEffect, useState } from "react";

export type ContactTabId = "prehled" | "smlouvy" | "dokumenty" | "aktivita" | "ukoly" | "obchody";

const TAB_IDS: ContactTabId[] = ["prehled", "smlouvy", "dokumenty", "aktivita", "ukoly", "obchody"];

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
    const hash = window.location.hash.slice(1) as ContactTabId;
    if (hash && TAB_IDS.includes(hash)) setActiveId(hash);
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
    <div>
      <nav className="flex items-center gap-6 md:gap-8 border-b-2 border-transparent" aria-label="Záložky">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`relative pb-4 text-sm font-bold transition-colors ${
              activeId === tab.id ? "text-blue-600" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
            {activeId === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-600 rounded-t-[var(--wp-radius-xs)]" aria-hidden />
            )}
          </button>
        ))}
      </nav>
      <div className="max-w-[1400px] mx-auto pt-6 px-4 md:px-6 space-y-6">
        {tabs.map((tab) => (
          <div key={tab.id} className={activeId === tab.id ? "block" : "hidden"}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
