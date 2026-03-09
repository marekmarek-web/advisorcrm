"use client";

import { AiSearchBar } from "@/app/components/AiSearchBar";
import { LinesAndDotsLoader } from "@/app/components/LinesAndDotsLoader";
import { Accordion, AccordionItem } from "@/app/components/Accordion";
import {
  SwipeNotificationList,
  type NotificationData,
} from "@/app/components/SwipeNotifications";
import { CustomSelectNav } from "@/app/components/CustomSelectNav";
import { LoadingGallery } from "@/app/components/LoadingGallery";

const DEMO_NOTIFICATIONS: NotificationData[] = [
  {
    id: "1",
    title: "Nový úkol",
    message: "Dokončit finanční analýzu pro domácnost Novákovi.",
    timestamp: new Date(Date.now() - 60_000),
  },
  {
    id: "2",
    title: "Připomínka",
    message: "Schůzka s klientem zítra v 10:00.",
    timestamp: new Date(Date.now() - 3600_000),
  },
];

export default function UiDemoPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-12">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">
          UI komponenty (z .txt šablon)
        </h1>
        <p className="text-slate-600 mt-1">
          Komponenty z plánu: AI Search Bar, Tooltips, Lines & Dots loader,
          Accordion, Swipe notifikace, Custom Select, Loading Gallery.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700">AI Search Bar</h2>
        <AiSearchBar
          placeholder="Ask WeAI"
          onSubmit={(v) => console.log("Submit:", v)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700">CSS Tooltips</h2>
        <p className="text-sm text-slate-600">
          Použití: <code className="bg-slate-100 px-1 rounded">data-tip="…"</code>, volitelně{" "}
          <code className="bg-slate-100 px-1 rounded">data-pos="top|bottom|left|right"</code>,{" "}
          <code className="bg-slate-100 px-1 rounded">data-variant="accent|danger|info"</code>.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn"
            data-tip="Tooltip nahoře (výchozí)"
            data-pos="top"
          >
            Top
          </button>
          <button
            type="button"
            className="btn"
            data-tip="Tooltip dole"
            data-pos="bottom"
          >
            Bottom
          </button>
          <span
            className="icon-btn"
            tabIndex={0}
            data-tip="Ikona – klikni mimo a tooltip zmizí"
            data-pos="right"
          >
            ⚙
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700">
          Lines and Dots loader
        </h2>
        <div className="flex items-center gap-6">
          <LinesAndDotsLoader />
          <LinesAndDotsLoader className="opacity-60" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700">Accordion (FAQ)</h2>
        <Accordion>
          <AccordionItem title="Co je WePlan?" defaultOpen>
            WePlan je CRM a plánovací nástroj pro finanční poradce.
          </AccordionItem>
          <AccordionItem title="Jak přidám kontakt?">
            V menu zvolte Kontakty → Přidat kontakt a vyplňte údaje.
          </AccordionItem>
          <AccordionItem title="Kde je board?">
            Board najdete v postranním menu pod položkou Board.
          </AccordionItem>
        </Accordion>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700">
          Swipe-to-Delete notifikace
        </h2>
        <SwipeNotificationList
          notifications={DEMO_NOTIFICATIONS}
          onDelete={(id) => console.log("Delete", id)}
          emptyMessage="Žádné notifikace"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700">
          Custom Select (experimentální)
        </h2>
        <p className="text-sm text-slate-600">
          <code>appearance: base-select</code> – podpora jen v některých
          prohlížečích.
        </p>
        <CustomSelectNav />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-700">
          Loading Gallery (24 loaderů)
        </h2>
        <LoadingGallery />
      </section>
    </div>
  );
}
