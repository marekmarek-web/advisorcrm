/**
 * Veřejné popisy balíčků (landing, nápověda v CRM) — konzistentní s capability maticí.
 * Neobsahuje ceny; ty jsou v {@link public-pricing}.
 */

import type { PublicPlanKey } from "@/lib/billing/plan-catalog";

/** Krátký podnadpis pod názvem tarifu na webu. */
export const PUBLIC_PLAN_TAGLINE: Record<PublicPlanKey, string> = {
  start: "Aidvisory, kalendář, dokumenty v portálu a základní AI — u Startu bez klientského chatu a bez AI review PDF.",
  pro: "Gmail, Drive, plný portál (chat, požadavky), AI review PDF a pokročilý asistent; analýzy dle zapnutých modulů.",
  management: "Navíc týmové přehledy, produkce, KPI a manažerské reporty oproti Pro.",
};

/** Co balíček obsahuje (řádky s ✓). */
export const PUBLIC_PLAN_INCLUDES: Record<PublicPlanKey, readonly string[]> = {
  start: [
    "Aidvisory, pipeline, kalendář a úkoly",
    "Google Calendar sync",
    "Klientská zóna pro dokumenty",
    "Základní AI asistent a image intake",
  ],
  pro: [
    "Vše ze Startu",
    "Klientský chat a nové požadavky z portálu",
    "Gmail a Google Drive",
    "AI review PDF a pokročilý asistent (PDF, multi-step)",
    "Finanční analýzy a kalkulačky (dle modulů v aplikaci)",
  ],
  management: [
    "Vše z Pro",
    "Týmové přehledy a produkce",
    "KPI, manažerské a pokročilé reporty",
    "Řízení rolí, sdílené pohledy a týmový workflow v rámci workspace",
  ],
};

/** Co u nižšího plánu záměrně není — pro transparentní landing (Start). */
export const PUBLIC_PLAN_START_EXCLUDES: readonly string[] = [
  "Bez klientského chatu a požadavků z portálu",
  "Bez AI review PDF",
];

/** Jedna věta pod sekci tarifů v CRM (nastavení). */
export const PUBLIC_PRICING_SUMMARY_CS =
  "Veřejné tarify: Start 990 Kč / měs., Pro 1 990 Kč / měs., Management 3 490 Kč / měs. Při roční fakturaci sleva 20 % oproti součtu 12 měsíců. Trial 14 dní v úrovni Pro.";
