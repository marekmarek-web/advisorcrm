/**
 * Email templates for Aidvisora notifications.
 * Each returns { subject, html } ready for sendEmail().
 */

function layout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8" /><title>Aidvisora</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #323338; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <div style="margin-bottom: 16px; font-size: 14px; font-weight: 600; color: #0073ea;">Aidvisora</div>
    ${bodyHtml}
    <hr style="border: none; border-top: 1px solid #e6e9ef; margin: 24px 0;" />
    <div style="font-size: 11px; color: #676879;">
      Tento e-mail byl odeslán automaticky systémem Aidvisora. Pokud si nepřejete dostávat oznámení,
      klikněte na odkaz „Odhlásit se" níže.
    </div>
  </div>
</body>
</html>`;
}

export function serviceReminderTemplate(params: {
  contactName: string;
  advisorName?: string;
  nextServiceDue: string;
  unsubscribeUrl?: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Připomínka servisní schůzky</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Klient <strong>${params.contactName}</strong> má naplánovaný servisní kontakt 
      <strong>${params.nextServiceDue}</strong>.
    </p>
    ${params.advisorName ? `<p style="font-size: 14px;">Přiřazeno: ${params.advisorName}</p>` : ""}
    <p style="font-size: 14px;">Přihlaste se do Aidvisora a naplánujte schůzku nebo aktualizujte servisní cyklus.</p>
    ${params.unsubscribeUrl ? `<p style="font-size: 12px;"><a href="${params.unsubscribeUrl}" style="color: #676879;">Odhlásit se z notifikací</a></p>` : ""}
  `);

  return {
    subject: `Servisní připomínka: ${params.contactName}`,
    html,
  };
}

export function newDocumentTemplate(params: {
  contactName: string;
  documentName: string;
  portalUrl?: string;
  unsubscribeUrl?: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Nový dokument</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Pro vás byl nahrán nový dokument: <strong>${params.documentName}</strong>.
    </p>
    ${params.portalUrl ? `<p style="font-size: 14px;"><a href="${params.portalUrl}" style="color: #0073ea;">Zobrazit v klientské zóně</a></p>` : ""}
    ${params.unsubscribeUrl ? `<p style="font-size: 12px;"><a href="${params.unsubscribeUrl}" style="color: #676879;">Odhlásit se z notifikací</a></p>` : ""}
  `);

  return {
    subject: `Nový dokument: ${params.documentName}`,
    html,
  };
}

export function newPortalRequestAdvisorTemplate(params: {
  contactName: string;
  caseTypeLabel: string;
  descriptionPreview: string;
  pipelineUrl: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Nový požadavek z klientské zóny</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Klient <strong>${params.contactName}</strong> odeslal nový požadavek
      (<strong>${params.caseTypeLabel}</strong>).
    </p>
    <p style="font-size: 14px; line-height: 1.5; color: #676879; margin: 12px 0;">
      ${params.descriptionPreview}
    </p>
    <p style="font-size: 14px;">
      <a href="${params.pipelineUrl}" style="color: #0073ea;">Otevřít příležitost v pipeline</a>
    </p>
  `);

  return {
    subject: `Nový požadavek z klientské zóny: ${params.contactName}`,
    html,
  };
}

export function newMessageAdvisorTemplate(params: {
  contactName: string;
  bodyPreview: string;
  messagesUrl: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Nová zpráva od klienta</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Máte novou zprávu od klienta <strong>${params.contactName}</strong>.
    </p>
    <p style="font-size: 14px; line-height: 1.5; color: #676879; margin: 12px 0;">
      ${params.bodyPreview}
    </p>
    <p style="font-size: 14px;">
      <a href="${params.messagesUrl}" style="color: #0073ea;">Otevřít konverzaci v portálu</a>
    </p>
  `);

  return {
    subject: `Nová zpráva od klienta: ${params.contactName}`,
    html,
  };
}

export function paymentInstructionTemplate(params: {
  contactName: string;
  partnerName: string;
  accountNumber: string;
  contractNumber?: string;
  amount?: string;
  unsubscribeUrl?: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Platební instrukce</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Platební údaje pro <strong>${params.partnerName}</strong>:
    </p>
    <table style="font-size: 14px; border-collapse: collapse;">
      <tr><td style="padding: 4px 12px 4px 0; color: #676879;">Číslo účtu:</td><td><strong>${params.accountNumber}</strong></td></tr>
      ${params.contractNumber ? `<tr><td style="padding: 4px 12px 4px 0; color: #676879;">Č. smlouvy:</td><td>${params.contractNumber}</td></tr>` : ""}
      ${params.amount ? `<tr><td style="padding: 4px 12px 4px 0; color: #676879;">Částka:</td><td>${params.amount} Kč</td></tr>` : ""}
    </table>
    ${params.unsubscribeUrl ? `<p style="font-size: 12px; margin-top: 16px;"><a href="${params.unsubscribeUrl}" style="color: #676879;">Odhlásit se z notifikací</a></p>` : ""}
  `);

  return {
    subject: `Platební instrukce – ${params.partnerName}`,
    html,
  };
}

