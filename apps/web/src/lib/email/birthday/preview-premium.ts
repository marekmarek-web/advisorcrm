import { renderPremiumDarkEmail } from "./render-premium-dark";
import { getPublicSiteOrigin } from "./public-urls";
import { plainTextToParagraphHtml, truncatePreheader } from "./html-utils";

/** Ukázkový text — záměrně obecný, bez reálných osobních údajů. */
const SAMPLE_BODY = `Dobrý den,

k Vašim dnešním narozeninám Vám přeji vše nejlepší, pevné zdraví a mnoho radosti v osobním i pracovním životě.`;

/**
 * Statické HTML pro náhled tématu Premium v nastavení (iframe `srcDoc`).
 * Neserializuje se do e-mailu — jen vizuální náhled šablony.
 */
export function getPremiumBirthdayEmailPreviewHtml(): string {
  const preheader = truncatePreheader(SAMPLE_BODY.replace(/\n+/g, " "));
  return renderPremiumDarkEmail({
    theme: "premium_dark",
    gifAbsoluteUrl: null,
    preheader,
    bodyParagraphsHtml: plainTextToParagraphHtml(SAMPLE_BODY),
    advisorDisplayName: "Jana Nováková",
    advisorRoleLine: "Finanční poradkyně",
    advisorPhone: "+420 777 123 456",
    advisorWebsite: "www.příklad.cz",
    portalSiteLabel: "Aidvisory",
    portalSiteUrl: getPublicSiteOrigin(),
    headerLogoAbsoluteUrl: null,
  });
}
