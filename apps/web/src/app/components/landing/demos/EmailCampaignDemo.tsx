"use client";

import React from "react";
import { Monitor, Smartphone, Mail } from "lucide-react";
import { DemoFrame } from "./DemoFrame";
import { DEMO_EMAIL_TEMPLATES } from "./demo-data";

/**
 * E-mail kampaně — mini verze skutečného `EmailCampaignsClient`:
 * vlevo koncept (výběr šablony + editor), vpravo live preview s možností
 * přepnout mezi desktop a mobile zobrazením.
 */
export function EmailCampaignDemo() {
  const [templateId, setTemplateId] = React.useState(DEMO_EMAIL_TEMPLATES[0].id);
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");

  const template = DEMO_EMAIL_TEMPLATES.find((t) => t.id === templateId) ?? DEMO_EMAIL_TEMPLATES[0];

  const renderedSubject = template.subject
    .replaceAll("{{jmeno}}", "Jano")
    .replaceAll("{{mesic}}", "listopad");
  const renderedBody = template.body
    .replaceAll("{{jmeno}}", "Jano")
    .replaceAll("{{mesic}}", "listopad")
    .replaceAll("{{poradce}}", "Tomáš Novák");

  return (
    <DemoFrame label="E-mail kampaně · Editor a náhled" status={template.name} statusTone="emerald">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] min-h-[520px]">
        {/* Editor */}
        <div className="border-b lg:border-b-0 lg:border-r border-white/10 p-4 md:p-5 bg-[#0a0f29]/40 flex flex-col">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Šablona</div>
          <div className="grid grid-cols-1 gap-1.5 mb-4">
            {DEMO_EMAIL_TEMPLATES.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`text-left p-2.5 rounded-xl border transition-all ${
                    active
                      ? "bg-emerald-500/10 border-emerald-500/40 text-white"
                      : "bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">{t.preheader}</div>
                </button>
              );
            })}
          </div>

          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Předmět</div>
          <input
            value={template.subject}
            readOnly
            className="text-sm text-white bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 mb-3 focus:outline-none"
          />

          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Tělo</div>
          <textarea
            value={template.body}
            readOnly
            rows={9}
            className="text-xs text-slate-200 bg-white/[0.04] border border-white/10 rounded-lg p-3 flex-1 focus:outline-none resize-none font-mono leading-relaxed"
          />

          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <Mail size={12} />
            <span>Proměnné jako <code className="text-slate-300">{"{{jmeno}}"}</code> doplníme z dat klienta.</span>
          </div>
        </div>

        {/* Preview */}
        <div className="p-4 md:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Živý náhled</span>
            <div className="inline-flex items-center rounded-full bg-white/[0.04] border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setDevice("desktop")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  device === "desktop" ? "bg-white/10 text-white" : "text-slate-400"
                }`}
                aria-pressed={device === "desktop"}
              >
                <Monitor size={12} /> Desktop
              </button>
              <button
                type="button"
                onClick={() => setDevice("mobile")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  device === "mobile" ? "bg-white/10 text-white" : "text-slate-400"
                }`}
                aria-pressed={device === "mobile"}
              >
                <Smartphone size={12} /> Mobil
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-start justify-center overflow-hidden">
            <div
              className={`transition-all duration-300 rounded-2xl overflow-hidden bg-[#f8fafc] text-slate-900 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.4)] ${
                device === "mobile" ? "w-[280px]" : "w-full max-w-[480px]"
              }`}
            >
              <div className="bg-white border-b border-slate-200 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Od: Tomáš Novák</div>
                <div className="text-sm font-bold text-slate-900 leading-tight">{renderedSubject}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{template.preheader}</div>
              </div>
              <div className="p-4 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                {renderedBody}
              </div>
              <div className="px-4 pb-4">
                <button className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                  {template.id === "tpl-invite" ? "Vybrat termín" : "Otevřít portál"}
                </button>
              </div>
              <div className="px-4 py-3 border-t border-slate-200 text-[10px] text-slate-400 leading-relaxed">
                Aidvisora · demo náhled · odhlásit z informačních e-mailů
              </div>
            </div>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

export default EmailCampaignDemo;