export function requestMissingDataTemplate(params: {
  contactName: string;
  missingFields: string[];
  documentName?: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const fieldsList = params.missingFields.map((f) => `<li>${f}</li>`).join("");
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Doplnění údajů</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Dobrý den, pane/paní <strong>${params.contactName}</strong>,
    </p>
    <p style="font-size: 14px; line-height: 1.5;">
      po zpracování ${params.documentName ? `dokumentu <strong>${params.documentName}</strong>` : "Vašeho dokumentu"}
      nám chybí následující údaje:
    </p>
    <ul style="font-size: 14px; line-height: 1.6;">${fieldsList}</ul>
    <p style="font-size: 14px;">Prosíme o jejich doplnění co nejdříve.</p>
    ${params.advisorName ? `<p style="font-size: 14px;">S pozdravem, ${params.advisorName}</p>` : ""}
    ${params.unsubscribeUrl ? `<p style="font-size: 12px;"><a href="${params.unsubscribeUrl}" style="color: #676879;">Odhlásit se z notifikací</a></p>` : ""}
  `);
  return { subject: `Doplnění údajů – ${params.contactName}`, html };
}

export function reviewFollowupTemplate(params: {
  contactName: string;
  reviewFileName: string;
  reviewStatus: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Stav kontroly dokumentu</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Dokument <strong>${params.reviewFileName}</strong> byl zkontrolován.
    </p>
    <p style="font-size: 14px;">Aktuální stav: <strong>${params.reviewStatus}</strong></p>
    <p style="font-size: 14px;">V případě dotazů se obraťte na svého poradce.</p>
    ${params.advisorName ? `<p style="font-size: 14px;">S pozdravem, ${params.advisorName}</p>` : ""}
    ${params.unsubscribeUrl ? `<p style="font-size: 12px;"><a href="${params.unsubscribeUrl}" style="color: #676879;">Odhlásit se z notifikací</a></p>` : ""}
  `);
  return { subject: `Výsledek kontroly – ${params.reviewFileName}`, html };
}

