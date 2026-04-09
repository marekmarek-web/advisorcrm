import "server-only";

import { sendEmail } from "@/lib/email/send-email";
import { aidvisoraBrandEmailDocument } from "@/lib/email/templates";
import { getServerAppBaseUrl } from "@/lib/url/server-app-base-url";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBookingWhen(startAt: Date): string {
  return startAt.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Best-effort e-maily po veřejné rezervaci — nehází výjimku při výpadku Resendu.
 */
export async function sendPublicBookingNotifications(opts: {
  clientEmail: string;
  clientName: string;
  advisorEmail: string | null;
  advisorName: string;
  companyName: string;
  startAt: Date;
  endAt: Date;
}): Promise<void> {
  const when = formatBookingWhen(opts.startAt);
  const safeName = escapeHtml(opts.clientName);
  const safeAdvisor = escapeHtml(opts.advisorName);
  const safeCompany = escapeHtml(opts.companyName || "Aidvisora");
  const siteUrl = getServerAppBaseUrl();

  const clientBodyHtml = `
              <p style="margin:0 0 20px 0;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:#0B1021;">Dobrý den, ${safeName},</p>
              <p style="margin:0 0 28px 0;font-family:'Inter',sans-serif;font-size:16px;line-height:1.65;color:#475569;">
                potvrzujeme váš vybraný termín schůzky v <strong style="color:#0B1021;">Aidvisoře</strong>.
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:16px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background-color:#0B1021;color:#5A4BFF;border-radius:18px;padding:20px 24px;font-family:'Plus Jakarta Sans','Inter',sans-serif;font-size:20px;font-weight:800;line-height:1.35;text-align:center;max-width:100%;">
                      ${escapeHtml(when)}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px 0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#64748B;text-align:center;">
                Časové pásmo: Europe/Prague
              </p>

              <p style="margin:0 0 32px 0;font-family:'Inter',sans-serif;font-size:16px;line-height:1.65;color:#475569;">
                <strong style="color:#0B1021;">Poradce:</strong> ${safeAdvisor}${opts.companyName ? ` <span style="color:#64748B;">(${safeCompany})</span>` : ""}
              </p>

              <p style="margin:0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.5;color:#94A3B8;">
                Tato zpráva byla odeslána automaticky po rezervaci přes veřejný odkaz.
              </p>
  `;

  const clientSecondaryBox = `
                    <p style="margin:0 0 8px 0;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;color:#0B1021;text-transform:uppercase;letter-spacing:0.05em;">
                      Změna termínu
                    </p>
                    <p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.5;color:#64748B;">
                      Pokud potřebujete termín změnit, kontaktujte prosím poradce přímo.
                    </p>
  `;

  const clientHtml = aidvisoraBrandEmailDocument({
    metaTitle: "Potvrzení schůzky | Aidvisora",
    preheaderPlain: `Schůzka potvrzena: ${when}. Europe/Prague.`,
    badgePlain: "Potvrzení rezervace",
    headlinePlain: "Schůzka potvrzena",
    bodyHtml: clientBodyHtml,
    secondaryBoxHtml: clientSecondaryBox,
    siteUrl,
  });

  try {
    await sendEmail({
      to: opts.clientEmail,
      subject: `Potvrzení schůzky — ${when}`,
      html: clientHtml,
    });
  } catch {
    /* ignore */
  }

  if (!opts.advisorEmail?.trim()) return;

  const mailHref = `mailto:${encodeURIComponent(opts.clientEmail)}`;
  const advBodyHtml = `
              <p style="margin:0 0 20px 0;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:#0B1021;">Dobrý den,</p>
              <p style="margin:0 0 28px 0;font-family:'Inter',sans-serif;font-size:16px;line-height:1.65;color:#475569;">
                klient si právě vybral termín přes <strong style="color:#0B1021;">veřejný rezervační odkaz</strong>.
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 10px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.5;color:#475569;">
                      <strong style="color:#0B1021;">Klient:</strong> ${safeName}
                    </p>
                    <p style="margin:0 0 10px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.5;color:#475569;">
                      <strong style="color:#0B1021;">E-mail:</strong>
                      <a href="${mailHref}" style="color:#5A4BFF;text-decoration:none;font-weight:600;">${escapeHtml(opts.clientEmail)}</a>
                    </p>
                    <p style="margin:0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.5;color:#475569;">
                      <strong style="color:#0B1021;">Termín:</strong> ${escapeHtml(when)}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0 0;font-family:'Inter',sans-serif;font-size:16px;line-height:1.65;color:#475569;">
                Událost je zapsaná ve vašem kalendáři v Aidvisoře.
              </p>

              <p style="margin:24px 0 0 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.5;color:#94A3B8;">
                Tato zpráva byla odeslána automaticky po rezervaci přes veřejný odkaz.
              </p>
  `;

  const advHtml = aidvisoraBrandEmailDocument({
    metaTitle: "Nová rezervace | Aidvisora",
    preheaderPlain: `Nová webová rezervace: ${opts.clientName}.`,
    badgePlain: "Veřejná rezervace",
    headlinePlain: "Nová rezervace",
    bodyHtml: advBodyHtml,
    siteUrl,
  });

  try {
    await sendEmail({
      to: opts.advisorEmail.trim(),
      subject: `Nová webová rezervace — ${opts.clientName}`,
      html: advHtml,
    });
  } catch {
    /* ignore */
  }
}
