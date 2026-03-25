"use client";

import { useCallback, useEffect, useState } from "react";

export type OpportunityTabId =
  | "casova_osa"
  | "produkty"
  | "nabidky"
  | "navazane"
  | "poznamky"
  | "vlastni_pole";

const TAB_IDS: OpportunityTabId[] = [
  "casova_osa",
  "produkty",
  "nabidky",
  "navazane",
  "poznamky",
  "vlastni_pole",
];

const TAB_LABELS: Record<OpportunityTabId, string> = {
  casova_osa: "Časová osa",
  produkty: "Produkty",
  nabidky: "Nabídky/Objednávky",
  navazane: "Navázané záznamy",
  poznamky: "Poznámky",
  vlastni_pole: "Vlastní pole",
};

export function OpportunityTabLayout({
  tabs,
  defaultTab = "casova_osa",
}: {
  tabs: { id: OpportunityTabId; content: React.ReactNode }[];
  defaultTab?: OpportunityTabId;
}) {
  const [activeId, setActiveId] = useState<OpportunityTabId>(defaultTab);

  const readHash = useCallback(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1) as OpportunityTabId;
    if (hash && TAB_IDS.includes(hash)) setActiveId(hash);
  }, []);

  useEffect(() => {
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [readHash]);

  const setTab = useCallback((id: OpportunityTabId) => {
    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  return (
    <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[400px] sm:min-h-[600px]">
      <div
        className="flex items-center border-b border-slate-100 px-2 sm:px-4 pt-2 overflow-x-auto hide-scrollbar bg-slate-50/50"
        role="tablist"
        aria-label="Záložky obchodu"
      >
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeId === id}
            onClick={() => setTab(id)}
            className={`min-h-[44px] px-4 sm:px-6 py-4 text-xs sm:text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap touch-manipulation ${
              activeId === id
                ? "text-indigo-600"
                : "text-slate-400 hover:text-slate-800"
            }`}
          >
            {TAB_LABELS[id]}
            {activeId === id ? (
              <span
                className="absolute bottom-0 left-0 w-full h-[3px] bg-indigo-600 rounded-t-md"
                aria-hidden
              />
            ) : null}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-8 flex-1 min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            hidden={activeId !== tab.id}
            className={activeId === tab.id ? "block" : "hidden"}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
