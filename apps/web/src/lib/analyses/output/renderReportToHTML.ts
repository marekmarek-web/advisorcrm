/**
 * Render normalized report payload to a single HTML string for print/PDF.
 */

import type { NormalizedReportPayload } from "./types";
import { PDF_STYLES } from "@/lib/analyses/financial/report";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReportToHTML(payload: NormalizedReportPayload): string {
  const { meta, subjectContext, personalSections, businessSections, sharedSections } = payload;
  const { exportMode, title, generatedAt } = meta;
  const dateStr = new Date(generatedAt).toLocaleDateString("cs-CZ");

  if (exportMode === "personal_only" && personalSections?.rawBlocks?.length) {
    return personalSections.rawBlocks[0] as string;
  }

  if (exportMode === "business_only" && businessSections?.rawBlocks?.length) {
    const inner = businessSections.rawBlocks.join("\n");
    return `<style>${PDF_STYLES}</style>\n<div class="pdf">\n${inner}\n</div>`;
  }

  if (exportMode === "combined") {
    const parts: string[] = [];
    parts.push(`
<section class="pdf-page pdf-title-page">
  <div style="text-align: center;">
    <h1 class="h1" style="font-size: 40px; margin-bottom: 10px;">FINANČNÍ PLÁN</h1>
    <p style="font-size: 18px; color: #64748b; margin-bottom: 50px;">${escapeHtml(title ?? "Kombinovaný výstup")}</p>
    <div style="display: inline-block; text-align: left; background: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; min-width: 300px;">
      <p style="margin-bottom: 10px; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: bold;">Subjekt</p>
      <h2 style="font-size: 24px; color: #0f172a; margin: 0 0 10px 0;">${escapeHtml(subjectContext.subjectLabel)}</h2>
      ${subjectContext.linksDescription ? `<p style="font-size: 14px; color: #475569; margin: 0 0 20px 0;">${escapeHtml(subjectContext.linksDescription)}</p>` : ""}
      <p style="margin-bottom: 10px; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: bold;">Datum vyhotovení</p>
      <p style="font-size: 16px; color: #0f172a; margin: 0;">${dateStr}</p>
    </div>
  </div>
</section>
`);
    if (personalSections?.rawBlocks?.length) {
      parts.push(personalSections.rawBlocks.join("\n"));
    }
    if (sharedSections?.links?.summary) {
      parts.push(`
<section class="pdf-page">
  <div class="pdf-section">
    <div class="h2">Vazby</div>
    <p>${escapeHtml(sharedSections.links.summary)}</p>
  </div>
</section>
`);
    }
    if (businessSections?.rawBlocks?.length) {
      parts.push(businessSections.rawBlocks.join("\n"));
    }
    return `<style>${PDF_STYLES}</style>\n<div class="pdf">\n${parts.join("\n")}\n</div>`;
  }

  return `<style>${PDF_STYLES}</style>\n<div class="pdf"><section class="pdf-page"><p>Žádný obsah.</p></section></div>`;
}
