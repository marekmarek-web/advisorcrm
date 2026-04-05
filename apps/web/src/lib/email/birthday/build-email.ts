import type { BirthdayEmailBuildInput, BirthdayEmailTheme } from "./types";
import { plainTextToParagraphHtml, truncatePreheader, escapeHtmlText } from "./html-utils";
import { renderPremiumDarkEmail } from "./render-premium-dark";
import { renderBirthdayGifEmail } from "./render-birthday-gif";
import { resolveEmailHeaderLogoUrl, birthdayGifAbsoluteUrlIfExists } from "./public-urls";

export type BuildBirthdayEmailResult = {
  subject: string;
  preheader: string;
  html: string;
  theme: BirthdayEmailTheme;
  asset: string | null;
};

/**
 * Sestaví HTML e-mail z plain textu těla (včetně úvodního řádku) a metadat.
 */
export function buildBirthdayEmailHtml(params: {
  subject: string;
  bodyPlain: string;
  theme: BirthdayEmailTheme;
  /** Z resolveEffectiveBirthdayTheme */
  assetForMeta: string | null;
  advisorDisplayName: string;
  advisorRoleLine: string;
  advisorPhone: string | null;
  advisorWebsite: string | null;
}): BuildBirthdayEmailResult {
  const bodyParagraphsHtml = plainTextToParagraphHtml(params.bodyPlain);
  const preheader = truncatePreheader(
    params.bodyPlain.replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
  );

  const origin = getPublicSiteOrigin();
  const gifUrl = params.theme === "birthday_gif" ? birthdayGifAbsoluteUrlIfExists() : null;

  const input: BirthdayEmailBuildInput = {
    theme: params.theme,
    gifAbsoluteUrl: gifUrl,
    preheader,
    bodyParagraphsHtml,
    advisorDisplayName: escapeHtmlText(params.advisorDisplayName),
    advisorRoleLine: escapeHtmlText(params.advisorRoleLine),
    advisorPhone: params.advisorPhone ? escapeHtmlText(params.advisorPhone) : null,
    advisorWebsite: params.advisorWebsite ? escapeHtmlText(params.advisorWebsite) : null,
    portalSiteLabel: "Aidvisory",
    portalSiteUrl: origin,
    headerLogoAbsoluteUrl: resolveEmailHeaderLogoUrl(),
  };

  const html =
    params.theme === "birthday_gif" && gifUrl
      ? renderBirthdayGifEmail(input)
      : renderPremiumDarkEmail({ ...input, theme: "premium_dark", gifAbsoluteUrl: null });

  const effectiveTheme = params.theme === "birthday_gif" && gifUrl ? "birthday_gif" : "premium_dark";
  const asset = effectiveTheme === "birthday_gif" && gifUrl ? params.assetForMeta : null;

  return {
    subject: params.subject,
    preheader,
    html,
    theme: effectiveTheme,
    asset,
  };
}
