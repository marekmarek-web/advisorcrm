import type { FinancialAnalysisData } from '../types';
import { financialAnalysisReportTitle } from '../formatters';
import type { ReportTheme, BuildPremiumReportOptions, SectionCtx } from './types';
import { recomputeInvestmentsFv } from '../charts';
import { esc } from './helpers';
import { ELEGANT_CSS, ELEGANT_FONTS } from './themes/elegant';
import { MODERN_CSS, MODERN_FONTS } from './themes/modern';
import { renderSidebar } from './sections/sidebar';
import { renderHero, renderCompanyHero } from './sections/hero';
import { renderBilance } from './sections/bilance';
import { renderGoals } from './sections/goals';
import { renderPortfolio } from './sections/portfolio';
import { renderInvestmentOverview } from './sections/investment-overview';
import { renderProductDetails } from './sections/product-detail';
import { renderProjection } from './sections/projection';
import { renderInvestmentBacktest } from './sections/investment-backtest';
import { renderInsurance } from './sections/insurance';
import { renderPrintAdvisorChrome, buildBacktestPresetsForHtml, computeReportMonthlyDeposit } from './print-and-interactive';
import { renderCompanySnapshot } from './sections/company-snapshot';
import { renderCompanyInsurance } from './sections/company-insurance';
import { renderCompanyPortfolio } from './sections/company-portfolio';
import { renderDirectorInsurance } from './sections/director-insurance';
import { renderSignatures } from './sections/signatures';

function getThemeCSS(theme: ReportTheme): string {
  return theme === 'elegant' ? ELEGANT_CSS : MODERN_CSS;
}

function getThemeFonts(theme: ReportTheme): string {
  return theme === 'elegant' ? ELEGANT_FONTS : MODERN_FONTS;
}

const SIDEBAR_JS = `<script>
(function(){
  var nav=document.getElementById('sb-nav');
  var fill=document.getElementById('progress-fill');
  var pct=document.getElementById('progress-pct');
  if(!nav)return;
  var pages=document.querySelectorAll('.page[id]');
  var links=nav.querySelectorAll('.sb-nav-item');
  function update(){
    var scrollTop=window.scrollY||document.documentElement.scrollTop;
    var docH=document.documentElement.scrollHeight-window.innerHeight;
    var p=docH>0?Math.round((scrollTop/docH)*100):0;
    if(fill)fill.style.width=p+'%';
    if(pct)pct.textContent=p+' %';
    var active='';
    pages.forEach(function(s){if(s.getBoundingClientRect().top<=120)active=s.id;});
    links.forEach(function(l){l.classList.toggle('active',l.getAttribute('data-section')===active);});
  }
  window.addEventListener('scroll',update,{passive:true});
  update();
})();
<\/script>`;

export function buildPremiumReportHTML(
  data: FinancialAnalysisData,
  options?: BuildPremiumReportOptions,
): string {
  const theme: ReportTheme = options?.theme ?? 'elegant';
  const branding = options?.branding ?? {};
  const includeCompany = options?.includeCompany ?? data.includeCompany ?? false;
  const sectionCounter = { n: 1 };

  const investments = recomputeInvestmentsFv(
    data.investments ?? [],
    data.strategy?.conservativeMode ?? false,
  );
  const dataForReport: FinancialAnalysisData = { ...data, investments };

  const ctx: SectionCtx = {
    data: dataForReport,
    theme,
    branding,
    sectionCounter,
    canonicalInvestmentOverview: options?.canonicalInvestmentOverview,
  };

  const sections: string[] = [];

  sections.push(renderHero(ctx));
  sections.push(renderBilance(ctx));
  sections.push(renderGoals(ctx));
  sections.push(renderPortfolio(ctx));
  sections.push(renderInvestmentOverview(ctx));
  sections.push(renderProductDetails(ctx));
  const monthlyForBacktest = computeReportMonthlyDeposit(data);
  const backtestJson = buildBacktestPresetsForHtml(monthlyForBacktest);
  sections.push(renderInvestmentBacktest(ctx, backtestJson, monthlyForBacktest));
  sections.push(renderProjection(ctx));
  sections.push(renderInsurance(ctx));

  if (includeCompany) {
    sections.push(renderCompanyHero(ctx));
    sections.push(renderCompanySnapshot(ctx));
    sections.push(renderCompanyInsurance(ctx));
    sections.push(renderCompanyPortfolio(ctx));
    sections.push(renderDirectorInsurance(ctx));
  }

  sections.push(renderSignatures(ctx));

  const sidebar = renderSidebar(ctx);
  const printChrome = renderPrintAdvisorChrome(branding);
  const themeCSS = getThemeCSS(theme);
  const themeFonts = getThemeFonts(theme);

  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(financialAnalysisReportTitle(data.client?.name ?? 'Klient'))}</title>
  ${themeFonts}
  <style>${themeCSS}</style>
</head>
<body>
  ${printChrome}
  ${sidebar}
  <main class="main">
    ${sections.join('\n')}
  </main>
  ${SIDEBAR_JS}
</body>
</html>`;
}

export type { ReportTheme, BuildPremiumReportOptions };
