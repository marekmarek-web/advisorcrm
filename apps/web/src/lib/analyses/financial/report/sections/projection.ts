import type { SectionCtx } from '../types';
import { nextSection, fmtBigCzk, renderProjectionSVG } from '../helpers';
import type { InvestmentEntry } from '../../types';

function blendedAnnualRate(investments: InvestmentEntry[], maxHorizon: number): number {
  let num = 0;
  let den = 0;
  for (const inv of investments) {
    const rate = inv.annualRate ?? 0.08;
    const years = Math.min(inv.years ?? maxHorizon, maxHorizon);
    if (inv.type === 'lump') {
      num += rate * inv.amount;
      den += inv.amount;
    } else {
      const w = inv.amount * 12 * years;
      num += rate * w;
      den += w;
    }
  }
  return den > 0 ? num / den : 0.08;
}

const PROJECTION_INTERACTIVE_JS = `
(function(){
  function q(id){return document.getElementById(id);}
  var el=q('fa-proj-init');
  var canvas=q('fa-proj-canvas');
  if(!el||!canvas)return;
  var init;
  try{init=JSON.parse(el.textContent||'{}');}catch(e){return;}
  var monthlyEl=q('fa-proj-monthly');
  var yearsEl=q('fa-proj-years');
  var rateEl=q('fa-proj-rate');
  var invOut=q('fa-proj-inv');
  var fvOut=q('fa-proj-fv');
  var gainOut=q('fa-proj-gain');
  var lblM=q('fa-proj-monthly-lbl');
  var lblY=q('fa-proj-years-lbl');
  var lblR=q('fa-proj-rate-lbl');
  var horEl=q('fa-proj-chart-horizon');
  function fmt(n){
    if(Math.abs(n)>=1e6)return (n/1e6).toLocaleString('cs-CZ',{maximumFractionDigits:1})+' mil. Kč';
    return Math.round(n).toLocaleString('cs-CZ')+' Kč';
  }
  function fvAt(monthly,lump,yr,rate){
    var months=Math.round(yr*12);
    var fv=0;
    if(monthly>0&&rate>0){var rm=rate/12;fv+=monthly*((Math.pow(1+rm,months)-1)/rm);}
    if(lump>0&&yr>0)fv+=lump*Math.pow(1+rate,yr);
    return fv;
  }
  function draw(monthly,lump,years,rate,totalFV){
    var ctx=canvas.getContext('2d');
    if(!ctx)return;
    var w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    var milestones=7;
    var stepYears=Math.max(1,Math.round(years/(milestones-1)));
    var pts=[];
    var maxV=0;
    for(var i=0;i<milestones;i++){
      var yr=Math.min(i*stepYears,years);
      var v=fvAt(monthly,lump,yr,rate);
      if(i===milestones-1)v=totalFV;
      pts.push({x:i/(milestones-1),v:v});
      if(v>maxV)maxV=v;
    }
    if(maxV<1)maxV=1;
    var padL=48,padR=12,padT=12,padB=36;
    var cw=w-padL-padR,ch=h-padT-padB;
    ctx.strokeStyle='#e5e7eb';
    for(var g=0;g<=4;g++){
      var gy=padT+(g/4)*ch;
      ctx.beginPath();ctx.moveTo(padL,gy);ctx.lineTo(w-padR,gy);ctx.stroke();
    }
    var xs=[],ys=[];
    pts.forEach(function(p){
      xs.push(padL+p.x*cw);
      ys.push(padT+ch-(p.v/maxV)*ch);
    });
    ctx.beginPath();
    ctx.moveTo(xs[0],ys[0]);
    for(var i=1;i<xs.length;i++)ctx.lineTo(xs[i],ys[i]);
    ctx.strokeStyle='#16a34a';
    ctx.lineWidth=2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xs[0],padT+ch);
    xs.forEach(function(x,i){ctx.lineTo(x,ys[i]);});
    ctx.lineTo(xs[xs.length-1],padT+ch);
    ctx.closePath();
    ctx.fillStyle='rgba(22,163,74,0.08)';
    ctx.fill();
  }
  function recalc(){
    var monthly=parseFloat(monthlyEl&&monthlyEl.value)||0;
    var years=parseInt(yearsEl&&yearsEl.value,10)||init.maxHorizon;
    var rate=(parseFloat(rateEl&&rateEl.value)||init.ratePct)/100;
    var lump=init.lumpTotal;
    var months=years*12;
    var fv=0;
    if(monthly>0&&rate>0){var rm=rate/12;fv+=monthly*((Math.pow(1+rm,months)-1)/rm);}
    if(lump>0)fv+=lump*Math.pow(1+rate,years);
    var invested=monthly*years*12+lump;
    var gain=fv-invested;
    if(invOut)invOut.textContent=fmt(invested);
    if(fvOut)fvOut.textContent=fmt(fv);
    if(gainOut)gainOut.textContent=fmt(gain);
    if(lblM)lblM.textContent=monthly.toLocaleString('cs-CZ')+' Kč/měs.';
    if(lblY)lblY.textContent=years+' let';
    if(lblR)lblR.textContent=(rate*100).toFixed(1).replace('.',',')+' % p.a.';
    draw(monthly,lump,years,rate,fv);
  }
  if(monthlyEl){monthlyEl.min=0;monthlyEl.max=Math.max(50000,init.monthlyTotal*2||5000);monthlyEl.step=100;monthlyEl.value=String(init.monthlyTotal);}
  if(yearsEl){yearsEl.min=5;yearsEl.max=40;yearsEl.step=1;yearsEl.value=String(init.maxHorizon);}
  if(rateEl){rateEl.min=3;rateEl.max=15;rateEl.step=0.5;rateEl.value=String(init.ratePct);}
  ['input','change'].forEach(function(ev){
    if(monthlyEl)monthlyEl.addEventListener(ev,recalc);
    if(yearsEl)yearsEl.addEventListener(ev,recalc);
    if(rateEl)rateEl.addEventListener(ev,recalc);
  });
  recalc();
})();
`;