export function policyStatusUpdateTemplate(params: {
  contactName: string;
  policyName: string;
  status: string;
  detail?: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Aktualizace stavu pojistky</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Pojistka <strong>${params.policyName}</strong> pro <strong>${params.contactName}</strong>:
    </p>
    <p style="font-size: 14px;">Stav: <strong>${params.status}</strong></p>
    ${params.detail ? `<p style="font-size: 14px; color: #676879;">${params.detail}</p>` : ""}
    ${params.advisorName ? `<p style="font-size: 14px;">S pozdravem, ${params.advisorName}</p>` : ""}
    ${params.unsubscribeUrl ? `<p style="font-size: 12px;"><a href="${params.unsubscribeUrl}" style="color: #676879;">Odhlásit se z notifikací</a></p>` : ""}
  `);
  return { subject: `Status pojistky – ${params.policyName}`, html };
}

export function reminderBeforeDeadlineTemplate(params: {
  contactName: string;
  deadlineType: string;
  deadlineDate: string;
  advisorName?: string;
  unsubscribeUrl?: string;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Připomínka blížícího se termínu</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Blíží se termín <strong>${params.deadlineType}</strong> pro <strong>${params.contactName}</strong>:
      <strong>${params.deadlineDate}</strong>.
    </p>
    <p style="font-size: 14px;">Termín se blíží — zkontrolujte prosím stav v aplikaci.</p>
    ${params.advisorName ? `<p style="font-size: 14px;">S pozdravem, ${params.advisorName}</p>` : ""}
    ${params.unsubscribeUrl ? `<p style="font-size: 12px;"><a href="${params.unsubscribeUrl}" style="color: #676879;">Odhlásit se z notifikací</a></p>` : ""}
  `);
  return { subject: `Připomínka: ${params.deadlineType} – ${params.contactName}`, html };
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
  const who = params.tenantName?.trim() ? params.tenantName.trim() : "váš poradce";
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Váš přístup do klientské zóny je připravený</h2>
    <p style="font-size: 14px; line-height: 1.5;">
      Dobrý den${params.contactFirstName ? `, ${params.contactFirstName}` : ""},
    </p>
    <p style="font-size: 14px; line-height: 1.5;">
      ${who} vám zpřístupnil(a) klientskou zónu v&nbsp;Aidvisoře — přehled smluv, dokumentů a&nbsp;zpráv na jednom místě.
    </p>
    <p style="font-size: 14px; line-height: 1.5;">
      ${
        params.reusedExistingAccount
          ? "Přístup byl znovu připraven a dočasné heslo obnoveno."
          : "Účet je připravený a můžete se ihned přihlásit."
      }
      Odkaz je platný <strong>${params.expiresInDays} dní</strong>.
    </p>
    <div style="margin: 18px 0; padding: 14px 16px; border-radius: 12px; background: #f4f7ff; border: 1px solid #dbe5ff;">
      <p style="margin: 0 0 8px; font-size: 13px; color: #44546f;"><strong>Přihlašovací e-mail</strong></p>
      <p style="margin: 0 0 12px; font-size: 14px; color: #172b4d;">${params.loginEmail}</p>
      <p style="margin: 0 0 8px; font-size: 13px; color: #44546f;"><strong>Dočasné heslo</strong></p>
      <p style="margin: 0; font-size: 18px; letter-spacing: 1px; font-weight: 700; color: #172b4d;">${params.temporaryPassword}</p>
    </div>
    <p style="font-size: 14px; line-height: 1.5; margin-bottom: 4px;">
      <strong>Jak to funguje:</strong>
    </p>
    <ol style="font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 0 0 16px;">
      <li>Klikněte na tlačítko níže a zadejte e-mail + dočasné heslo</li>
      <li>Nastavíte si vlastní heslo</li>
      <li>Jste v klientské zóně</li>
    </ol>
    <p style="margin: 20px 0;">
      <a href="${params.registerUrl}" style="display: inline-block; padding: 12px 24px; background: #0073ea; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Dokončit přístup</a>
    </p>
    <p style="font-size: 12px; line-height: 1.5; color: #676879;">
      Pokud tlačítko nefunguje, zkopírujte odkaz do prohlížeče:<br />
      <span style="word-break: break-all;">${params.registerUrl}</span>
    </p>
    <p style="font-size: 12px; line-height: 1.5; color: #676879; margin-top: 16px;">
      <a href="${params.gdprUrl}" style="color: #0073ea;">Zásady zpracování osobních údajů</a>
    </p>
  `);
  return {
    subject: "Přístup do klientské zóny je připravený — Aidvisora",
    html,
  };
}

export function internalSummaryTemplate(params: {
  advisorName: string;
  summaryDate: string;
  urgentCount: number;
  pendingReviewCount: number;
  overdueTaskCount: number;
  blockedPaymentCount: number;
}) {
  const html = layout(`
    <h2 style="font-size: 16px; margin: 0 0 12px;">Denní souhrn – ${params.summaryDate}</h2>
    <p style="font-size: 14px; line-height: 1.5;">Dobrý den, ${params.advisorName},</p>
    <table style="font-size: 14px; border-collapse: collapse;">
      <tr><td style="padding: 4px 12px 4px 0; color: #676879;">Urgentní položky:</td><td><strong>${params.urgentCount}</strong></td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #676879;">Čekající review:</td><td><strong>${params.pendingReviewCount}</strong></td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #676879;">Úkoly po termínu:</td><td><strong>${params.overdueTaskCount}</strong></td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #676879;">Blokované platby:</td><td><strong>${params.blockedPaymentCount}</strong></td></tr>
    </table>
    <p style="font-size: 14px; margin-top: 12px;">Přihlaste se do Aidvisora pro detail.</p>
  `);
  return { subject: `Denní souhrn – ${params.summaryDate}`, html };
}
