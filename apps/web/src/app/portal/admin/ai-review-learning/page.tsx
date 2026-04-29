import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/require-auth";
import { deriveAdminScope, canAccessSecurityConsole } from "@/lib/admin/admin-permissions";
import { buildAiReviewLearningScorecard, listAiReviewLearningDebug, scoreAiReviewEvalCase } from "@/lib/ai/ai-review-learning";

export const dynamic = "force-dynamic";

export default async function AiReviewLearningAdminPage() {
  const auth = await requireAuth();
  const scope = deriveAdminScope(auth.roleName);
  if (!canAccessSecurityConsole(scope)) redirect("/portal/today");

  const debug = await listAiReviewLearningDebug({ tenantId: auth.tenantId, limit: 100 });
  const accepted = debug.events.filter((event) => event.acceptedOnApproval).length;
  const topFields = topBy(debug.events, (event) => event.fieldPath);
  const topProducts = topProductCorrections(debug.events);
  const scores = debug.evalCases.map((row) => scoreAiReviewEvalCase({
    expectedOutput: row.expectedOutputJson,
    actualOutput: row.expectedOutputJson,
    criticalFields: Array.isArray(row.criticalFields) ? row.criticalFields.map(String) : [],
  }));
  const scorecard = buildAiReviewLearningScorecard(scores);
  const lastEvalRun = debug.evalCases[0]?.updatedAt ?? debug.evalCases[0]?.createdAt ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
          Internal AI Review
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">AI Review Learning</h1>
        <p className="mt-3 max-w-3xl text-sm text-[color:var(--wp-text-secondary)]">
          Auditní pohled na ruční opravy, schválené patterny a eval cases. Výstupy jsou
          interní podklady pro poradce, ne doporučení klientovi.
        </p>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Correction events" value={debug.events.length} />
        <Metric label="Accepted" value={accepted} />
        <Metric label="Active patterns" value={debug.patterns.filter((p) => p.enabled).length} />
        <Metric label="Eval cases" value={debug.evalCases.length} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Recent correction events">
          {debug.events.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="text-[color:var(--wp-text-secondary)]">
                  <tr>
                    <Th>Datum</Th>
                    <Th>Instituce</Th>
                    <Th>Produkt</Th>
                    <Th>Field path</Th>
                    <Th>Typ</Th>
                    <Th>Stav</Th>
                    <Th>Created by</Th>
                    <Th>Review</Th>
                  </tr>
                </thead>
                <tbody>
                  {debug.events.slice(0, 25).map((event) => (
                    <tr key={event.id} className="border-t border-[color:var(--wp-surface-card-border)]">
                      <Td>{formatDate(event.createdAt)}</Td>
                      <Td>{safeText(event.institutionName)}</Td>
                      <Td>{safeText(event.productName)}</Td>
                      <Td><code>{event.fieldPath}</code></Td>
                      <Td>{event.correctionType}</Td>
                      <Td>{event.rejected ? "rejected" : event.acceptedOnApproval ? "accepted" : "draft"}</Td>
                      <Td><code>{maskId(String(event.createdBy))}</code></Td>
                      <Td>
                        {event.reviewId ? (
                          <Link className="font-semibold text-indigo-700 hover:underline" href={`/portal/contracts/review/${event.reviewId}`}>
                            open
                          </Link>
                        ) : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Top corrected fields">
          {topFields.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {topFields.map((item) => (
                <li key={item.key} className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-[color:var(--wp-surface-muted)] px-3 py-2 text-sm">
                  <code>{item.key}</code>
                  <span className="text-right">
                    <span className="font-semibold">{item.count}</span>
                    <span className="ml-2 text-xs text-[color:var(--wp-text-secondary)]">{formatDate(item.lastSeen)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top institutions/products by correction count">
          {topProducts.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-[color:var(--wp-text-secondary)]">
                  <tr>
                    <Th>Institution</Th>
                    <Th>Product</Th>
                    <Th>Count</Th>
                    <Th>Critical</Th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((item) => (
                    <tr key={item.key} className="border-t border-[color:var(--wp-surface-card-border)]">
                      <Td>{safeText(item.institution)}</Td>
                      <Td>{safeText(item.product)}</Td>
                      <Td>{item.count}</Td>
                      <Td>{item.criticalCount}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Active learning patterns">
          {debug.patterns.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="text-[color:var(--wp-text-secondary)]">
                  <tr>
                    <Th>Scope</Th>
                    <Th>Context</Th>
                    <Th>Pattern type</Th>
                    <Th>Confidence</Th>
                    <Th>Support</Th>
                    <Th>Enabled</Th>
                    <Th>Last seen</Th>
                  </tr>
                </thead>
                <tbody>
                  {debug.patterns.slice(0, 25).map((pattern) => (
                    <tr key={pattern.id} className="border-t border-[color:var(--wp-surface-card-border)]">
                      <Td>{pattern.scope}</Td>
                      <Td>{[pattern.institutionName, pattern.productName, pattern.documentType].filter(Boolean).join(" / ") || "tenant"}</Td>
                      <Td>{pattern.patternType}</Td>
                      <Td>{formatPct(Number(pattern.confidence))}</Td>
                      <Td>{pattern.supportCount}</Td>
                      <Td>{pattern.enabled ? "yes" : "no"}</Td>
                      <Td>{formatDate(pattern.lastSeenAt ?? pattern.updatedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Eval score">
          {debug.evalCases.length === 0 ? (
            <Empty />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Score label="Last run" value={formatDate(lastEvalRun)} />
              <Score label="Critical score" value={formatPct(scorecard.criticalExactMatch)} />
              <Score label="Premium score" value={formatPct(scorecard.numericToleranceMatch)} />
              <Score label="Publish score" value={formatPct(scorecard.publishDecisionMatch)} />
              <Score label="Schema score" value={formatPct(scorecard.schemaValid)} />
              <Score label="Pass" value={scorecard.pass ? "yes" : "no"} />
            </dl>
          )}
        </Panel>
      </section>
    </main>
  );
}

function topBy<T extends { createdAt: Date | string | null }>(rows: T[], keyFn: (row: T) => string | null): Array<{ key: string; count: number; lastSeen: Date | string | null }> {
  const map = new Map<string, { key: string; count: number; lastSeen: Date | string | null }>();
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    const current = map.get(key) ?? { key, count: 0, lastSeen: row.createdAt };
    current.count += 1;
    current.lastSeen = row.createdAt ?? current.lastSeen;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}

function topProductCorrections(events: Awaited<ReturnType<typeof listAiReviewLearningDebug>>["events"]) {
  const critical = (fieldPath: string) => /participants|insured|premium|contractNumber|institutionName|productName|publish|documentClassification|lifecycle/i.test(fieldPath);
  const map = new Map<string, { key: string; institution: string | null; product: string | null; count: number; criticalCount: number }>();
  for (const event of events) {
    const institution = event.institutionName ?? null;
    const product = event.productName ?? null;
    const key = `${institution ?? "unknown"}|${product ?? "unknown"}`;
    const current = map.get(key) ?? { key, institution, product, count: 0, criticalCount: 0 };
    current.count += 1;
    if (critical(event.fieldPath)) current.criticalCount += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 font-bold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface)] p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-[color:var(--wp-text-secondary)]">Zatím žádná data.</p>;
}

function Score({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-[color:var(--wp-surface-muted)] p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">{label}</dt>
      <dd className="mt-1 font-black">{value}</dd>
    </div>
  );
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)} %`;
}

function safeText(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function maskId(value: string): string {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
