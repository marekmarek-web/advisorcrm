import type { BirthdayEmailBuildInput } from "./types";

function preheaderBlock(text: string): string {
  if (!text) return "";
  return `<div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${text}</div>`;
}

export function renderPremiumDarkEmail(input: BirthdayEmailBuildInput): string {
  const logoBlock = input.headerLogoAbsoluteUrl
    ? `<img src="${input.headerLogoAbsoluteUrl}" alt="Aidvisory" width="140" style="display:block;height:auto;max-width:140px;" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#f8fafc;">Aidvisory</span>`;

  const advisorBits = [input.advisorPhone, input.advisorWebsite].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${preheaderBlock(input.preheader)}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);padding:28px 24px 20px;text-align:center;">
              ${logoBlock}
              <div style="margin-top:18px;display:inline-block;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,0.12);color:#e0e7ff;font-size:13px;font-weight:600;">✨ Všechno nejlepší!</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:28px 24px 8px;">
              ${input.bodyParagraphsHtml}
              <p style="margin:8px 0 0;line-height:1.55;font-size:15px;color:#1e293b;">${input.advisorDisplayName}</p>
              ${input.advisorRoleLine ? `<p style="margin:4px 0 0;line-height:1.5;font-size:14px;color:#64748b;">${input.advisorRoleLine}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 24px 24px;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:13px;color:#475569;line-height:1.5;">Kontakt na vašeho poradce${advisorBits ? `: ${advisorBits}` : ""}</p>
              <p style="margin:0;font-size:12px;color:#94a3b8;"><a href="${input.portalSiteUrl}" style="color:#5A4BFF;text-decoration:none;font-weight:600;">${input.portalSiteLabel}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
