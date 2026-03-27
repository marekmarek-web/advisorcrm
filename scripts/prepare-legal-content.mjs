/**
 * Reads legals/*-sections.json and writes cleaned JSON for Next.js import.
 * Run from repo root: node scripts/prepare-legal-content.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "apps/web/src/app/legal/content");

const EFFECTIVE = "27. 3. 2026";
const INTRO_IMPORTANT =
  "Důležité: Tento text je připraven jako praktický základ pro Aidvisoru nastavenou jako SaaS/ICT nástroj pro finanční poradce. Není koncipován jako poskytování finančního poradenství ze strany poskytovatele platformy. Před spuštěním do ostrého provozu je vhodná lokální právní kontrola zejména ve vztahu k použitým funkcím AI, billingu, reklamacím a identifikačním údajům poskytovatele.";

const PRIVACY_CONTROLLER =
  "Správcem osobních údajů pro účely tohoto dokumentu je Aidvisora s.r.o., se sídlem Vraňany 6, 277 07 Mlčechvosty, Česká republika, IČO 05474434. DIČ bude uvedeno po přidělení.";

const TERMS_CHANGES_EXTRA =
  "U podstatných změn těchto obchodních podmínek poskytovatel obvykle zveřejní nové znění na webu s uvedením data účinnosti a současně o změně informuje registrované uživatele e-mailem uvedeným u účtu a/nebo oznámením v aplikaci, a to s přiměřenou lhůtou před účinností (obvykle nejméně 14 dní u změn, které zákazníka podstatně dotýkají), pokud tak stanoví právní předpisy nebo smluvní ujednání. Pokračováním v užívání služby po účinnosti změny může být vyjádřen souhlas tam, kde to pro daný typ změny dává smysl a neodporuje to právním předpisům.";

function stripMeta(blocks) {
  const i = blocks.findIndex((b) => b.type === "h1" && /^\d+\.\s/.test(b.text));
  return i >= 0 ? blocks.slice(i) : blocks;
}

function mapBlocks(blocks, fn) {
  return blocks.map(fn);
}

function prepareTerms(blocks) {
  let b = stripMeta(blocks);
  b = b.filter(
    (x) =>
      !x.text.includes("Poskytovatelem je pro účely tohoto draftu Marek Marek") &&
      !x.text.includes("Poskytovatelem je pro účely tohoto draftu")
  );
  b = mapBlocks(b, (x) => {
    if (x.text.startsWith("Tyto obchodní podmínky nabývají")) {
      return { ...x, text: `Tyto obchodní podmínky nabývají účinnosti dnem ${EFFECTIVE}.` };
    }
    return x;
  });
  const intro = [
    {
      type: "p",
      text: "B2B podmínky pro SaaS platformu určenou finančním poradcům a jejich organizacím. Draft připravený pro český trh na základě oficiálních veřejných zdrojů a zadaného provozního modelu Aidvisora.",
    },
    { type: "p", text: INTRO_IMPORTANT },
  ];
  const i15 = b.findIndex((x) => x.type === "h1" && x.text.startsWith("15."));
  if (i15 > 0) {
    b = [...b.slice(0, i15), { type: "p", text: TERMS_CHANGES_EXTRA }, ...b.slice(i15)];
  }
  return [...intro, ...b];
}

function preparePrivacy(blocks) {
  let b = stripMeta(blocks);
  b = mapBlocks(b, (x) => {
    if (x.text.startsWith("Správcem osobních údajů pro účely této privacy policy je Marek Marek")) {
      return { ...x, text: PRIVACY_CONTROLLER };
    }
    if (x.text.startsWith("Praktický doplněk:")) {
      return {
        ...x,
        text: "Praktický doplněk: U produkčního nasazení je vhodné v administraci i ve veřejné dokumentaci uvést, zda jsou AI funkce aktivní, jaké kategorie dokumentů se přes ně zpracovávají a jaké regionální nastavení je použito u poskytovatele AI API.",
      };
    }
    if (x.text.startsWith("Pro uplatnění práv nás můžete kontaktovat na e-mailu [doplnit]")) {
      return {
        ...x,
        text: "Pro uplatnění práv nás můžete kontaktovat na e-mailu support@aidvisora.cz nebo podpora@aidvisora.cz. Před vyřízením žádosti si můžeme ověřit vaši totožnost přiměřeným způsobem.",
      };
    }
    if (x.text.startsWith("Správce: Marek Marek")) {
      return {
        ...x,
        text: "Identifikační údaje správce a kontakty pro právní a privacy agendu jsou uvedeny v záhlaví této stránky.",
      };
    }
    if (x.text.startsWith("Kontaktní e-mail pro privacy agendu:")) {
      return { ...x, text: "Kontaktní e-maily pro privacy agendu: support@aidvisora.cz nebo podpora@aidvisora.cz." };
    }
    if (x.text.startsWith("Datum účinnosti dokumentu:")) {
      return { ...x, text: `Datum účinnosti dokumentu: ${EFFECTIVE}.` };
    }
    return x;
  });
  const intro = [
    {
      type: "p",
      text: "Informační dokument poskytovatele pro uživatele webu, zákazníky a osoby využívající klientský portál. Draft připravený pro český trh na základě oficiálních veřejných zdrojů a zadaného provozního modelu Aidvisora.",
    },
    { type: "p", text: INTRO_IMPORTANT },
  ];
  return [...intro, ...b];
}

function prepareDpa(blocks) {
  let b = stripMeta(blocks);
  b = b.filter(
    (x) =>
      !x.text.includes("Zpracovatelem je pro účely tohoto draftu Marek Marek") &&
      !x.text.includes("Zpracovatelem je pro účely tohoto draftu")
  );
  b = mapBlocks(b, (x) => {
    if (x.text.startsWith("K provoznímu doplnění:")) {
      return {
        ...x,
        text: "K provoznímu doplnění: Je vhodné doplnit interní bezpečnostní přílohu mimo veřejné smluvní dokumenty: skutečné retenční lhůty, MFA politiku, incident response kontakty, zálohovací okna, RTO/RPO, přehled subprocesorů a regionální nastavení u poskytovatele AI API.",
      };
    }
    return x;
  });
  const intro = [
    {
      type: "p",
      text: "Dohoda mezi správcem a zpracovatelem podle čl. 28 GDPR pro provoz SaaS platformy. Draft připravený pro český trh na základě oficiálních veřejných zdrojů a zadaného provozního modelu Aidvisora.",
    },
    { type: "p", text: INTRO_IMPORTANT },
  ];
  return [...intro, ...b];
}

function prepareAi(blocks) {
  let b = stripMeta(blocks);
  b = mapBlocks(b, (x) => {
    if (x.text.startsWith("Doporučené znění:")) {
      return {
        ...x,
        text: "Ilustrativní znění: Výstupy funkcí AI v rámci služby Aidvisora slouží pouze jako interní informativní podklad pro finančního poradce nebo jiného oprávněného uživatele. Nejde o finanční, investiční, pojišťovací, úvěrové ani právní doporučení poskytované koncovému klientovi. Každý výstup AI musí být přezkoumán a odborně posouzen odpovědnou fyzickou osobou na straně zákazníka.",
      };
    }
    return x;
  });
  const intro = [
    {
      type: "p",
      text: "Interní smluvní a produktová příloha pro nastavení Aidvisora mimo doporučovací režim. Draft připravený pro český trh na základě oficiálních veřejných zdrojů a zadaného provozního modelu Aidvisora.",
    },
    { type: "p", text: INTRO_IMPORTANT },
  ];
  return [...intro, ...b];
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const specs = [
  { inFile: "op-sections.json", outFile: "terms-blocks.json", fn: prepareTerms },
  { inFile: "privacy-sections.json", outFile: "privacy-blocks.json", fn: preparePrivacy },
  { inFile: "dpa-sections.json", outFile: "dpa-blocks.json", fn: prepareDpa },
  { inFile: "ai-sections.json", outFile: "ai-disclaimer-blocks.json", fn: prepareAi },
];

for (const { inFile, outFile, fn } of specs) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "legals", inFile), "utf8"));
  const out = fn(raw);
  fs.writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify(out, null, 2), "utf8");
  console.error("Wrote", outFile, out.length, "blocks");
}
