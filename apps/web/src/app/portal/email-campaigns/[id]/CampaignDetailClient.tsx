"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CampaignDetailPayload,
  CampaignRecipientRow,
  AbTestInfo,
} from "@/app/actions/email-campaign-detail";
import { cancelScheduledCampaign } from "@/app/actions/email-campaign-detail";
import { queueEmailCampaign } from "@/app/actions/email-campaigns";
import { finalizeAbTestWinner } from "@/app/actions/email-ab-testing";

type Props = { data: CampaignDetailPayload };

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "Koncept",
    scheduled: "Naplánováno",
    queued: "Ve frontě",
    sending: "Odesílá se",
    sent: "Odesláno",
    failed: "Selhalo",
    cancelled: "Zrušeno",
  };
  return map[s] ?? s;
}

function recipientStatusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: "Čeká",
    queued: "Ve frontě",
    sent: "Odesláno",
    delivered: "Doručeno",
    opened: "Otevřeno",
    clicked: "Kliknuto",
    bounced: "Bounce",
    complained: "Stížnost",
    failed: "Selhalo",
    unsubscribed: "Odhlášen",
    skipped: "Přeskočen",
  };
  return map[s] ?? s;
}

function StatusChip({ value }: { value: string }) {
  const tone = statusTone(value);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}
    >
      {recipientStatusLabel(value)}
    </span>
  );
}

