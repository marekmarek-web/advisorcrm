"use client";

import { useEffect, useState, useCallback } from "react";
import { getDeadLetterItems, getAiControlSettings, updateAiControlSetting, type DeadLetterRow, type AiControlSettings } from "@/app/actions/admin-ai-control";

type QualitySummary = {
  totalDocuments: number;
  successCount: number;
  reviewRequiredCount: number;
  failedCount: number;
  successRate: number;
  reviewRequiredRate: number;
  failedRate: number;
  avgPreprocessDurationMs: number | null;
  avgPipelineDurationMs: number | null;
  byDocumentType: Record<string, { total: number; success: number; failed: number; review: number }>;
  byInputMode: Record<string, { total: number; success: number; failed: number; review: number }>;
  topFailedSteps: Record<string, number>;
  topReasons: Record<string, number>;
};

type CorrectionSummary = {
  totalCorrectedReviews: number;
  topCorrectedFields: Record<string, number>;
  correctionsByDocumentType: Record<string, number>;
};

type ActiveTab = "quality" | "toggles" | "dead-letter";

function KpiCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[color:var(--wp-text)]">{value}</p>
      {subtext ? <p className="mt-0.5 text-xs text-[color:var(--wp-text-secondary)]">{subtext}</p> : null}
    </div>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)} %`;
}

function msToSec(ms: number | null): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  resolved: "bg-emerald-100 text-emerald-800",
};

const AUTO_LEVEL_OPTIONS = [
  { value: "manual_only", label: "Jen manuálně" },
  { value: "draft_only", label: "Pouze návrhy" },
  { value: "approval_required", label: "Vyžaduje schválení" },
  { value: "auto_disabled", label: "Automatika vypnuta" },
];

const PROFILE_OPTIONS = [
  { value: "conservative", label: "Konzervativní" },
  { value: "balanced", label: "Vyvážený" },
  { value: "proactive", label: "Proaktivní" },
];

export default function AIControlPlane() {
  const [quality, setQuality] = useState<QualitySummary | null>(null);
  const [corrections, setCorrections] = useState<CorrectionSummary | null>(null);
  const [qualityLoading, setQualityLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<ActiveTab>("quality");

  // AI toggles
  const [aiSettings, setAiSettings] = useState<AiControlSettings | null>(null);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiSettingsSaving, setAiSettingsSaving] = useState<string | null>(null);
  const [aiSettingsError, setAiSettingsError] = useState<string | null>(null);

  // Dead-letter
  const [deadLetters, setDeadLetters] = useState<DeadLetterRow[]>([]);
  const [deadLetterLoading, setDeadLetterLoading] = useState(false);
  const [deadLetterError, setDeadLetterError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "quality") return;
    setQualityLoading(true);
    Promise.all([
      fetch(`/api/admin/ai/quality-summary?days=${days}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/ai/correction-summary?days=${days}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([q, c]) => {
      setQuality(q);
      setCorrections(c);
      setQualityLoading(false);
    });
  }, [days, activeTab]);

  useEffect(() => {
    if (activeTab !== "toggles" || aiSettings) return;
    setAiSettingsLoading(true);
    getAiControlSettings()
      .then(setAiSettings)
      .catch(() => setAiSettingsError("Nepodařilo se načíst nastavení."))
      .finally(() => setAiSettingsLoading(false));
  }, [activeTab, aiSettings]);

  useEffect(() => {
    if (activeTab !== "dead-letter" || deadLetters.length > 0) return;
    setDeadLetterLoading(true);
    setDeadLetterError(null);
    getDeadLetterItems()
      .then((rows) => {
        setDeadLetters(rows);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "";
        setDeadLetterError(
          msg === "Forbidden"
            ? "Nemáte oprávnění prohlížet dead-letter frontu."
            : "Nepodařilo se načíst dead-letter frontu.",
        );
      })
      .finally(() => setDeadLetterLoading(false));
  }, [activeTab, deadLetters.length]);

  const handleToggleSetting = useCallback(async (key: string, value: unknown) => {
    setAiSettingsSaving(key);
    setAiSettingsError(null);
    const res = await updateAiControlSetting(key, value);
    if (res.ok) {
      setAiSettings((prev) => prev ? { ...prev, ...mapKeyToState(key, value) } : prev);
    } else {
      setAiSettingsError(res.error ?? "Uložení selhalo.");
    }
    setAiSettingsSaving(null);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-black text-[color:var(--wp-text)]">AI Control Plane</h1>
        <div className="flex gap-2">
          {(["quality", "toggles", "dead-letter"] as ActiveTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === t
                  ? "bg-indigo-600 text-white"
                  : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card-border)]"
              }`}
            >
              {t === "quality" ? "Kvalita pipeline" : t === "toggles" ? "AI nastavení" : "Dead-letter"}
            </button>
          ))}
        </div>
      </div>

      {/* Quality tab */}
      {activeTab === "quality" && (
        <>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  days === d ? "bg-indigo-600 text-white" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {qualityLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám metriky...</p>
            </div>
          ) : quality ? (
            <div className="space-y-8">
              <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">KPI</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <KpiCard label="Celkem dokumentů" value={quality.totalDocuments} />
                  <KpiCard label="Úspěšně" value={quality.successCount} subtext={pct(quality.successRate)} />
                  <KpiCard label="Ke kontrole" value={quality.reviewRequiredCount} subtext={pct(quality.reviewRequiredRate)} />
                  <KpiCard label="Selhání" value={quality.failedCount} subtext={pct(quality.failedRate)} />
                  <KpiCard label="Průměrná doba" value={msToSec(quality.avgPipelineDurationMs)} subtext={`Preprocess: ${msToSec(quality.avgPreprocessDurationMs)}`} />
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">Podle typu dokumentu</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--wp-surface-card-border)] text-left text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
                        <th className="py-2 pr-4">Typ</th>
                        <th className="py-2 pr-4">Celkem</th>
                        <th className="py-2 pr-4">OK</th>
                        <th className="py-2 pr-4">Review</th>
                        <th className="py-2 pr-4">Fail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(quality.byDocumentType)
                        .sort(([, a], [, b]) => b.total - a.total)
                        .map(([type, counts]) => (
                          <tr key={type} className="border-b border-[color:var(--wp-surface-card-border)]">
                            <td className="py-1.5 pr-4 font-medium text-[color:var(--wp-text)]">{type}</td>
                            <td className="py-1.5 pr-4">{counts.total}</td>
                            <td className="py-1.5 pr-4 text-emerald-700">{counts.success}</td>
                            <td className="py-1.5 pr-4 text-amber-700">{counts.review}</td>
                            <td className="py-1.5 pr-4 text-red-700">{counts.failed}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {Object.keys(quality.topFailedSteps).length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">Top selhané kroky</h2>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(quality.topFailedSteps)
                      .sort(([, a], [, b]) => b - a)
                      .map(([step, count]) => (
                        <span key={step} className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
                          {step}: {count}
                        </span>
                      ))}
                  </div>
                </section>
              )}

              {corrections && (
                <section>
                  <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
                    Opravy ({corrections.totalCorrectedReviews} celkem)
                  </h2>
                  {Object.keys(corrections.topCorrectedFields).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(corrections.topCorrectedFields)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 15)
                        .map(([field, count]) => (
                          <div key={field} className="flex items-center gap-2">
                            <div
                              className="h-2 rounded-full bg-indigo-500"
                              style={{ width: `${Math.min(100, (count / corrections.totalCorrectedReviews) * 100 * 3)}%`, minWidth: "4px" }}
                            />
                            <span className="text-xs text-[color:var(--wp-text-secondary)]">{field} ({count})</span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[color:var(--wp-text-secondary)]">Zatím žádné opravy.</p>
                  )}
                </section>
              )}
            </div>
          ) : (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Nepodařilo se načíst metriky.</p>
          )}
        </>
      )}

      {/* AI Toggles tab */}
      {activeTab === "toggles" && (
        <div className="max-w-2xl space-y-6">
          {aiSettingsLoading ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám...</p>
          ) : aiSettings ? (
            <>
              {aiSettingsError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{aiSettingsError}</p>
              )}

              <SettingToggle
                label="AI Asistent povolen"
                description="Zapíná nebo vypíná AI asistenta pro celý workspace."
                value={aiSettings.assistantEnabled}
                saving={aiSettingsSaving === "ai.assistant_enabled"}
                onChange={(v) => handleToggleSetting("ai.assistant_enabled", v)}
              />

              <SettingSelect
                label="Max. úroveň automatizace"
                description="Určuje, jak daleko smí AI provádět akce bez potvrzení."
                options={AUTO_LEVEL_OPTIONS}
                value={aiSettings.maxAutomationLevel}
                saving={aiSettingsSaving === "ai.max_automation_level"}
                onChange={(v) => handleToggleSetting("ai.max_automation_level", v)}
              />

              <SettingSelect
                label="Profil asistenta"
                description="Chování asistenta při generování návrhů."
                options={PROFILE_OPTIONS}
                value={aiSettings.assistantProfile}
                saving={aiSettingsSaving === "ai.assistant_profile"}
                onChange={(v) => handleToggleSetting("ai.assistant_profile", v)}
              />

              <SettingToggle
                label="Návrhy aplikace (Apply suggestions)"
                description="Povolí AI navrhovat aplikaci akcí na zkontrolované dokumenty."
                value={aiSettings.allowApplySuggestions}
                saving={aiSettingsSaving === "ai.allow_apply_suggestions"}
                onChange={(v) => handleToggleSetting("ai.allow_apply_suggestions", v)}
              />
            </>
          ) : (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Nepodařilo se načíst nastavení.</p>
          )}
        </div>
      )}

      {/* Dead-letter tab */}
      {activeTab === "dead-letter" && (
        <div className="space-y-4">
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Položky, které se opakovaně nepodařilo zpracovat. Slouží k dohledání selhání a eskalaci.
          </p>
          {deadLetterLoading ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám...</p>
          ) : deadLetterError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-700">{deadLetterError}</p>
            </div>
          ) : deadLetters.length === 0 ? (
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-8 text-center">
              <p className="text-sm font-medium text-emerald-600">Žádné položky v dead-letteru. ✓</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--wp-surface-card-border)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-left text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
                    <th className="px-4 py-2.5">Typ úlohy</th>
                    <th className="px-4 py-2.5">Stav</th>
                    <th className="px-4 py-2.5">Pokusy</th>
                    <th className="px-4 py-2.5">Důvod selhání</th>
                    <th className="px-4 py-2.5">Korelace</th>
                    <th className="px-4 py-2.5">Vytvořeno</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--wp-surface-card-border)]">
                  {deadLetters.map((dl) => (
                    <tr key={dl.id} className="hover:bg-[color:var(--wp-surface-muted)] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-[color:var(--wp-text)]">{dl.jobType}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[dl.status] ?? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"}`}>
                          {dl.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)]">{dl.attempts}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate text-[color:var(--wp-text-secondary)]" title={dl.failureReason ?? ""}>
                        {dl.failureReason ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)] font-mono text-[10px]">{dl.correlationId ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)] whitespace-nowrap">
                        {new Date(dl.createdAt).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingToggle({ label, description, value, saving, onChange }: {
  label: string; description: string; value: boolean; saving: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
      <div>
        <p className="text-sm font-bold text-[color:var(--wp-text)]">{label}</p>
        <p className="text-xs text-[color:var(--wp-text-secondary)]">{description}</p>
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={value}
          disabled={saving}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="h-6 w-11 rounded-full bg-[color:var(--wp-surface-card-border)] peer-checked:bg-indigo-600 peer-focus:ring-2 peer-focus:ring-indigo-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
      </label>
    </div>
  );
}

function SettingSelect({ label, description, options, value, saving, onChange }: {
  label: string; description: string; options: { value: string; label: string }[]; value: string; saving: boolean; onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
      <p className="text-sm font-bold text-[color:var(--wp-text)]">{label}</p>
      <p className="mb-3 text-xs text-[color:var(--wp-text-secondary)]">{description}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${value === opt.value ? "bg-indigo-600 text-white" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card-border)]"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function mapKeyToState(key: string, value: unknown): Partial<AiControlSettings> {
  switch (key) {
    case "ai.assistant_enabled": return { assistantEnabled: value as boolean };
    case "ai.max_automation_level": return { maxAutomationLevel: value as string };
    case "ai.assistant_profile": return { assistantProfile: value as string };
    case "ai.allow_apply_suggestions": return { allowApplySuggestions: value as boolean };
    default: return {};
  }
}
