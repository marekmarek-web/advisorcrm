/**
 * Email templates for Aidvisora notifications.
 * Each returns { subject, html } ready for sendEmail().
 *
 * All transactional templates below now use the same branded layout as the
 * current Aidvisora auth email style.
 */

import { escapeHtmlText } from "@/lib/email/birthday/html-utils";

const DEFAULT_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://www.aidvisora.cz";

const SUPPORT_EMAIL = "podpora@aidvisora.cz";
const LOGO_URL =
  "https://github.com/marekmarek-web/Aidvisora/blob/main/logos/Aidvisora%20logo%20new.png?raw=true";

function e(value: unknown): string {
  return escapeHtmlText(String(value ?? ""));
}

function normalizedSiteUrl(): string {
  return DEFAULT_SITE_URL.replace(/\/$/, "");
}

function safeHref(url: string): string {
  return e(url.trim());
}

function safeMultilineText(value: string): string {
  return e(value).replace(/\n/g, "<br>");
}

function brandedButton(label: string, href: string): string {
  return `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="#5A4BFF" style="border-radius:16px;">
        <a href="${safeHref(href)}" target="_blank" class="button-hover" style="display:inline-block;padding:18px 32px;font-family:'Plus Jakarta Sans','Inter',sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:16px;border:1px solid #5A4BFF;">
          ${e(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function ghostButton(label: string, href: string): string {
  return `<table border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="#FFFFFF" style="border-radius:16px;">
        <a href="${safeHref(href)}" target="_blank" style="display:inline-block;padding:16px 28px;font-family:'Plus Jakarta Sans','Inter',sans-serif;font-size:15px;font-weight:700;color:#5A4BFF;text-decoration:none;border-radius:16px;border:1px solid #D6D9F6;">
          ${e(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function infoBox(params: { title: string; bodyHtml: string }): string {
  return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px;background-color:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0;">
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 8px 0;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:#0B1021;text-transform:uppercase;letter-spacing:0.05em;">
          ${e(params.title)}
        </p>
        ${params.bodyHtml}
      </td>
    </tr>
  </table>`;
}

function detailCard(
  rows: Array<{ label: string; value: string; emphasize?: boolean }>
): string {
  const items = rows
    .map(
      (row, index) => `<tr>
        <td style="padding:0 0 ${index === rows.length - 1 ? 0 : 14}px 0;font-family:'Inter',sans-serif;font-size:13px;color:#64748B;vertical-align:top;">
          ${e(row.label)}
        </td>
        <td style="padding:0 0 ${index === rows.length - 1 ? 0 : 14}px 16px;font-family:'Inter',sans-serif;font-size:${
          row.emphasize ? "16px" : "14px"
        };color:#0B1021;vertical-align:top;text-align:right;font-weight:${
          row.emphasize ? "700" : "600"
        };">
          ${row.value}
        </td>
      </tr>`
    )
    .join("");

  return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 0 0;background-color:#F8FAFC;border-radius:18px;border:1px solid #E2E8F0;">
    <tr>
      <td style="padding:22px 22px 20px 22px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          ${items}
        </table>
      </td>
    </tr>
  </table>`;
}

function bulletList(items: string[]): string {
  return `<ul style="margin:16px 0 0 18px;padding:0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.7;color:#475569;">
    ${items.map((item) => `<li style="margin:0 0 10px 0;">${item}</li>`).join("")}
  </ul>`;
}

function paragraph(html: string, marginBottom = 18): string {
  return `<p style="margin:0 0 ${marginBottom}px 0;font-family:'Inter',sans-serif;font-size:16px;line-height:1.7;color:#475569;">${html}</p>`;
}

function greeting(name?: string | null): string {
  return paragraph(name ? `Dobrý den, <strong style="color:#0B1021;">${e(name)}</strong>,` : "Dobrý den,", 20);
}

function signature(advisorName?: string): string {
  if (!advisorName?.trim()) return "";
  return `<p style="margin:28px 0 0 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#475569;">
    S pozdravem,<br>
    <strong style="color:#0B1021;">${e(advisorName.trim())}</strong>
  </p>`;
}

function unsubscribeLine(unsubscribeUrl?: string): string {
  if (!unsubscribeUrl?.trim()) return "";
  return `<p style="margin:20px 0 0 0;font-family:'Inter',sans-serif;font-size:12px;line-height:1.6;color:#94A3B8;">
    Tento typ oznámení již nechcete dostávat?
    <a href="${safeHref(unsubscribeUrl)}" target="_blank" class="link-hover" style="color:#94A3B8;text-decoration:underline;">Odhlásit se z notifikací</a>
  </p>`;
}

/**
 * Hlavní branded dokument ve stylu aktuálního ověřovacího e-mailu.
 * `bodyHtml` a `secondaryBoxHtml` musí být bezpečné HTML.
 */
export function aidvisoraBrandEmailDocument(params: {
  metaTitle: string;
  preheaderPlain: string;
  badgePlain: string;
  headlinePlain: string;
  bodyHtml: string;
  secondaryBoxHtml?: string;
  siteUrl?: string;
}): string {
  const ph = e(params.preheaderPlain);
  const badge = e(params.badgePlain);
  const headline = e(params.headlinePlain);
  const docTitle = e(params.metaTitle);
  const site = (params.siteUrl?.trim() || normalizedSiteUrl()).replace(/\/$/, "");
  const siteHref = safeHref(site);
  const siteLabel = e(site.replace(/^https?:\/\//, ""));

  const secondary = params.secondaryBoxHtml?.trim()
    ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px;">
        <tr>
          <td>${params.secondaryBoxHtml}</td>
        </tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="cs" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${docTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #F4F6FB; }
    .button-hover:hover { background-color: #4A3DE0 !important; border-color: #4A3DE0 !important; }
    .link-hover:hover { color: #5A4BFF !important; text-decoration: underline !important; }
    @media screen and (max-width: 640px) {
      .email-shell { width: 100% !important; }
      .email-padding { padding: 32px 24px !important; }
      .email-title { font-size: 28px !important; }
      .email-body { padding: 36px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F4F6FB;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${ph}
  </div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F4F6FB;padding:40px 20px;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-shell" style="max-width:600px;background-color:#ffffff;border-radius:32px;overflow:hidden;box-shadow:0 10px 40px -10px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" class="email-padding" style="background-color:#0B1021;padding:50px 40px;border-bottom:4px solid #5A4BFF;">
              <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <img src="${safeHref(LOGO_URL)}" alt="Aidvisora" width="176" style="display:block;width:176px;max-width:100%;height:auto;">
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center" style="background-color:rgba(90,75,255,0.15);border-radius:16px;padding:12px 16px;">
                    <span style="font-family:'Plus Jakarta Sans',sans-serif;color:#A5B4FC;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">
                      ${badge}
                    </span>
                  </td>
                </tr>
              </table>

              <h1 class="email-title" style="margin:0;font-family:'Plus Jakarta Sans','Inter',sans-serif;font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;line-height:1.2;">
                ${headline}
              </h1>
            </td>
          </tr>

          <tr>
            <td align="left" class="email-body" style="background-color:#ffffff;padding:48px 40px;">
              ${params.bodyHtml}
              ${secondary}
            </td>
          </tr>
        </table>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin-top:32px;">
          <tr>
            <td align="center" style="font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#94A3B8;">
              <p style="margin:0 0 16px 0;">
                Odesláno týmem Aidvisora<br>
                Inteligentní platforma pro finanční poradce.
              </p>
              <p style="margin:0;">
                <a href="${siteHref}" target="_blank" class="link-hover" style="color:#94A3B8;text-decoration:none;">${siteLabel}</a>
                &nbsp; • &nbsp;
                <a href="mailto:${SUPPORT_EMAIL}" target="_blank" class="link-hover" style="color:#94A3B8;text-decoration:none;">Podpora</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildTemplate(params: {
  subject: string;
  preheader: string;
  badge: string;
  headline: string;
  bodyHtml: string;
  secondaryBoxHtml?: string;
}) {
  return {
    subject: params.subject,
    html: aidvisoraBrandEmailDocument({
      metaTitle: params.subject,
      preheaderPlain: params.preheader,
      badgePlain: params.badge,
      headlinePlain: params.headline,
      bodyHtml: params.bodyHtml,
      secondaryBoxHtml: params.secondaryBoxHtml,
      siteUrl: normalizedSiteUrl(),
    }),
  };
}

export function serviceReminderTemplate(params: {
  contactName: string;
  advisorName?: string;
  nextServiceDue: string;
  unsubscribeUrl?: string;
}) {
  const subject = `Servisní připomínka: ${params.contactName}`;

  const bodyHtml = [
    greeting(),
    paragraph(
      `u klienta <strong style="color:#0B1021;">${e(params.contactName)}</strong> se blíží servisní kontakt naplánovaný na <strong style="color:#0B1021;">${e(params.nextServiceDue)}</strong>.`
    ),
    paragraph(
      "Otevřete Aidvisoru, navrhněte termín schůzky nebo upravte servisní cyklus, aby klient nezůstal bez navazující péče.",
      0
    ),
    signature(params.advisorName),
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  const secondaryBoxHtml =
    infoBox({
      title: "Doporučený postup",
      bodyHtml:
        `<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#64748B;">` +
        `Zkontrolujte poslední komunikaci, připravte si další krok a klienta oslovte včas. Aktivní servis výrazně zvyšuje důvěru i retenci.` +
        `</p>`,
    }) +
    `<div style="margin-top:20px;text-align:center;">${ghostButton(
      "Otevřít Aidvisoru",
      normalizedSiteUrl()
    )}</div>`;

  return buildTemplate({
    subject,
    preheader: `Blíží se servisní kontakt klienta ${params.contactName}.`,
    badge: "Servisní připomínka",
    headline: "Servisní kontakt čeká na akci",
    bodyHtml,
    secondaryBoxHtml,
  });
}

export function newDocumentTemplate(params: {
  contactName: string;
  documentName: string;
  portalUrl?: string;
  unsubscribeUrl?: string;
}) {
  const subject = `Nový dokument: ${params.documentName}`;

  const bodyHtml = [
    greeting(params.contactName),
    paragraph(
      `do klientské zóny byl nově nahrán dokument <strong style="color:#0B1021;">${e(params.documentName)}</strong>.`
    ),
    paragraph(
      params.portalUrl
        ? "Dokument si můžete ihned otevřít a zkontrolovat v klientské zóně."
        : "Dokument je připravený k zobrazení ve vašem přehledu v Aidvisoře.",
      params.portalUrl ? 28 : 0
    ),
    params.portalUrl
      ? `<div style="margin:0 0 6px 0;text-align:center;">${brandedButton(
          "Zobrazit dokument",
          params.portalUrl
        )}</div>`
      : "",
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  const secondaryBoxHtml = infoBox({
    title: "Co v dokumentu zkontrolovat",
    bodyHtml:
      `<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#64748B;">` +
      `Zaměřte se hlavně na správnost údajů, úplnost příloh a návaznost na další kroky ve spolupráci.` +
      `</p>`,
  });

  return buildTemplate({
    subject,
    preheader: `Byl nahrán nový dokument: ${params.documentName}.`,
    badge: "Nový dokument",
    headline: "Máte nový dokument k dispozici",
    bodyHtml,
    secondaryBoxHtml,
  });
}

export function newPortalRequestAdvisorTemplate(params: {
  contactName: string;
  caseTypeLabel: string;
  descriptionPreview: string;
  pipelineUrl: string;
}) {
  const subject = `Nový požadavek z klientské zóny: ${params.contactName}`;

  const bodyHtml = [
    greeting(),
    paragraph(
      `klient <strong style="color:#0B1021;">${e(params.contactName)}</strong> právě odeslal nový požadavek typu <strong style="color:#0B1021;">${e(params.caseTypeLabel)}</strong>.`
    ),
    paragraph(
      "Doporučujeme reagovat co nejdříve, aby klient měl jistotu, že se jeho požadavek aktivně řeší.",
      24
    ),
    detailCard([
      {
        label: "Typ požadavku",
        value: e(params.caseTypeLabel),
      },
      {
        label: "Klient",
        value: e(params.contactName),
      },
      {
        label: "Náhled zprávy",
        value: safeMultilineText(params.descriptionPreview),
      },
    ]),
    `<div style="margin:28px 0 0 0;text-align:center;">${brandedButton(
      "Otevřít pipeline",
      params.pipelineUrl
    )}</div>`,
  ].join("");

  return buildTemplate({
    subject,
    preheader: `Klient ${params.contactName} odeslal nový požadavek z klientské zóny.`,
    badge: "Nový lead",
    headline: "V klientské zóně čeká nový požadavek",
    bodyHtml,
  });
}

export function newMessageAdvisorTemplate(params: {
  contactName: string;
  bodyPreview: string;
  messagesUrl: string;
}) {
  const subject = `Nová zpráva od klienta: ${params.contactName}`;

  const bodyHtml = [
    greeting(),
    paragraph(
      `od klienta <strong style="color:#0B1021;">${e(params.contactName)}</strong> máte novou zprávu.`
    ),
    infoBox({
      title: "Náhled zprávy",
      bodyHtml: `<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.7;color:#475569;">${safeMultilineText(
        params.bodyPreview
      )}</p>`,
    }),
    `<div style="margin:28px 0 0 0;text-align:center;">${brandedButton(
      "Otevřít konverzaci",
      params.messagesUrl
    )}</div>`,
  ].join("");

  return buildTemplate({
    subject,
    preheader: `Máte novou zprávu od klienta ${params.contactName}.`,
    badge: "Nová zpráva",
    headline: "Klient vám právě napsal",
    bodyHtml,
  });
}

export function paymentInstructionTemplate(params: {
  contactName: string;
  partnerName: string;
  accountNumber: string;
  contractNumber?: string;
  amount?: string;
  unsubscribeUrl?: string;
}) {
  const subject = `Platební instrukce – ${params.partnerName}`;

  const rows = [
    { label: "Partner", value: e(params.partnerName) },
    { label: "Číslo účtu", value: `<strong style="color:#0B1021;">${e(params.accountNumber)}</strong>`, emphasize: true },
    ...(params.contractNumber
      ? [{ label: "Číslo smlouvy", value: e(params.contractNumber) }]
      : []),
    ...(params.amount ? [{ label: "Částka", value: `${e(params.amount)} Kč`, emphasize: true }] : []),
  ];

  const bodyHtml = [
    greeting(params.contactName),
    paragraph(
      `níže najdete platební údaje pro partnera <strong style="color:#0B1021;">${e(params.partnerName)}</strong>. Před odesláním platby doporučujeme zkontrolovat správnost všech údajů.`
    ),
    detailCard(rows),
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  const secondaryBoxHtml = infoBox({
    title: "Důležité upozornění",
    bodyHtml:
      `<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#64748B;">` +
      `Pokud se jakýkoli údaj liší od poslední komunikace s poradcem nebo partnerem, platbu zatím neposílejte a ověřte si informace.` +
      `</p>`,
  });

  return buildTemplate({
    subject,
    preheader: `Platební instrukce pro ${params.partnerName} jsou připravené.`,
    badge: "Platební instrukce",
    headline: "Platební údaje máte připravené",
    bodyHtml,
    secondaryBoxHtml,
  });
}

export function requestMissingDataTemplate(params: {
  contactName: string;
  missingFields: string[];
  documentName?: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const subject = `Doplnění údajů – ${params.contactName}`;

  const items = params.missingFields.map((field) => e(field));

  const bodyHtml = [
    greeting(params.contactName),
    paragraph(
      params.documentName
        ? `po zpracování dokumentu <strong style="color:#0B1021;">${e(params.documentName)}</strong> nám stále chybí několik důležitých údajů.`
        : "po zpracování vašeho podání nám stále chybí několik důležitých údajů."
    ),
    paragraph("Abychom mohli pokračovat bez zbytečného zdržení, prosíme o doplnění následujících informací:", 0),
    bulletList(items),
    paragraph("Jakmile údaje doplníte, můžeme navázat dalším krokem.", 0),
    signature(params.advisorName),
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  return buildTemplate({
    subject,
    preheader: `Je potřeba doplnit údaje pro ${params.contactName}.`,
    badge: "Doplnění údajů",
    headline: "Bez doplnění údajů nepůjdeme dál",
    bodyHtml,
  });
}

export function reviewFollowupTemplate(params: {
  contactName: string;
  reviewFileName: string;
  reviewStatus: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const subject = `Výsledek kontroly – ${params.reviewFileName}`;

  const bodyHtml = [
    greeting(params.contactName),
    paragraph(
      `dokument <strong style="color:#0B1021;">${e(params.reviewFileName)}</strong> byl zkontrolován a jeho aktuální stav je <strong style="color:#0B1021;">${e(params.reviewStatus)}</strong>.`
    ),
    paragraph(
      "Máte-li k výsledku kontroly jakékoli dotazy, navazujte prosím přímo se svým poradcem.",
      0
    ),
    signature(params.advisorName),
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  const secondaryBoxHtml = infoBox({
    title: "Co bude následovat",
    bodyHtml:
      `<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#64748B;">` +
      `Pokud je potřeba cokoli doplnit nebo upravit, poradce se s vámi spojí s konkrétními dalšími kroky.` +
      `</p>`,
  });

  return buildTemplate({
    subject,
    preheader: `Kontrola dokumentu ${params.reviewFileName} byla dokončena.`,
    badge: "Kontrola dokumentu",
    headline: "Výsledek kontroly je připravený",
    bodyHtml,
    secondaryBoxHtml,
  });
}

export function policyStatusUpdateTemplate(params: {
  contactName: string;
  policyName: string;
  status: string;
  detail?: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const subject = `Status pojistky – ${params.policyName}`;

  const bodyHtml = [
    greeting(params.contactName),
    paragraph(
      `u pojistky <strong style="color:#0B1021;">${e(params.policyName)}</strong> evidujeme nový stav <strong style="color:#0B1021;">${e(params.status)}</strong>.`
    ),
    params.detail
      ? infoBox({
          title: "Detail aktualizace",
          bodyHtml: `<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.7;color:#475569;">${safeMultilineText(
            params.detail
          )}</p>`,
        })
      : "",
    signature(params.advisorName),
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  return buildTemplate({
    subject,
    preheader: `Pojistka ${params.policyName} má nový stav: ${params.status}.`,
    badge: "Stav pojistky",
    headline: "U pojistky došlo k aktualizaci",
    bodyHtml,
  });
}

export function reminderBeforeDeadlineTemplate(params: {
  contactName: string;
  deadlineType: string;
  deadlineDate: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const subject = `Připomínka: ${params.deadlineType} – ${params.contactName}`;

  const bodyHtml = [
    greeting(),
    paragraph(
      `blíží se termín <strong style="color:#0B1021;">${e(params.deadlineType)}</strong> pro klienta <strong style="color:#0B1021;">${e(params.contactName)}</strong>. Datum termínu je <strong style="color:#0B1021;">${e(params.deadlineDate)}</strong>.`
    ),
    paragraph(
      "Zkontrolujte aktuální stav v aplikaci a vyřešte navazující kroky ještě před termínem.",
      0
    ),
    signature(params.advisorName),
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  return buildTemplate({
    subject,
    preheader: `Blíží se termín ${params.deadlineType} pro klienta ${params.contactName}.`,
    badge: "Blížící se termín",
    headline: "Na obzoru je důležitý termín",
    bodyHtml,
  });
}

/** Pozvánka do klientské zóny s předpřipraveným účtem a dočasným heslem. */
export function clientPortalInviteTemplate(params: {
  registerUrl: string;
  contactFirstName: string;
  tenantName?: string;
  loginEmail: string;
  temporaryPassword: string;
  reusedExistingAccount?: boolean;
  expiresInDays: number;
  gdprUrl: string;
  termsUrl: string;
}) {
  const subject = "Přístup do klientské zóny je připravený — Aidvisora";
  const who = params.tenantName?.trim() ? params.tenantName.trim() : "váš poradce";

  const bodyHtml = [
    greeting(params.contactFirstName),
    paragraph(
      `${e(who)} vám zpřístupnil(a) klientskou zónu v Aidvisoře. Na jednom místě zde najdete přehled smluv, dokumentů, zpráv i další komunikaci.`
    ),
    paragraph(
      params.reusedExistingAccount
        ? `Přístup byl znovu připraven a dočasné heslo obnoveno. Odkaz je platný <strong style="color:#0B1021;">${e(params.expiresInDays)} dní</strong>.`
        : `Účet je připravený a můžete se ihned přihlásit. Odkaz je platný <strong style="color:#0B1021;">${e(params.expiresInDays)} dní</strong>.`,
      0
    ),
    detailCard([
      { label: "Přihlašovací e-mail", value: e(params.loginEmail) },
      { label: "Dočasné heslo", value: e(params.temporaryPassword), emphasize: true },
    ]),
    paragraph("Postup je jednoduchý:", 0),
    bulletList([
      "Klikněte na tlačítko níže.",
      "Přihlaste se pomocí e-mailu a dočasného hesla.",
      "Nastavíte si vlastní heslo a máte hotovo.",
    ]),
    `<div style="margin:28px 0 0 0;text-align:center;">${brandedButton(
      "Dokončit přístup",
      params.registerUrl
    )}</div>`,
  ].join("");

  const secondaryBoxHtml =
    infoBox({
      title: "Když tlačítko nefunguje",
      bodyHtml: `<p style="margin:0 0 12px 0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#64748B;">Zkopírujte si tento odkaz do prohlížeče:</p>
        <p style="margin:0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.7;color:#0B1021;word-break:break-all;">${e(
          params.registerUrl
        )}</p>`,
    }) +
    infoBox({
      title: "Právní informace",
      bodyHtml: `<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#64748B;">
        <a href="${safeHref(params.gdprUrl)}" target="_blank" class="link-hover" style="color:#5A4BFF;text-decoration:underline;">Zásady zpracování osobních údajů</a>
        &nbsp; • &nbsp;
        <a href="${safeHref(params.termsUrl)}" target="_blank" class="link-hover" style="color:#5A4BFF;text-decoration:underline;">Obchodní podmínky</a>
      </p>`,
    });

  return buildTemplate({
    subject,
    preheader: "Váš přístup do klientské zóny Aidvisora je připravený.",
    badge: "Klientská zóna",
    headline: "Váš přístup do Aidvisory je připravený",
    bodyHtml,
    secondaryBoxHtml,
  });
}

export function internalSummaryTemplate(params: {
  advisorName: string;
  summaryDate: string;
  urgentCount: number;
  pendingReviewCount: number;
  overdueTaskCount: number;
  blockedPaymentCount: number;
}) {
  const subject = `Denní souhrn – ${params.summaryDate}`;

  const bodyHtml = [
    greeting(params.advisorName),
    paragraph(
      `níže najdete rychlý přehled klíčových položek za den <strong style="color:#0B1021;">${e(params.summaryDate)}</strong>.`
    ),
    detailCard([
      { label: "Urgentní položky", value: e(params.urgentCount), emphasize: true },
      { label: "Čekající review", value: e(params.pendingReviewCount), emphasize: true },
      { label: "Úkoly po termínu", value: e(params.overdueTaskCount), emphasize: true },
      { label: "Blokované platby", value: e(params.blockedPaymentCount), emphasize: true },
    ]),
    paragraph("Pro detailní přehled a navazující akce se přihlaste do Aidvisory.", 0),
    `<div style="margin:28px 0 0 0;text-align:center;">${ghostButton(
      "Otevřít Aidvisoru",
      normalizedSiteUrl()
    )}</div>`,
  ].join("");

  return buildTemplate({
    subject,
    preheader: `Denní souhrn poradce ${params.advisorName} za ${params.summaryDate}.`,
    badge: "Denní souhrn",
    headline: "Dnešní klíčová čísla máte po ruce",
    bodyHtml,
  });
}

/** Pozvánka člena týmu do workspace (cron / team action). */
export function staffTeamInviteTemplate(params: {
  loginUrl: string;
  tenantName?: string;
  inviteeEmail: string;
  roleLabel: string;
  expiresInDays: number;
}) {
  const orgLabel = params.tenantName?.trim() ? params.tenantName.trim() : "váš tým";
  const subject = `Pozvánka do týmu — ${orgLabel} — Aidvisora`;

  const bodyHtml = [
    greeting(),
    paragraph(
      `byli jste pozváni do workspace <strong style="color:#0B1021;">${e(orgLabel)}</strong> v roli <strong style="color:#0B1021;">${e(params.roleLabel)}</strong>.`,
    ),
    paragraph(
      `Odkaz je platný <strong style="color:#0B1021;">${e(params.expiresInDays)} dní</strong>. Použijte prosím stejný e-mail jako v této zprávě: <strong style="color:#0B1021;">${e(params.inviteeEmail)}</strong>.`,
      0,
    ),
    bulletList([
      "Klikněte na tlačítko níže.",
      "Přihlaste se nebo si založte účet (záložka podle potřeby).",
      "Použijte výše uvedený e-mail.",
    ]),
    `<div style="margin:28px 0 0 0;text-align:center;">${brandedButton("Přijmout pozvánku", params.loginUrl)}</div>`,
  ].join("");

  const secondaryBoxHtml = infoBox({
    title: "Když tlačítko nefunguje",
    bodyHtml: `<p style="margin:0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.7;color:#0B1021;word-break:break-all;">${e(params.loginUrl)}</p>`,
  });

  return buildTemplate({
    subject,
    preheader: `Pozvánka do workspace ${orgLabel} v Aidvisoře.`,
    badge: "Tým",
    headline: "Pozvánka do Aidvisory",
    bodyHtml,
    secondaryBoxHtml,
  });
}

/** Připomenutí kalendářové události (poradce) — cron `event-reminders`. */
export function calendarEventReminderAdvisorTemplate(params: {
  eventTitle: string;
  startLabel: string;
  calendarUrl: string;
}) {
  const titleForSubject =
    params.eventTitle.length > 80 ? `${params.eventTitle.slice(0, 77)}…` : params.eventTitle;

  const bodyHtml = [
    greeting(),
    paragraph("blíží se aktivita v kalendáři, kterou máte v Aidvisoře naplánovanou."),
    detailCard([
      { label: "Událost", value: e(params.eventTitle), emphasize: true },
      { label: "Začátek", value: e(params.startLabel) },
    ]),
    `<div style="margin:28px 0 0 0;text-align:center;">${brandedButton("Otevřít kalendář", params.calendarUrl)}</div>`,
  ].join("");

  return buildTemplate({
    subject: `Připomenutí: ${titleForSubject}`,
    preheader: `${params.eventTitle} — začátek ${params.startLabel}`,
    badge: "Kalendář",
    headline: "Blíží se nadcházející aktivita",
    bodyHtml,
  });
}

/** Servisní připomínka klientovi — cron `service-reminders` (ne `serviceReminderTemplate` pro poradce). */
export function clientServiceDueReminderTemplate(params: {
  firstName: string | null;
  lastName: string | null;
  nextServiceDue: string;
}) {
  const displayName = [params.firstName, params.lastName].filter(Boolean).join(" ").trim();

  const bodyHtml = [
    greeting(displayName || undefined),
    paragraph(
      `připomínáme, že máte naplánovaný <strong style="color:#0B1021;">servisní termín</strong> (${e(params.nextServiceDue)}). Pro domluvení detailů se obraťte na svého poradce.`,
      0,
    ),
  ].join("");

  return buildTemplate({
    subject: "Připomínka servisního termínu – Aidvisora",
    preheader: `Servisní termín ${params.nextServiceDue}.`,
    badge: "Servis",
    headline: "Servisní termín se blíží",
    bodyHtml,
  });
}

/** E-mail s přílohou platebního PDF — `sendPaymentPdfToClient`. */
export function paymentPdfAttachmentClientTemplate(params: {
  firstName: string | null;
  lastName: string | null;
  unsubscribeUrl: string;
}) {
  const displayName = [params.firstName, params.lastName].filter(Boolean).join(" ").trim();

  const bodyHtml = [
    greeting(displayName || undefined),
    paragraph(
      `v příloze tohoto e-mailu naleznete <strong style="color:#0B1021;">platební instrukce</strong> ve formátu PDF.`,
      0,
    ),
    unsubscribeLine(params.unsubscribeUrl),
  ].join("");

  return buildTemplate({
    subject: "Platební instrukce – Aidvisora",
    preheader: "Platební instrukce v příloze.",
    badge: "Platba",
    headline: "Platební instrukce v příloze",
    bodyHtml,
  });
}
