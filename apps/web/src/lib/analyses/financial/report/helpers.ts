import { formatCzk, formatCurrencyMonthly, formatCurrencyDaily, formatPercent } from '../formatters';
import type { InvestmentEntry } from '../types';
import { FUND_DETAILS } from '../constants';

export function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtCzk(n: number): string { return formatCzk(n); }
export function fmtMonthly(n: number): string { return formatCurrencyMonthly(n); }
export function fmtDaily(n: number): string { return formatCurrencyDaily(n); }
export function fmtPct(n: number, d = 1): string { return formatPercent(n, d); }

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('cs-CZ');
}

export function fmtBigCzk(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
  }
  return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
}

export function nextSection(counter: { n: number }): string {
  const padded = String(counter.n).padStart(2, '0');
  counter.n++;
  return padded;
}

export function investmentLabel(inv: InvestmentEntry): string {
  if (inv.type === 'lump') return 'Jednorázová';
  if (inv.type === 'pension') return 'Penzijní';
  return 'Pravidelná'; // monthly
}

export function investmentPillClass(inv: InvestmentEntry): string {
  if (inv.type === 'pension') return 'pill-gold';
  if (inv.type === 'lump') return 'pill-green';
  return 'pill-blue';
}

export function investmentAmountLabel(inv: InvestmentEntry): string {
  if (inv.type === 'lump') return fmtCzk(inv.amount);
  return fmtMonthly(inv.amount);
}

export function getProductDisplayName(productKey: string): string {
  return FUND_DETAILS[productKey]?.name ?? productKey;
}

/** SVG donut chart for portfolio allocation. Returns SVG markup. */
export function renderDonutSVG(
  items: { label: string; weight: number; color: string }[],
  size = 160,
): string {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total === 0) return '';

  let offset = 0;
  const circles = items.map((item) => {
    const pct = item.weight / total;
    const dash = circumference * pct;
    const rotation = (offset / total) * 360;
    offset += item.weight;
    return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${item.color}" stroke-width="18" stroke-dasharray="${dash} ${circumference - dash}" style="transform:rotate(${rotation}deg);transform-origin:50% 50%"/>`;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="flex-shrink:0;transform:rotate(-90deg)"><circle cx="50" cy="50" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="18"/>${circles.join('')}</svg>`;
}

/** SVG projection chart. */
export function renderProjectionSVG(
  totalFV: number,
  years: number,
  monthlyTotal: number,
  theme: 'elegant' | 'modern',
): string {
  const w = 820, h = 220;
  const padL = 52, padR = 10, padT = 10, padB = 42;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const milestones = 7;
  const stepYears = Math.max(1, Math.round(years / (milestones - 1)));

  const points: { x: number; y: number; year: number; val: number }[] = [];
  for (let i = 0; i < milestones; i++) {
    const yr = Math.min(i * stepYears, years);
    const months = yr * 12;
    let fv = 0;
    if (monthlyTotal > 0 && months > 0) {
      const r = 0.09 / 12;
      fv = monthlyTotal * ((Math.pow(1 + r, months) - 1) / r);
    }
    if (i === milestones - 1) fv = totalFV;
    const x = padL + (i / (milestones - 1)) * chartW;
    const y = padT + chartH - (fv / totalFV) * chartH;
    points.push({ x, y, year: yr, val: fv });
  }

  const gridLines = 5;
  let gridSvg = '';
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (i / gridLines) * chartH;
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    const labelVal = totalFV - (i / gridLines) * totalFV;
    const lbl = labelVal === 0 ? '0' : `${Math.round(labelVal / 1_000_000)} mil.`;
    gridSvg += `<text x="${padL - 6}" y="${y + 4}" fill="#8c959f" font-size="9.5" text-anchor="end" font-weight="600">${lbl}</text>`;
  }

  let xLabels = '';
  points.forEach((p, i) => {
    const label = i === 0 ? 'Dnes' : `Rok ${p.year}`;
    xLabels += `<text x="${p.x}" y="${h - 5}" fill="#8c959f" font-size="9.5" text-anchor="middle" font-weight="600">${label}</text>`;
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padT + chartH} L ${points[0].x} ${padT + chartH} Z`;

  const gradId = 'projGrad';
  const lineGradId = 'projLine';
  const isElegant = theme === 'elegant';
  const lineColor1 = isElegant ? '#c9a84c' : '#2563eb';
  const lineColor2 = isElegant ? '#16a34a' : '#16a34a';
  const fillColor = isElegant ? '#0b1929' : '#2563eb';
  const endBg = isElegant ? 'var(--navy-900,#0b1929)' : 'var(--navy,#0f172a)';

  const last = points[points.length - 1];
  const endLabel = fmtNum(totalFV) + ' Kč';
  const lblW = Math.max(120, endLabel.length * 7 + 20);

  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="display:block">
<defs>
  <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${fillColor}" stop-opacity=".1"/><stop offset="100%" stop-color="${fillColor}" stop-opacity="0"/></linearGradient>
  <linearGradient id="${lineGradId}" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="${lineColor1}"/><stop offset="100%" stop-color="${lineColor2}"/></linearGradient>
</defs>
<g>${gridSvg}</g>
<g>${xLabels}</g>
<path d="${areaD}" fill="url(#${gradId})"/>
<path d="${pathD}" fill="none" stroke="url(#${lineGradId})" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="${last.x}" cy="${last.y}" r="5" fill="white" stroke="${lineColor2}" stroke-width="2.5"/>
<rect x="${last.x - lblW}" y="${last.y - 8}" width="${lblW}" height="22" rx="4" fill="${endBg}"/>
<text x="${last.x - lblW / 2}" y="${last.y + 7}" fill="white" font-size="10" font-weight="700" text-anchor="middle">${endLabel}</text>
</svg>`;
}

export function colorForIndex(i: number, theme: 'elegant' | 'modern'): string {
  const elegantColors = ['var(--navy-800,#112238)', 'var(--green-600,#16a34a)', 'var(--gold-500,#c9a84c)', 'var(--red-600,#dc2626)', 'var(--stone-400,#a8a29e)', '#6366f1'];
  const modernColors = ['var(--navy,#0f172a)', 'var(--pos,#16a34a)', 'var(--gold,#d97706)', 'var(--neg,#dc2626)', 'var(--ink-4,#8c959f)', '#6366f1'];
  const colors = theme === 'elegant' ? elegantColors : modernColors;
  return colors[i % colors.length];
}
