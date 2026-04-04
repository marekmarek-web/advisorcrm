import "server-only";

import { sendEmail } from "@/lib/email/send-email";

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

  const clientHtml = `
    <p>Dobrý den, ${safeName},</p>
    <p>potvrzujeme váš vybraný termín schůzky: <strong>${escapeHtml(when)}</strong> (časové pásmo Europe/Prague).</p>
    <p>Poradce: <strong>${safeAdvisor}</strong>${opts.companyName ? ` (${safeCompany})` : ""}.</p>
    <p>Pokud potřebujete termín změnit, kontaktujte prosím poradce přímo.</p>
    <p style="color:#64748b;font-size:12px;margin-top:24px">Tato zpráva byla odeslána automaticky po rezervaci přes odkaz.</p>
  `;

  try {
    await sendEmail({
      to: opts.clientEmail,
      subject: `Potvrzení termínu schůzky — ${when}`,
      html: clientHtml,
    });
  } catch {
    /* ignore */
  }

  if (!opts.advisorEmail?.trim()) return;

  const advHtml = `
    <p>Nová rezervace přes veřejný odkaz.</p>
    <p><strong>Klient:</strong> ${safeName}<br/>
    <strong>E-mail:</strong> ${escapeHtml(opts.clientEmail)}<br/>
    <strong>Termín:</strong> ${escapeHtml(when)}</p>
    <p>Událost je zapsaná ve vašem kalendáři v Aidvisoře.</p>
  `;

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