export function renderProjection(ctx: SectionCtx): string {
  const { data, theme } = ctx;
  const num = nextSection(ctx.sectionCounter);

  const investments = (data.investments ?? []).filter(
    (inv: InvestmentEntry) => inv.amount > 0 && inv.productKey !== 'algoimperial',
  );

  let totalFV = 0;
  let maxHorizon = 0;
  let monthlyTotal = 0;
  let lumpTotal = 0;

  investments.forEach((inv: InvestmentEntry) => {
    const rate = inv.annualRate ?? 0.08;
    const years = inv.years ?? 20;
    maxHorizon = Math.max(maxHorizon, years);
    const months = years * 12;
    if (inv.type === 'monthly' || inv.type === 'pension') {
      const r = rate / 12;
      totalFV += inv.amount * ((Math.pow(1 + r, months) - 1) / r);
      monthlyTotal += inv.amount;
    } else {
      totalFV += inv.amount * Math.pow(1 + rate, years);
      lumpTotal += inv.amount;
    }
  });

  const totalInvested = monthlyTotal * maxHorizon * 12 + lumpTotal;
  const gain = totalFV - totalInvested;
  const ratePct = blendedAnnualRate(investments, maxHorizon) * 100;

  const chartSvg = renderProjectionSVG(totalFV, maxHorizon, monthlyTotal, theme);

  const initJson = JSON.stringify({
    monthlyTotal,
    lumpTotal,
    maxHorizon,
    ratePct: Math.round(ratePct * 10) / 10,
    totalFV,
    totalInvested,
    gain,
  });

  return `<section class="page" id="projekce">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Projekce</div>
      <div class="sec-title">Růstová projekce</div>
      <div class="sec-desc">Odhad budoucí hodnoty investic na základě průměrného ročního zhodnocení a pravidelných vkladů. Níže můžete parametry upravit (pouze v elektronické verzi).</div>
    </div>

    <div class="kpi-row kpi-row-3" style="margin-bottom:var(--s8,32px)">
      <div class="kpi-cell"><div class="kpi-label">Celkem investováno</div><div class="kpi-value" id="fa-proj-inv">${fmtBigCzk(totalInvested)}</div></div>
      <div class="kpi-cell green-cell"><div class="kpi-label">Budoucí hodnota (FV)</div><div class="kpi-value" id="fa-proj-fv">${fmtBigCzk(totalFV)}</div></div>
      <div class="kpi-cell gold-cell"><div class="kpi-label">Čistý výnos</div><div class="kpi-value" id="fa-proj-gain">${fmtBigCzk(gain)}</div></div>
    </div>

    <div class="fa-interactive-only fa-proj-controls">
      <div class="fa-proj-control-row">
        <span class="fa-proj-control-lbl">Měsíční vklady</span>
        <input type="range" id="fa-proj-monthly" class="fa-proj-range" aria-valuemin="0" />
        <span class="fa-proj-control-val" id="fa-proj-monthly-lbl"></span>
      </div>
      <div class="fa-proj-control-row">
        <span class="fa-proj-control-lbl">Horizont</span>
        <input type="range" id="fa-proj-years" class="fa-proj-range" aria-valuemin="5" aria-valuemax="40" />
        <span class="fa-proj-control-val" id="fa-proj-years-lbl"></span>
      </div>
      <div class="fa-proj-control-row">
        <span class="fa-proj-control-lbl">Předpokládaný výnos</span>
        <input type="range" id="fa-proj-rate" class="fa-proj-range" aria-valuemin="3" aria-valuemax="15" />
        <span class="fa-proj-control-val" id="fa-proj-rate-lbl"></span>
      </div>
    </div>

    <div class="chart-wrap">
      <div class="chart-title"><span>Projekce hodnoty portfolia</span><span class="chart-title-right" id="fa-proj-chart-horizon">${maxHorizon} let</span></div>
      <div class="fa-proj-chart-print">${chartSvg}</div>
      <div class="fa-interactive-only fa-proj-canvas-wrap"><canvas id="fa-proj-canvas" width="820" height="220" aria-hidden="true"></canvas></div>
    </div>
    <script type="application/json" id="fa-proj-init">${initJson}</script>

    <div class="callout info" style="margin-top:var(--s4,16px)">
      <span class="callout-icon">ⓘ</span>
      <div><strong>Upozornění</strong>
      Projekce vychází z předpokládaného průměrného ročního výnosu a nezohledňuje inflaci, daně ani poplatky. Skutečné výnosy se mohou lišit. Minulá výkonnost není zárukou budoucích výnosů. Investice nesou riziko ztráty hodnoty.</div>
    </div>
  </div>
</section>
<script>${PROJECTION_INTERACTIVE_JS}</script>`;
}
