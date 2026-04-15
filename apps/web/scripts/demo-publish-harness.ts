#!/usr/bin/env node
/**
 * Surgical demo publish path harness:
 *   AMUNDI DIP → Jiří Chlumecký → full apply → downstream verification
 *
 * Usage:
 *   pnpm demo:publish-harness
 *   pnpm demo:publish-harness -- --tenant <uuid> --user <uuid> --contact <uuid>
 *
 * Env overrides:
 *   DEMO_TENANT_ID, DEMO_USER_ID, DEMO_CONTACT_ID
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { register } from "tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const repoRoot = path.join(projectRoot, "../..");

register({
  baseUrl: projectRoot,
  paths: {
    "@/*": ["./src/*"],
    db: ["./src/lib/db.ts"],
    "server-only": ["./src/lib/test-shims/server-only.ts"],
  },
});

import { loadEnvLocal } from "./load-env-local";
process.chdir(projectRoot);
loadEnvLocal(projectRoot);

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckResult = { key: string; label: string; ok: boolean; detail: string };

type DemoReport = {
  generatedAt: string;
  inputDocument: string;
  matchedClient: { id: string; name: string } | null;
  pipelineOk: boolean;
  pipelineError: string | null;
  extractedSegment: string | null;
  extractedContractNumber: string | null;
  extractedInstitution: string | null;
  extractedProduct: string | null;
  applyOk: boolean;
  applyError: string | null;
  createdContractId: string | null;
  createdPaymentSetupId: string | null;
  checks: CheckResult[];
  blockingIssues: string[];
};

// ── PDF server (reuse batch-lab pattern) ───────────────────────────────────────

function startPdfServer(pdfAbsPath: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    try {
      if (req.url === "/demo.pdf") {
        const buf = readFileSync(pdfAbsPath);
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": String(buf.length) });
        res.end(buf);
        return;
      }
      res.writeHead(404).end();
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") { reject(new Error("bind failed")); return; }
      resolve({
        url: `http://127.0.0.1:${addr.port}/demo.pdf`,
        close: () => new Promise((res, rej) => server.close((e) => (e ? rej(e) : res()))),
      });
    });
    server.on("error", reject);
  });
}

// ── Text extraction hint ───────────────────────────────────────────────────────

async function extractPdfTextHint(absPath: string): Promise<string | null> {
  try {
    const { installPdfJsNodePolyfills } = await import("@/lib/documents/processing/pdfjs-node-polyfills");
    await installPdfJsNodePolyfills();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: readFileSync(absPath) });
    try {
      const result = await parser.getText({ first: 40 });
      const text = result.text?.trim() ?? "";
      return text.length >= 400 ? text.slice(0, 120_000) : null;
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch {
    return null;
  }
}

// ── Report renderers ───────────────────────────────────────────────────────────

function checkIcon(ok: boolean): string { return ok ? "✅" : "❌"; }

function renderMd(r: DemoReport): string {
  const lines: string[] = [];
  lines.push("# Demo Publish Harness — Report");
  lines.push("");
  lines.push(`- **Generated:** ${r.generatedAt}`);
  lines.push(`- **Input document:** \`${r.inputDocument}\``);
  lines.push(`- **Matched client:** ${r.matchedClient ? `${r.matchedClient.name} (\`${r.matchedClient.id}\`)` : "—"}`);
  lines.push("");
  lines.push("## Pipeline");
  lines.push(`- OK: ${r.pipelineOk ? "ano" : "ne"}`);
  if (r.pipelineError) lines.push(`- Error: ${r.pipelineError}`);
  lines.push(`- Segment: ${r.extractedSegment ?? "—"}`);
  lines.push(`- Contract number: ${r.extractedContractNumber ?? "—"}`);
  lines.push(`- Institution: ${r.extractedInstitution ?? "—"}`);
  lines.push(`- Product: ${r.extractedProduct ?? "—"}`);
  lines.push("");
  lines.push("## Apply");
  lines.push(`- OK: ${r.applyOk ? "ano" : "ne"}`);
  if (r.applyError) lines.push(`- Error: ${r.applyError}`);
  lines.push(`- Created/updated contract ID: ${r.createdContractId ?? "—"}`);
  lines.push(`- Payment setup ID: ${r.createdPaymentSetupId ?? "—"}`);
  lines.push("");
  lines.push("## Downstream Checks");
  lines.push("| # | Check | Result | Detail |");
  lines.push("|---|-------|--------|--------|");
  r.checks.forEach((c, i) => {
    lines.push(`| ${i + 1} | ${c.label} | ${checkIcon(c.ok)} | ${c.detail} |`);
  });
  lines.push("");
  if (r.blockingIssues.length > 0) {
    lines.push("## Blocking Issues");
    r.blockingIssues.forEach((b) => lines.push(`- ${b}`));
  } else {
    lines.push("## Blocking Issues");
    lines.push("None.");
  }
  return lines.join("\n");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHtml(r: DemoReport): string {
  const checkRows = r.checks
    .map(
      (c) =>
        `<tr class="${c.ok ? "pass" : "fail"}"><td>${escHtml(c.label)}</td><td>${c.ok ? "PASS" : "FAIL"}</td><td>${escHtml(c.detail)}</td></tr>`
    )
    .join("\n");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Demo Publish Harness Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
tr.pass td:nth-child(2){color:green;font-weight:bold}tr.fail td:nth-child(2){color:red;font-weight:bold}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.5rem}</style></head><body>
<h1>Demo Publish Harness Report</h1>
<p><strong>Generated:</strong> ${escHtml(r.generatedAt)}</p>
<p><strong>Input:</strong> <code>${escHtml(r.inputDocument)}</code></p>
<p><strong>Client:</strong> ${r.matchedClient ? `${escHtml(r.matchedClient.name)} (<code>${escHtml(r.matchedClient.id)}</code>)` : "—"}</p>
<h2>Pipeline</h2>
<p>OK: ${r.pipelineOk ? "ano" : "ne"} · Segment: ${escHtml(r.extractedSegment ?? "—")} · Contract#: ${escHtml(r.extractedContractNumber ?? "—")}</p>
${r.pipelineError ? `<p style="color:red">${escHtml(r.pipelineError)}</p>` : ""}
<h2>Apply</h2>
<p>OK: ${r.applyOk ? "ano" : "ne"} · Contract ID: <code>${escHtml(r.createdContractId ?? "—")}</code> · Payment setup: <code>${escHtml(r.createdPaymentSetupId ?? "—")}</code></p>
${r.applyError ? `<p style="color:red">${escHtml(r.applyError)}</p>` : ""}
<h2>Downstream Checks</h2>
<table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>
${checkRows}
</table>
${r.blockingIssues.length > 0 ? `<h2>Blocking Issues</h2><ul>${r.blockingIssues.map((b) => `<li>${escHtml(b)}</li>`).join("")}</ul>` : "<h2>Blocking Issues</h2><p>None.</p>"}
</body></html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      tenant: { type: "string" },
      user: { type: "string" },
      contact: { type: "string" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
  });

  const tenantId = values.tenant?.trim() || process.env.DEMO_TENANT_ID?.trim() || "";
  const userId = values.user?.trim() || process.env.DEMO_USER_ID?.trim() || "";
  const contactId = values.contact?.trim() || process.env.DEMO_CONTACT_ID?.trim() || "";

  if (!tenantId || !userId || !contactId) {
    console.error(
      "Missing required IDs. Provide via CLI flags or env vars:\n" +
        "  --tenant / DEMO_TENANT_ID\n" +
        "  --user / DEMO_USER_ID\n" +
        "  --contact / DEMO_CONTACT_ID  (Jiří Chlumecký contact row)\n\n" +
        "Example:\n" +
        '  pnpm demo:publish-harness -- --tenant "..." --user "..." --contact "..."'
    );
    process.exit(1);
  }

  const ts = Date.now();
  const outputDir = values.output?.trim()
    ? path.resolve(values.output.trim())
    : path.resolve(repoRoot, `fixtures/golden-ai-review/eval-outputs/demo-publish-harness-${ts}`);
  mkdirSync(outputDir, { recursive: true });

  const pdfPath = path.resolve(
    repoRoot,
    "fixtures/golden-ai-review/eval-outputs/painful-subset-1776266814/subset-input/AMUNDI DIP.pdf"
  );
  if (!existsSync(pdfPath)) {
    console.error(`AMUNDI DIP.pdf not found at ${pdfPath}`);
    process.exit(1);
  }

  console.info("[harness] Starting demo publish harness…");
  console.info(`[harness] PDF: ${pdfPath}`);
  console.info(`[harness] Tenant: ${tenantId}`);
  console.info(`[harness] User: ${userId}`);
  console.info(`[harness] Contact (Jiří Chlumecký): ${contactId}`);
  console.info(`[harness] Output: ${outputDir}`);

  const report: DemoReport = {
    generatedAt: new Date().toISOString(),
    inputDocument: "AMUNDI DIP.pdf",
    matchedClient: null,
    pipelineOk: false,
    pipelineError: null,
    extractedSegment: null,
    extractedContractNumber: null,
    extractedInstitution: null,
    extractedProduct: null,
    applyOk: false,
    applyError: null,
    createdContractId: null,
    createdPaymentSetupId: null,
    checks: [],
    blockingIssues: [],
  };

  // ── Step 0: Verify contact exists ──────────────────────────────────────────

  const { db } = await import("db");
  const { contacts, contracts, clientPaymentSetups } = await import("db");
  const { eq, and } = await import("db");

  const [contactRow] = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contactRow) {
    console.error(`[harness] Contact ${contactId} not found in tenant ${tenantId}`);
    report.blockingIssues.push(`Contact ${contactId} not found in tenant.`);
    writeReports(outputDir, report);
    process.exit(1);
  }

  const clientName = `${contactRow.firstName ?? ""} ${contactRow.lastName ?? ""}`.trim();
  report.matchedClient = { id: contactId, name: clientName || "(unnamed)" };
  console.info(`[harness] Contact found: ${clientName}`);

  // ── Step 1: AI extraction pipeline ─────────────────────────────────────────

  console.info("[harness] Step 1: Running AI extraction pipeline…");
  const pdfServer = await startPdfServer(pdfPath);
  const textHint = await extractPdfTextHint(pdfPath);

  try {
    const { runContractUnderstandingPipeline } = await import(
      "@/lib/ai/contract-understanding-pipeline"
    );

    const pipelineResult = await runContractUnderstandingPipeline(
      pdfServer.url,
      "application/pdf",
      {
        ruleBasedTextHint: textHint,
        preprocessMeta: {
          preprocessStatus: "demo_harness" as "golden_eval_local",
          preprocessMode: "demo_publish_harness",
          preprocessWarnings: textHint ? [] : ["no_local_pdf_text_hint"],
        },
        sourceFileName: "AMUNDI DIP.pdf",
      }
    );

    if (!pipelineResult.ok) {
      report.pipelineError = pipelineResult.errorMessage ?? "pipeline_failed";
      report.blockingIssues.push(`Pipeline failed: ${report.pipelineError}`);
      console.error(`[harness] Pipeline failed: ${report.pipelineError}`);
      writeReports(outputDir, report);
      process.exit(1);
    }

    report.pipelineOk = true;
    const envelope = pipelineResult.extractedPayload as Record<string, unknown>;
    const ef = (envelope?.extractedFields ?? {}) as Record<string, { value?: unknown }>;
    const dc = (envelope?.documentClassification ?? {}) as Record<string, unknown>;

    const fieldStr = (keys: string[]): string | null => {
      for (const k of keys) {
        const v = ef[k]?.value;
        if (v != null && String(v).trim()) return String(v).trim();
      }
      return null;
    };

    const { segmentFromPrimaryType } = await import("@/lib/ai/canonical-segment-mapping");
    const primaryType = String(dc.primaryType ?? "");
    report.extractedSegment = segmentFromPrimaryType(primaryType as Parameters<typeof segmentFromPrimaryType>[0]);
    report.extractedContractNumber = fieldStr(["contractNumber", "proposalNumber"]);
    report.extractedInstitution = fieldStr(["insurer", "institutionName", "partnerName"]);
    report.extractedProduct = fieldStr(["productName", "tariffName", "fundName", "strategyName"]);

    console.info(`[harness] Pipeline OK. Segment=${report.extractedSegment}, Contract#=${report.extractedContractNumber}`);

    // ── Step 2: Build draft actions ──────────────────────────────────────────

    console.info("[harness] Step 2: Building draft actions…");
    const { applyCanonicalNormalizationToEnvelope } = await import(
      "@/lib/ai/life-insurance-canonical-normalizer"
    );
    const { segmentDocumentPacket } = await import("@/lib/ai/document-packet-segmentation");
    const { buildAllDraftActions } = await import("@/lib/ai/draft-actions");
    const { evaluateApplyReadiness } = await import("@/lib/ai/quality-gates");

    const seg = segmentDocumentPacket(textHint ?? "", null, "AMUNDI DIP.pdf");
    applyCanonicalNormalizationToEnvelope(
      envelope as Parameters<typeof applyCanonicalNormalizationToEnvelope>[0],
      seg.packetMeta
    );
    (envelope as Record<string, unknown>).packetMeta = seg.packetMeta;

    const draftActions = buildAllDraftActions(
      envelope as Parameters<typeof buildAllDraftActions>[0]
    );
    console.info(`[harness] Draft actions: ${draftActions.length} (${draftActions.map((a) => a.type).join(", ")})`);

    // ── Step 3: Construct review row and apply ────────────────────────────────

    console.info("[harness] Step 3: Applying contract review (real DB transaction)…");

    const syntheticReviewId = `demo-harness-${ts}`;
    const reviewRow = {
      id: syntheticReviewId,
      tenantId,
      fileName: "AMUNDI DIP.pdf",
      storagePath: "demo-harness/AMUNDI-DIP.pdf",
      mimeType: "application/pdf",
      sizeBytes: null,
      processingStatus: "extracted" as const,
      processingStage: null,
      errorMessage: null,
      extractedPayload: envelope,
      clientMatchCandidates: [{ clientId: contactId, displayName: clientName, score: 1, reasons: ["demo_harness_bind"] }],
      draftActions,
      confidence: pipelineResult.confidence,
      reasonsForReview: pipelineResult.reasonsForReview,
      reviewStatus: "approved" as const,
      uploadedBy: userId,
      reviewedBy: userId,
      reviewedAt: new Date(),
      rejectReason: null,
      appliedBy: null,
      appliedAt: null,
      matchedClientId: contactId,
      createNewClientConfirmed: null,
      applyResultPayload: null,
      reviewDecisionReason: pipelineResult.reviewDecisionReason ?? null,
      inputMode: pipelineResult.inputMode,
      extractionMode: pipelineResult.extractionMode,
      detectedDocumentType: primaryType,
      detectedDocumentSubtype: null,
      lifecycleStatus: String(dc.lifecycleStatus ?? ""),
      documentIntent: String(dc.documentIntent ?? ""),
      extractionTrace: pipelineResult.extractionTrace ?? null,
      validationWarnings: null,
      fieldConfidenceMap: null,
      classificationReasons: null,
      dataCompleteness: null,
      sensitivityProfile: null,
      sectionSensitivity: null,
      relationshipInference: null,
      originalExtractedPayload: null,
      correctedPayload: null,
      correctedFields: null,
      correctedDocumentType: null,
      correctedLifecycleStatus: null,
      fieldMarkedNotApplicable: null,
      linkedClientOverride: null,
      linkedDealOverride: null,
      confidenceOverride: null,
      ignoredWarnings: null,
      correctionReason: null,
      correctedBy: null,
      correctedAt: null,
      matchVerdict: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { applyContractReview } = await import("@/lib/ai/apply-contract-review");

    const applyResult = await applyContractReview({
      reviewId: syntheticReviewId,
      tenantId,
      userId,
      row: reviewRow as Parameters<typeof applyContractReview>[0]["row"],
    });

    if (!applyResult.ok) {
      report.applyError = applyResult.error;
      report.blockingIssues.push(`Apply failed: ${applyResult.error}`);
      console.error(`[harness] Apply failed: ${applyResult.error}`);
    } else {
      report.applyOk = true;
      report.createdContractId = applyResult.payload.createdContractId ?? null;
      report.createdPaymentSetupId = applyResult.payload.createdPaymentSetupId ?? null;
      console.info(`[harness] Apply OK. Contract=${report.createdContractId}, PaymentSetup=${report.createdPaymentSetupId}`);
    }

    // ── Step 4: Downstream checks ────────────────────────────────────────────

    console.info("[harness] Step 4: Running downstream checks…");

    // Check 1: Contract/product artifact exists
    const contractExists = report.createdContractId != null;
    report.checks.push({
      key: "contract_artifact",
      label: "Contract/product artifact created",
      ok: contractExists,
      detail: contractExists
        ? `ID: ${report.createdContractId}`
        : report.applyError ?? "No contract created",
    });

    // Check 2: Product readable in products read-side (advisor query)
    let advisorProductVisible = false;
    let advisorProductDetail = "Not checked (no contract)";
    if (report.createdContractId) {
      const [row] = await db
        .select({
          id: contracts.id,
          segment: contracts.segment,
          partnerName: contracts.partnerName,
          productName: contracts.productName,
          contractNumber: contracts.contractNumber,
          visibleToClient: contracts.visibleToClient,
          portfolioStatus: contracts.portfolioStatus,
        })
        .from(contracts)
        .where(eq(contracts.id, report.createdContractId))
        .limit(1);
      if (row) {
        advisorProductVisible = true;
        advisorProductDetail = `${row.segment} · ${row.partnerName ?? "—"} · ${row.productName ?? "—"} · #${row.contractNumber ?? "—"} · visible=${row.visibleToClient} · status=${row.portfolioStatus}`;
      } else {
        advisorProductDetail = "Contract row not found in DB";
      }
    }
    report.checks.push({
      key: "advisor_product_surface",
      label: "Advisor product card / products tab readable",
      ok: advisorProductVisible,
      detail: advisorProductDetail,
    });

    // Check 3: Client portfolio (visibleToClient + active/ended)
    let portfolioVisible = false;
    let portfolioDetail = "Not checked";
    if (report.createdContractId) {
      const { inArray, isNull } = await import("db");
      const portfolioRows = await db
        .select({ id: contracts.id })
        .from(contracts)
        .where(
          and(
            eq(contracts.tenantId, tenantId),
            eq(contracts.contactId, contactId),
            eq(contracts.visibleToClient, true),
            inArray(contracts.portfolioStatus, ["active", "ended"]),
            isNull(contracts.archivedAt)
          )
        );
      const found = portfolioRows.some((r) => r.id === report.createdContractId);
      portfolioVisible = found;
      portfolioDetail = found
        ? `Contract ${report.createdContractId} visible in portfolio (${portfolioRows.length} total)`
        : `Contract NOT in portfolio query (${portfolioRows.length} rows returned)`;
    }
    report.checks.push({
      key: "client_portfolio",
      label: "Client portal / Portfolio readable",
      ok: portfolioVisible,
      detail: portfolioDetail,
    });

    // Check 4: Payment setup / payments surface
    let paymentVisible = false;
    let paymentDetail = "No payment setup created";
    const paymentRows = await db
      .select({
        id: clientPaymentSetups.id,
        paymentType: clientPaymentSetups.paymentType,
        contractNumber: clientPaymentSetups.contractNumber,
        accountNumber: clientPaymentSetups.accountNumber,
        amount: clientPaymentSetups.amount,
        status: clientPaymentSetups.status,
        needsHumanReview: clientPaymentSetups.needsHumanReview,
      })
      .from(clientPaymentSetups)
      .where(
        and(
          eq(clientPaymentSetups.tenantId, tenantId),
          eq(clientPaymentSetups.contactId, contactId)
        )
      );
    if (paymentRows.length > 0) {
      const active = paymentRows.filter((p) => p.status === "active" && !p.needsHumanReview);
      paymentVisible = active.length > 0;
      paymentDetail = `${paymentRows.length} total, ${active.length} active/auto-approved. ${active.map((p) => `${p.paymentType}#${p.contractNumber ?? "—"}=${p.amount ?? "—"}`).join("; ") || "—"}`;
    } else {
      paymentDetail = "No payment setup rows for this contact (document may not contain payment data)";
    }
    report.checks.push({
      key: "client_payments",
      label: "Client portal / Platby a příkazy",
      ok: paymentVisible || paymentRows.length === 0,
      detail: paymentDetail,
    });

    // Check 5: Coverage / payment setup propagation
    const coveragePropagated = contractExists && (paymentRows.length > 0 || report.createdPaymentSetupId != null);
    report.checks.push({
      key: "coverage_propagated",
      label: "Coverage / payment setup propagated",
      ok: coveragePropagated || (!report.createdPaymentSetupId && paymentRows.length === 0),
      detail: coveragePropagated
        ? `Payment setup: ${report.createdPaymentSetupId ?? "N/A"}, ${paymentRows.length} row(s)`
        : "No payment data in document (acceptable for DIP without explicit payment instructions)",
    });

    // Check 6: FV (fund valuation) readiness
    let fvDetail = "unavailable";
    if (report.createdContractId) {
      const [cRow] = await db
        .select({ portfolioAttributes: contracts.portfolioAttributes })
        .from(contracts)
        .where(eq(contracts.id, report.createdContractId))
        .limit(1);
      const attrs = (cRow?.portfolioAttributes ?? {}) as Record<string, unknown>;
      if (attrs.resolvedFundId) fvDetail = `visible (fundId=${attrs.resolvedFundId})`;
      else if (attrs.resolvedFundCategory) fvDetail = `partial (category=${attrs.resolvedFundCategory})`;
      else if (attrs.investmentData || attrs.funds) fvDetail = "partial (investment data present, no fund match)";
    }
    report.checks.push({
      key: "fv_readiness",
      label: "FV (fund valuation) visibility",
      ok: fvDetail !== "unavailable",
      detail: fvDetail,
    });

    // Check 7: No ghost success
    const ghostCheck = report.applyOk && !contractExists;
    report.checks.push({
      key: "no_ghost_success",
      label: "No ghost success without downstream data",
      ok: !ghostCheck,
      detail: ghostCheck ? "Apply reported ok:true but no contract was created" : "Consistent",
    });

  } finally {
    await pdfServer.close();
  }

  // ── Write reports ──────────────────────────────────────────────────────────

  writeReports(outputDir, report);
  console.info(`[harness] Done. Reports written to ${outputDir}`);
  process.exit(report.blockingIssues.length > 0 ? 1 : 0);
}

function writeReports(outputDir: string, report: DemoReport) {
  writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(path.join(outputDir, "report.md"), renderMd(report), "utf8");
  writeFileSync(path.join(outputDir, "report.html"), renderHtml(report), "utf8");
  console.info(`[harness] Reports: ${outputDir}/report.{json,md,html}`);
}

main().catch((e) => {
  console.error("[harness] Fatal:", e);
  process.exit(1);
});
