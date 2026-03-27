import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, fmtMonthly, fmtBigCzk, fmtDaily, esc } from '../helpers';
import { computeInsurance } from '../../report';

export function renderDirectorInsurance(ctx: SectionCtx): string {
  const { data } = ctx;
  const num = nextSection(ctx.sectionCounter);

  const ins = computeInsurance(data);
  const directorName = data.client?.name ?? 'Jednatel';

  return `<section class="page" id="co-jednatel">
  <div class="page-bar" style="background:var(--gold-500,#d97706)"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number gold">${num} — Zajištění jednatele</div>
      <div class="sec-title">Pojištění jednatele</div>
      <div class="sec-desc">Orientační přehled ochrany klíčové osoby firmy — jednatele / majitele (vstup pro posouzení poradcem).</div>
    </div>

    <div class="ins-person-header">
      <div class="ins-person-icon icon-gold">👤</div>
      <div>
        <div class="ins-person-title">${esc(directorName)} — jednatel</div>
        <div class="ins-person-income">${fmtMonthly(ins.netIncome)}</div>
      </div>
    </div>

    <div class="tbl-wrap" style="margin-bottom:var(--s5,20px)">
      <div class="tbl-cap"><span class="tbl-cap-title">Modelované krytí jednatele (orientační)</span></div>
      <table class="dt">
        <thead><tr><th>Riziko</th><th>Popis</th><th class="r">Výše</th></tr></thead>
        <tbody>
          <tr><td class="bold">Invalidita</td><td class="muted">Key-man pojištění</td><td class="r num">${fmtCzk(ins.invalidity.capital)}</td></tr>
          <tr><td class="bold">Pracovní neschopnost</td><td class="muted">Pokrytí fixních nákladů</td><td class="r num">${fmtDaily(ins.sickness.dailyBenefit)}</td></tr>
          <tr><td class="bold">Trvalé následky</td><td class="muted">S progresí ${ins.tn.progress}×</td><td class="r num">${fmtCzk(ins.tn.base)} → ${fmtBigCzk(ins.tn.max)}</td></tr>
          <tr><td class="bold">Smrt</td><td class="muted">Ochrana firmy + rodiny</td><td class="r num">${fmtCzk(ins.death.coverage)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="ins-detail-grid">
      <div class="ins-detail-card">
        <div class="ins-detail-title">Invalidita jednatele</div>
        <div class="ins-line"><span class="ins-line-name">Potřebný příjem</span><span class="ins-line-val">${fmtMonthly(ins.invalidity.needMonthly)}</span></div>
        <div class="ins-line"><span class="ins-line-name">Státní inv. důchod</span><span class="ins-line-val">−${fmtMonthly(ins.invalidity.statePension)}</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Key-man pojistka</span><span class="ins-line-val c-gold">${fmtCzk(ins.invalidity.capital)}</span></div>
      </div>

      <div class="ins-detail-card">
        <div class="ins-detail-title">Pracovní neschopnost</div>
        <div class="ins-line"><span class="ins-line-name">Čistý příjem</span><span class="ins-line-val">${fmtMonthly(ins.netIncome)}</span></div>
        <div class="ins-line"><span class="ins-line-name">Gap (měsíční)</span><span class="ins-line-val c-neg">${fmtMonthly(ins.sickness.gapMonthly)}</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Denní dávka</span><span class="ins-line-val c-gold">${fmtDaily(ins.sickness.dailyBenefit)}</span></div>
      </div>

      <div class="ins-detail-card">
        <div class="ins-detail-title">Trvalé následky</div>
        <div class="ins-line"><span class="ins-line-name">Základní</span><span class="ins-line-val">${fmtCzk(ins.tn.base)}</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Maximum (${ins.tn.progress}×)</span><span class="ins-line-val c-gold">${fmtBigCzk(ins.tn.max)}</span></div>
      </div>

      <div class="ins-detail-card">
        <div class="ins-detail-title">Smrt</div>
        <div class="ins-line"><span class="ins-line-name">Krytí závazků</span><span class="ins-line-val">${fmtCzk(ins.death.coverage)}</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Pojistná částka</span><span class="ins-line-val c-gold">${fmtCzk(ins.death.coverage)}</span></div>
      </div>
    </div>

    <div class="callout warn" style="margin-top:var(--s5,20px)">
      <span class="callout-icon">⚠️</span>
      <div><strong>Key-man riziko</strong>
      Výpadek jednatele představuje významné riziko pro kontinuitu podnikání. Key-man pojištění jako nákladová položka firmy je běžná varianta k posouzení poradcem — nejde o automatický návrh produktu.</div>
    </div>
  </div>
</section>`;
}
