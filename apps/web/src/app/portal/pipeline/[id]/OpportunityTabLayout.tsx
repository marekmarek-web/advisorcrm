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
    <div className="mt-4">
      <nav className="flex gap-0 border-b border-slate-200" aria-label="Záložky">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeId === id
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
            }`}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>
      <div className="pt-4">
        {tabs.map((tab) => (
          <div key={tab.id} className={activeId === tab.id ? "block" : "hidden"}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
