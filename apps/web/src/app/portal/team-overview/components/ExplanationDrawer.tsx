"use client";

import type { Recommendation } from "@/lib/team-overview/recommendation-engine";

/**
 * F5 ExplanationDrawer \u2014 detailn\u00ed rozpad doporu\u010den\u00ed (co data \u0159\u00edkaj\u00ed, pro\u010d,
 * co d\u011blat d\u00e1l). Zobrazuje se jako off-canvas panel.
 */
export function ExplanationDrawer({
  recommendation,
  onClose,
  onAction,
}: {
  recommendation: Recommendation | null;
  onClose: () => void;
  onAction?: (rec: Recommendation) => void;
}) {
  if (!recommendation) return null;
  const r = recommendation;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{priorityLabel(r.priority)} \u00b7 {timingLabel(r.timing)}</div>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{r.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Zav\u0159\u00edt"
          >
            \u2715
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-700">{r.summary}</p>

        <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="mb-2 font-semibold text-slate-700">Co data \u0159\u00edkaj\u00ed</div>
          <dl className="space-y-1">
            {r.explanation.map((row, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <dt className="text-slate-500">{row.label}</dt>
                <dd className="text-right font-medium text-slate-800">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mb-4 text-xs text-slate-500">
          <div>Zodpov\u011bdn\u00fd: <span className="font-medium text-slate-700">{ownerLabel(r.owner)}</span></div>
          <div>Typ: <span className="font-medium text-slate-700">{r.kind}</span></div>
        </div>

        <div className="flex gap-2">
          {onAction && (
            <button
              onClick={() => onAction(r)}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              {r.cta.label}
            </button>
          )}
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Zav\u0159\u00edt
          </button>
        </div>
      </aside>
    </div>
  );
}

function priorityLabel(p: Recommendation["priority"]): string {
  switch (p) {
    case "critical": return "KRITICK\u00c9";
    case "high": return "VYSOK\u00c1";
    case "medium": return "ST\u0158EDN\u00cd";
    case "low": return "N\u00cdZK\u00c1";
  }
}
function timingLabel(t: Recommendation["timing"]): string {
  switch (t) {
    case "today": return "Dnes";
    case "this_week": return "Tento t\u00fdden";
    case "this_month": return "Tento m\u011bs\u00edc";
  }
}
function ownerLabel(o: Recommendation["owner"]): string {
  switch (o) {
    case "manager": return "Mana\u017eer";
    case "director": return "\u0158editel";
    case "admin": return "Admin";
    case "member_self": return "\u010clen s\u00e1m";
  }
}
