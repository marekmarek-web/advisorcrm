export type BirthdayEmailTheme = "premium_dark" | "birthday_gif";

export const BIRTHDAY_TEMPLATE_LOG_KEY = "birthday_greeting_v2";

/** Soubory v `public/` — PNG má přednost (kvalita); GIF jako fallback. */
export const BIRTHDAY_DECOR_IMAGE_FILENAMES = ["birthday-freepik.png", "birthday-freepik.gif"] as const;

export function isBirthdayEmailTheme(v: string | null | undefined): v is BirthdayEmailTheme {
  return v === "premium_dark" || v === "birthday_gif";
}

export type BirthdaySalutationResult = {
  /** První řádek těla: buď „Dobrý den, …“ s ručním oslovením, nebo „Dobrý den,“ */
  openingLineHtml: string;
  /** Pro předmět — jen pokud je bezpečně zadané preferred_greeting_name */
  salutationShort: string | null;
};

export type BirthdayEmailBuildInput = {
  theme: BirthdayEmailTheme;
  /** Absolutní URL gifu, pokud theme birthday_gif a soubor existuje */
  gifAbsoluteUrl: string | null;
  preheader: string;
  /** HTML odstavců hlavního textu (už escapované) */
  bodyParagraphsHtml: string;
  advisorDisplayName: string;
  advisorRoleLine: string;
  advisorPhone: string | null;
  advisorWebsite: string | null;
  portalSiteLabel: string;
  portalSiteUrl: string;
  /** Absolutní URL loga pro tmavou hlavičku, nebo null → textový název */
  headerLogoAbsoluteUrl: string | null;
};