function statusTone(s: string): string {
  switch (s) {
    case "sent":
    case "delivered":
      return "bg-emerald-50 text-emerald-700";
    case "opened":
      return "bg-sky-50 text-sky-700";
    case "clicked":
      return "bg-violet-50 text-violet-700";
    case "bounced":
    case "complained":
    case "failed":
      return "bg-rose-50 text-rose-700";
    case "unsubscribed":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function CampaignDetailClient({ data }: Props) {
  const router = useRouter();
  const [schedPickerOpen, setSchedPickerOpen] = useState(false);
  const [scheduleISO, setScheduleISO] = useState<string>(() => {
    const now = new Date(Date.now() + 60 * 60 * 1000);
    return now.toISOString().slice(0, 16);
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isInflight = data.status === "queued" || data.status === "sending";
  const isScheduled = data.status === "scheduled";
  const isTerminal = ["sent", "failed", "cancelled"].includes(data.status);

  const progressPct = useMemo(() => {
    if (data.kpis.recipientCount === 0) return 0;
    const done =
      data.kpis.sentCount + data.kpis.failedCount + data.kpis.bounceCount;
    return Math.min(1, done / data.kpis.recipientCount);
  }, [data.kpis]);

  const onSchedule = () => {
    setError(null);
    startTransition(async () => {
      try {
        const when = scheduleISO ? new Date(scheduleISO) : null;
        await queueEmailCampaign({
          campaignId: data.id,
          scheduledFor: when,
        });
        router.refresh();
        setSchedPickerOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const onCancel = () => {
    if (!confirm("Opravdu zrušit plán odeslání?")) return;
    startTransition(async () => {
      try {
        await cancelScheduledCampaign(data.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const onSendNow = () => {
    if (!confirm("Odeslat kampaň hned teď?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await queueEmailCampaign({ campaignId: data.id });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              {statusLabel(data.status)} •{" "}
              {data.scheduledAt
                ? `Plán: ${formatDate(data.scheduledAt)}`
                : data.sentAt
                  ? `Odesláno: ${formatDate(data.sentAt)}`
                  : `Vytvořeno: ${formatDate(data.createdAt)}`}
            </p>
            <h1 className="mt-1 text-2xl font-black text-[color:var(--wp-text)]">{data.name}</h1>
            <p className="mt-2 text-sm text-[color:var(--wp-text-secondary)]">
              <strong>Předmět:</strong> {data.subject}
            </p>
            {data.preheader ? (
              <p className="mt-1 text-sm text-[color:var(--wp-text-tertiary)]">
                <strong>Preheader:</strong> {data.preheader}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.status === "draft" ? (
              <>
                <button
                  type="button"
                  onClick={onSendNow}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--wp-primary)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[color:var(--wp-primary-hover)] disabled:opacity-50"
                >
                  Odeslat teď
                </button>
                <button
                  type="button"
                  onClick={() => setSchedPickerOpen((v) => !v)}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-4 py-2 text-sm font-bold text-[color:var(--wp-text)] shadow-sm hover:bg-[color:var(--wp-main-scroll-bg)]"
                >
                  Naplánovat…
                </button>
              </>
            ) : null}
            {isScheduled ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100"
              >
                Zrušit plán
              </button>
            ) : null}
          </div>
        </div>

        {schedPickerOpen ? (
          <div className="mt-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-4">
            <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Datum a čas odeslání
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="datetime-local"
                value={scheduleISO}
                onChange={(e) => setScheduleISO(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2 text-sm font-bold"
              />
              <button
                type="button"
                onClick={onSchedule}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--wp-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Potvrdit plán
              </button>
              <button
                type="button"
                onClick={() => setSchedPickerOpen(false)}
                className="text-sm font-bold text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)]"
              >
                Zrušit
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {isInflight || isScheduled || isTerminal ? (
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-[color:var(--wp-text-tertiary)]">
              <span>
                {data.kpis.sentCount + data.kpis.failedCount} / {data.kpis.recipientCount}
              </span>
              <span>{formatPct(progressPct)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--wp-main-scroll-bg)]">
              <div
                className="h-full bg-[color:var(--wp-primary)] transition-all"
                style={{ width: `${Math.round(progressPct * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-[color:var(--wp-text-tertiary)]">
              {data.kpis.pendingCount > 0
                ? `Ve frontě zbývá ${data.kpis.pendingCount} e-mailů.`
                : isTerminal
                  ? "Dokončeno."
                  : "Zpracovává se…"}
            </p>
          </div>
        ) : null}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <KpiCard label="Příjemců" value={data.kpis.recipientCount.toString()} />
        <KpiCard label="Odesláno" value={data.kpis.sentCount.toString()} />
        <KpiCard label="Doručeno" value={data.kpis.deliveredCount.toString()} />
        <KpiCard
          label="Open rate"
          value={formatPct(data.kpis.openRate)}
          hint={`${data.kpis.openCount} unikátních`}
        />
        <KpiCard
          label="Click rate"
          value={formatPct(data.kpis.clickRate)}
          hint={`${data.kpis.clickCount} unikátních`}
        />
        <KpiCard
          label="Bounce"
          value={formatPct(data.kpis.bounceRate)}
          hint={`${data.kpis.bounceCount}`}
          tone="rose"
        />
        <KpiCard
          label="Stížnosti"
          value={data.kpis.complaintCount.toString()}
          tone={data.kpis.complaintCount > 0 ? "rose" : "default"}
        />
        <KpiCard
          label="Odhlášení"
          value={data.kpis.unsubscribeCount.toString()}
          tone={data.kpis.unsubscribeCount > 0 ? "amber" : "default"}
        />
        <KpiCard
          label="Selhání"
          value={data.kpis.failedCount.toString()}
          tone={data.kpis.failedCount > 0 ? "rose" : "default"}
        />
      </div>

      {/* Sparkline (opens+clicks last 14 days) */}
      {data.sparkline.length > 0 ? (
        <div className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
            Engagement za 14 dní
          </h2>
          <Sparkline data={data.sparkline} />
        </div>
      ) : null}

      {/* A/B test panel */}
      {data.abTest ? (
        <AbTestPanel
          parentCampaignId={data.id}
          ab={data.abTest}
          onRefresh={() => router.refresh()}
        />
      ) : null}

      {/* Recipients table */}
      <div className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white shadow-sm">
        <div className="border-b border-[color:var(--wp-surface-card-border)] px-6 py-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
            Příjemci ({data.recipients.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--wp-main-scroll-bg)] text-xs uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
              <tr>
                <th className="px-4 py-2 text-left">Kontakt</th>
                <th className="px-4 py-2 text-left">E-mail</th>
                <th className="px-4 py-2 text-left">Stav</th>
                <th className="px-4 py-2 text-left">Odesláno</th>
                <th className="px-4 py-2 text-left">Otevřeno</th>
                <th className="px-4 py-2 text-left">Klik</th>
                <th className="px-4 py-2 text-left">Chyba</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--wp-surface-card-border)]">
              {data.recipients.map((r: CampaignRecipientRow) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-bold text-[color:var(--wp-text)]">
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="px-4 py-2 text-[color:var(--wp-text-secondary)]">{r.email}</td>
                  <td className="px-4 py-2">
                    <StatusChip value={r.status} />
                  </td>
                  <td className="px-4 py-2 text-[color:var(--wp-text-secondary)]">
                    {formatDate(r.sentAt)}
                  </td>
                  <td className="px-4 py-2 text-[color:var(--wp-text-secondary)]">
                    {formatDate(r.openedAt)}
                  </td>
                  <td className="px-4 py-2 text-[color:var(--wp-text-secondary)]">
                    {r.clickCount > 0 ? `${r.clickCount}× · ${formatDate(r.firstClickAt)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-rose-600">{r.errorMessage ?? ""}</td>
                </tr>
              ))}
              {data.recipients.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-sm text-[color:var(--wp-text-tertiary)]"
                    colSpan={7}
                  >
                    Zatím žádní příjemci.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "rose" | "amber";
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-[color:var(--wp-text)]";
  return (
    <div className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-white p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-black ${toneClass}`}>{value}</p>
      {hint ? <p className="text-[11px] text-[color:var(--wp-text-tertiary)]">{hint}</p> : null}
    </div>
  );
}

function Sparkline({ data }: { data: { date: string; opens: number; clicks: number }[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.opens, d.clicks)));
  const w = 600;
  const h = 120;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;

  const openPath = data
    .map((d, i) => {
      const x = i * stepX;
      const y = h - (d.opens / max) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const clickPath = data
    .map((d, i) => {
      const x = i * stepX;
      const y = h - (d.clicks / max) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <path d={openPath} fill="none" stroke="#0ea5e9" strokeWidth={2} />
        <path d={clickPath} fill="none" stroke="#7c3aed" strokeWidth={2} />
      </svg>
      <div className="flex gap-6 text-xs font-bold">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-4 rounded bg-sky-500" />
          Otevření
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-4 rounded bg-violet-600" />
          Kliknutí
        </span>
      </div>
    </div>
  );
}

function AbTestPanel({
  parentCampaignId,
  ab,
  onRefresh,
}: {
  parentCampaignId: string;
  ab: AbTestInfo;
  onRefresh: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const finalizeDate = new Date(ab.finalizeAt);
  const now = Date.now();
  const remainingMs = finalizeDate.getTime() - now;
  const canFinalize = !ab.finalizedAt && (ab.variantA.sentCount > 0 || ab.variantB.sentCount > 0);
  const winner = ab.pickedWinnerVariant;
  const aBetter = ab.variantA.openRate >= ab.variantB.openRate;

  const onFinalize = () => {
    if (!confirm("Vybrat vítěze teď a odeslat zbytku publika?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await finalizeAbTestWinner(parentCampaignId);
        onRefresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Finalizace A/B testu selhala.");
      }
    });
  };

  const maxOpenRate = Math.max(ab.variantA.openRate, ab.variantB.openRate, 0.001);

  return (
    <div className="rounded-[var(--wp-radius-card)] border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-indigo-700">
            A/B test
          </h2>
          <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
            Každá varianta obdrží {ab.splitPercent} % publika. Vítěz jde zbývajícím{" "}
            {100 - ab.splitPercent * 2} % (holdout).
          </p>
          <p className="mt-1 text-[11px] font-bold text-[color:var(--wp-text-tertiary)]">
            {ab.finalizedAt ? (
              <>
                Finalizováno {new Date(ab.finalizedAt).toLocaleString("cs-CZ")}. Vítěz:{" "}
                <span className="text-indigo-700">Varianta {winner?.toUpperCase() ?? "—"}</span>.
              </>
            ) : remainingMs > 0 ? (
              <>Automatická finalizace: {finalizeDate.toLocaleString("cs-CZ")}</>
            ) : (
              <>Termín finalizace uplynul — čeká na cron worker nebo manuální spuštění.</>
            )}
          </p>
        </div>
        {!ab.finalizedAt ? (
          <button
            type="button"
            onClick={onFinalize}
            disabled={!canFinalize || isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? "Finalizuji…" : "Finalizovat teď"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <AbVariantCard
          label="Varianta A"
          subject={ab.variantA.subject}
          stats={ab.variantA}
          isWinner={winner === "a" || (!winner && aBetter && ab.variantA.sentCount > 0)}
        />
        <AbVariantCard
          label="Varianta B"
          subject={ab.variantB.subject}
          stats={ab.variantB}
          isWinner={winner === "b" || (!winner && !aBetter && ab.variantB.sentCount > 0)}
        />
      </div>

      <div className="mt-4 rounded-xl bg-white/70 p-4">
        <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
          Open rate (porovnání)
        </p>
        <div className="space-y-2">
          <AbBar label="A" rate={ab.variantA.openRate} max={maxOpenRate} color="bg-sky-500" />
          <AbBar label="B" rate={ab.variantB.openRate} max={maxOpenRate} color="bg-violet-500" />
        </div>
      </div>

      {ab.holdoutPendingCount > 0 && !ab.finalizedAt ? (
        <p className="mt-3 text-[11px] font-bold text-[color:var(--wp-text-tertiary)]">
          Holdout publika: {ab.holdoutPendingCount} příjemců čeká na odeslání vítězné varianty.
        </p>
      ) : null}
    </div>
  );
}

function AbVariantCard({
  label,
  subject,
  stats,
  isWinner,
}: {
  label: string;
  subject: string;
  stats: { sentCount: number; openCount: number; clickCount: number; openRate: number; clickRate: number };
  isWinner: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        isWinner
          ? "border-emerald-300 bg-emerald-50/60"
          : "border-[color:var(--wp-surface-card-border)] bg-white"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
          {label}
        </p>
        {isWinner ? (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
            Vítěz
          </span>
        ) : null}
      </div>
      <p className="text-sm font-bold text-[color:var(--wp-text)]">{subject}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
            Odesláno
          </p>
          <p className="text-lg font-black text-[color:var(--wp-text)]">{stats.sentCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
            Open
          </p>
          <p className="text-lg font-black text-sky-700">
            {(stats.openRate * 100).toFixed(1)} %
          </p>
          <p className="text-[10px] text-[color:var(--wp-text-tertiary)]">
            {stats.openCount} unik.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
            Click
          </p>
          <p className="text-lg font-black text-violet-700">
            {(stats.clickRate * 100).toFixed(1)} %
          </p>
          <p className="text-[10px] text-[color:var(--wp-text-tertiary)]">
            {stats.clickCount} unik.
          </p>
        </div>
      </div>
    </div>
  );
}

function AbBar({
  label,
  rate,
  max,
  color,
}: {
  label: string;
  rate: number;
  max: number;
  color: string;
}) {
  const width = max > 0 ? Math.min(100, (rate / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-4 text-center text-xs font-black text-[color:var(--wp-text-secondary)]">
        {label}
      </span>
      <div className="flex-1 overflow-hidden rounded-full bg-[color:var(--wp-main-scroll-bg)]">
        <div
          className={`h-4 ${color} transition-all`}
          style={{ width: `${width.toFixed(1)}%` }}
        />
      </div>
      <span className="w-16 text-right text-xs font-black text-[color:var(--wp-text)]">
        {(rate * 100).toFixed(1)} %
      </span>
    </div>
  );
}
