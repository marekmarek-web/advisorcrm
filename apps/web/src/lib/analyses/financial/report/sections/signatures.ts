import type { SectionCtx } from '../types';
import { esc } from '../helpers';

export function renderSignatures(ctx: SectionCtx): string {
  const { data, branding } = ctx;
  const clientName = data.client?.name ?? 'Klient';
  const advisorName = branding.advisorName ?? 'Finanční poradce';
  const advisorRole = branding.advisorRole ?? 'Privátní finanční plánování';
  const dateStr = new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<section class="page" id="signatures" style="justify-content:flex-end">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
      <div class="sec-header">
        <div class="sec-title">Podpisy &amp; souhlas</div>
        <div class="sec-desc">Svým podpisem stvrzuji, že jsem se seznámil/a s obsahem tohoto finančního plánu a souhlasím s navrženou strategií.</div>
      </div>

      <div class="sig-area">
        <div class="sig-box">
          <div style="height:80px"></div>
          <div class="sig-line-el"></div>
          <div class="sig-name">${esc(clientName)}</div>
          <div class="sig-role">Klient</div>
        </div>
        <div class="sig-box">
          <div style="height:80px"></div>
          <div class="sig-line-el"></div>
          <div class="sig-name">${esc(advisorName)}</div>
          <div class="sig-role">${esc(advisorRole)}</div>
        </div>
      </div>

      <div style="text-align:center;margin-top:var(--s8,32px);color:var(--stone-400,#8c959f);font-size:12px">
        V ..................., dne ${dateStr}
      </div>
    </div>

    <div class="legal">
      <strong>Právní upozornění:</strong> Tento dokument slouží výhradně jako informační podklad pro rozhodování klienta a nepředstavuje investiční doporučení ve smyslu zákona č. 256/2004 Sb. Veškeré projekce budoucích výnosů jsou pouze odhadem a nezaručují skutečné výsledky. Minulá výkonnost investičních nástrojů není zárukou budoucích výnosů. Hodnota investice může kolísat a investor může získat zpět méně, než investoval. Před realizací jakéhokoli investičního rozhodnutí doporučujeme konzultaci s licencovaným investičním poradcem. Údaje o pojištění jsou orientační kalkulací a skutečné pojistné podmínky stanovuje pojišťovna.
      <br><br>
      © ${new Date().getFullYear()} Aidvisora — Privátní finanční plánování. Všechna práva vyhrazena.
    </div>
  </div>
</section>`;
}
