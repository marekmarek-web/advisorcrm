import type { CalculatorPdfSection } from "./types";
import { ELEGANT_CSS, ELEGANT_FONTS } from "@/lib/analyses/financial/report/themes/elegant";
import { MODERN_CSS, MODERN_FONTS } from "@/lib/analyses/financial/report/themes/modern";
import { REPORT_BRAND_LOGO_SRC } from "@/lib/analyses/financial/report/branding";
import { renderPrintAdvisorChrome } from "@/lib/analyses/financial/report/print-and-interactive";
import type { ReportBranding, ReportTheme } from "@/lib/analyses/financial/report/types";
import { esc, nextSection } from "@/lib/analyses/financial/report/helpers";

const CALC_EXPORT_CSS = `
body.calc-export-report .main{margin-left:0!important;width:100%}
body.calc-export-report .page.calc-content{min-height:auto}
body.calc-export-report .calc-hero-bottom{display:flex;flex-wrap:wrap;align-items:flex-start;gap:0}
body.calc-export-report .calc-hero-bottom .hero-meta-item{margin-bottom:var(--s4)}
body.calc-export-report .calc-hero-bottom .hero-meta-advisor{margin-left:auto;text-align:right;border-right:none;padding-right:0;margin-right:0}
body.calc-export-report .calc-section-block{margin-bottom:var(--s10)}
body.calc-export-report .calc-section-block:last-of-type{margin-bottom:var(--s6)}
body.calc-export-report .calc-disclaimer{margin-top:var(--s10);padding-top:var(--s6);border-top:1px solid var(--stone-200)}
body.calc-export-report .calc-disclaimer p{margin-bottom:var(--s3)}
body.calc-export-report .calc-disclaimer p:last-child{margin-bottom:0}
`;

function heroDecorativeSVG(): string {
  return `<svg viewBox="0 0 600 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 400C80 340 160 280 240 240C320 200 400 180 480 160C560 140 600 120 600 80" stroke="white" stroke-width="1.5"/>
    <path d="M0 400C100 360 200 300 300 260C400 220 500 200 600 160" stroke="white" stroke-width="0.8" opacity="0.5"/>
    <path d="M0 400C120 380 240 340 360 300C480 260 540 220 600 200" stroke="white" stroke-width="0.5" opacity="0.3"/>
  </svg>`;
}

export interface BuildCalculatorReportHTMLOptions {
  documentTitle: string;
  eyebrow: string;
  subtitle: string;
  sections: CalculatorPdfSection[];
  disclaimerLines: readonly string[];
  theme?: ReportTheme;
  branding?: ReportBranding;
  heroKpis?: readonly { label: string; value: string }[];
}

function themeFonts(theme: ReportTheme): string {
  return theme === "modern" ? MODERN_FONTS : ELEGANT_FONTS;
}

function themeCss(theme: ReportTheme): string {
  return theme === "modern" ? MODERN_CSS : ELEGANT_CSS;
}

/**
 * Premium HTML document for calculator export (same visual language as financial analysis print).
 */
export function buildCalculatorReportHTML(options: BuildCalculatorReportHTMLOptions): string {
  const theme: ReportTheme = options.theme ?? "elegant";
  const branding = options.branding ?? {};
  const advisorName = branding.advisorName?.trim() || "Poradce";
  const planYear = new Date().getFullYear();
  const dateStr = new Date().toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const printChrome = renderPrintAdvisorChrome(branding);
  const sectionCounter = { n: 1 };

  const kpiBlocks = (options.heroKpis ?? []).map(
    (k) => `
      <div class="hero-meta-item">
        <div class="hero-meta-label">${esc(k.label)}</div>
        <div class="hero-meta-val">${esc(k.value)}</div>
      </div>`,
  );

  const sectionsHtml = options.sections
    .map((section) => {
      const num = nextSection(sectionCounter);
      const rows = section.rows
        .map(
          (row) => `
        <tr>
          <td>${esc(row.label)}</td>
          <td class="r bold">${esc(row.value)}</td>
        </tr>`,
        )
        .join("");
      return `
      <div class="calc-section-block">
        <header class="sec-header">
          <div class="sec-number gold">${num}</div>
          <div class="sec-title">${esc(section.title)}</div>
        </header>
        <table class="dt">
          <thead><tr><th>Parametr</th><th class="r">Hodnota</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join("\n");

  const disclaimerHtml = options.disclaimerLines
    .map((line) => `<p class="t-caption">${esc(line)}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(options.documentTitle)}</title>
  ${themeFonts(theme)}
  <style>${themeCss(theme)}</style>
  <style>${CALC_EXPORT_CSS}</style>
</head>
<body class="calc-export-report">
  ${printChrome}
  <main class="main">
    <section class="page hero" id="cover">
      <div class="hero-lines">${heroDecorativeSVG()}</div>
      <div class="page-inner" style="position:relative;z-index:2">
        <div class="hero-top">
          <div class="hero-brand-logo">
            <img src="${REPORT_BRAND_LOGO_SRC}" alt="" class="hero-logo-img" width="220" height="48">
          </div>
          <div class="hero-badge">Kalkulačka ${planYear}</div>
        </div>
        <div class="hero-center">
          <div class="hero-eyebrow"><span class="hero-eyebrow-line"></span>${esc(options.eyebrow)}</div>
          <div class="hero-title"><em>${esc(options.documentTitle)}</em></div>
          <div class="hero-subtitle">${esc(options.subtitle)}</div>
        </div>
        <div class="hero-bottom calc-hero-bottom">
          ${kpiBlocks.join("")}
          <div class="hero-meta-item">
            <div class="hero-meta-label">Datum</div>
            <div class="hero-meta-val">${esc(dateStr)}</div>
          </div>
          <div class="hero-meta-item hero-meta-advisor">
            <div class="hero-meta-label">Poradce</div>
            <div class="hero-meta-val">${esc(advisorName)}</div>
          </div>
        </div>
      </div>
    </section>
    <section class="page calc-content" id="detail">
      <div class="page-bar"></div>
      <div class="page-inner">
        ${sectionsHtml}
        <div class="calc-disclaimer">${disclaimerHtml}</div>
      </div>
    </section>
  </main>
</body>
</html>`;
}
