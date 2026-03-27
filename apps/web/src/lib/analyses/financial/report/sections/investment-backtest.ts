import type { SectionCtx } from '../types';
import { esc, fmtMonthly, nextSection } from '../helpers';
import { BACKTEST_CHART_COLORS } from '@/lib/calculators/investment/investment.constants';

const SERIES_LABELS = [
  'Vloženo celkem',
  'S&P 500',
  'Zlato',
  'Dluhopisy',
  'Nemovitostní fondy',
] as const;

const BACKTEST_SCRIPT = `
(function(){
  function q(id){return document.getElementById(id);}
  var raw=q('fa-backtest-presets');
  var canvas=q('fa-backtest-canvas');
  if(!raw||!canvas||typeof Chart==='undefined')return;
  var data;
  try{data=JSON.parse(raw.textContent||'{}');}catch(e){return;}
  var sel=q('fa-backtest-year');
  var chart;
  function buildChart(year){
    var p=data.presets[String(year)];
    if(!p)return;
    var sets=[
      {label:'${SERIES_LABELS[0]}',data:p.invested,color:'${BACKTEST_CHART_COLORS[0]}'},
      {label:'${SERIES_LABELS[1]}',data:p.sp500,color:'${BACKTEST_CHART_COLORS[1]}'},
      {label:'${SERIES_LABELS[2]}',data:p.gold,color:'${BACKTEST_CHART_COLORS[2]}'},
      {label:'${SERIES_LABELS[3]}',data:p.bonds,color:'${BACKTEST_CHART_COLORS[3]}'},
      {label:'${SERIES_LABELS[4]}',data:p.re,color:'${BACKTEST_CHART_COLORS[4]}'}
    ];
    if(chart)chart.destroy();
    chart=new Chart(canvas.getContext('2d'),{
      type:'line',
      data:{
        labels:p.labels,
        datasets:sets.map(function(s){
          return{
            label:s.label,
            data:s.data,
            borderColor:s.color,
            backgroundColor:s.color+'33',
            fill:false,
            tension:0.25,
            pointRadius:0,
            borderWidth:2
          };
        })
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}},
          tooltip:{
            callbacks:{
              label:function(c){var v=c.parsed.y;return c.dataset.label+': '+new Intl.NumberFormat('cs-CZ').format(Math.round(v))+' Kč';}
            }
          }
        },
        scales:{
          x:{ticks:{maxRotation:45,minRotation:45,font:{size:9}}},
          y:{ticks:{callback:function(v){return new Intl.NumberFormat('cs-CZ').format(v);}}}
        }
      }
    });
  }
  if(sel){
    var y0=data.defaultYear||data.startYearMin;
    for(var y=data.startYearMin;y<=data.startYearMax;y++){
      var o=document.createElement('option');
      o.value=String(y);
      o.textContent=String(y);
      if(y===y0)o.selected=true;
      sel.appendChild(o);
    }
    sel.addEventListener('change',function(){buildChart(parseInt(sel.value,10));});
    buildChart(y0);
  }
})();
`;

/** Interaktivní historická simulace (stejná data jako investiční kalkulačka). */
export function renderInvestmentBacktest(ctx: SectionCtx, presetsJson: string): string {
  const { data } = ctx;
  const num = nextSection(ctx.sectionCounter);
  const monthly = JSON.parse(presetsJson).monthly as number;

  return `<section class="page fa-backtest-section" id="investice-backtest">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Investice</div>
      <div class="sec-title">Simulace historického vývoje</div>
      <div class="sec-desc">Pravidelná měsíční investice <strong>${esc(fmtMonthly(monthly))}</strong> podle stejného modelu jako v kalkulačce v portálu. Vyberte rok začátku — křivky se přepočítají.</div>
    </div>
    <div class="fa-interactive-only fa-backtest-controls">
      <label class="fa-backtest-label" for="fa-backtest-year">Rok začátku simulace</label>
      <select id="fa-backtest-year" class="fa-backtest-select" aria-label="Rok začátku historické simulace"></select>
    </div>
    <div class="fa-backtest-chart-wrap">
      <canvas id="fa-backtest-canvas" width="900" height="320" aria-label="Graf historické simulace"></canvas>
    </div>
    <p class="sec-desc fa-interactive-note">Vyžaduje připojení k internetu (Chart.js z CDN). Pro plnou interaktivitu otevřete také <strong>Kalkulačky → Investiční kalkulačky</strong> v Aidvisoře.</p>
    <script type="application/json" id="fa-backtest-presets">${presetsJson}</script>
  </div>
</section>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" crossorigin="anonymous"></script>
<script>${BACKTEST_SCRIPT}</script>`;
}
