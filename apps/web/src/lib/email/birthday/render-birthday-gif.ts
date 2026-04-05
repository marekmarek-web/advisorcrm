import type { BirthdayEmailBuildInput } from "./types";

function preheaderBlock(text: string): string {
  if (!text) return "";
  return `<div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${text}</div>`;
}

export function renderBirthdayGifEmail(input: BirthdayEmailBuildInput): string {
  const gif = input.gifAbsoluteUrl;
  const advisorBits = [input.advisorPhone, input.advisorWebsite].filter(Boolean).join(" · ");

  const logoBlock = input.headerLogoAbsoluteUrl
    ? `<div style="margin-bottom:12px;"><img src="${input.headerLogoAbsoluteUrl}" alt="Aidvisory" width="120" style="display:inline-block;height:auto;max-width:120px;" /></div>`
    : "";

  const gifRow =
    gif &&
    `<tr><td style="padding:0 24px 16px;background:#fffbeb;">
      <img src="${gif}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:12px;" />
    </td></tr>`;

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#fff7ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${preheaderBlock(input.preheader)}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7ed;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;border-radius:18px;overflow:hidden;border:1px solid #fed7aa;box-shadow:0 8px 30px rgba(234,88,12,0.12);">
          <tr>
            <td style="background:linear-gradient(90deg,#fb923c,#f97316);padding:20px 24px;text-align:center;">
              ${logoBlock}
              <span style="font-size:17px;font-weight:800;color:#fff;letter-spacing:-0.02em;">🎂 Narozeniny</span>
            </td>
          </tr>
          ${gifRow || ""}
          <tr>
            <td style="background:#ffffff;padding:24px 24px 8px;">
              ${input.bodyParagraphsHtml}
              <p style="margin:8px 0 0;line-height:1.55;font-size:15px;color:#1e293b;">${input.advisorDisplayName}</p>
              ${input.advisorRoleLine ? `<p style="margin:4px 0 0;line-height:1.5;font-size:14px;color:#64748b;">${input.advisorRoleLine}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="background:#fffbeb;padding:18px 24px 22px;border-top:1px solid #fde68a;">
              <p style="margin:0 0 8px;font-size:13px;color:#78350f;line-height:1.5;">Kontakt na vašeho poradce${advisorBits ? `: ${advisorBits}` : ""}</p>
              <p style="margin:0;font-size:12px;color:#b45309;"><a href="${input.portalSiteUrl}" style="color:#c2410c;text-decoration:none;font-weight:600;">${input.portalSiteLabel}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
