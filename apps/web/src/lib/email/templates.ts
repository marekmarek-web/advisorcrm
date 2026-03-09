/**
 * Email templates for WePlan notifications.
 * Each returns { subject, html } ready for sendEmail().
 */

function layout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8" /><title>WePlan</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #323338; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <div style="margin-bottom: 16px; font-size: 14px; font-weight: 600; color: #0073ea;">WePlan</div>
    ${bodyHtml}
    <hr style="border: none; border-top: 1px solid #e6e9ef; margin: 24px 0;" />
    <div style="font-size: 11px; color: #676879;">
      Tento e-mail byl odeslán automaticky systémem WePlan. Pokud si nepřejete dostávat oznámení,
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
    <p style="font-size: 14px;">Přihlaste se do WePlan a naplánujte schůzku nebo aktualizujte servisní cyklus.</p>
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
