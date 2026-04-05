import type { BirthdaySalutationResult } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Bez auto-skloňování: pokud není ruční preferred_salutation, použij jen „Dobrý den,“.
 */
/** První řádek těla jako prostý text (pro šablonu a textarea). */
export function birthdayOpeningLinePlain(params: {
  preferredSalutation: string | null | undefined;
}): string {
  const manual = params.preferredSalutation?.trim();
  if (manual) return `Dobrý den, ${manual}`;
  return "Dobrý den,";
}

export function resolveBirthdaySalutation(params: {
  preferredSalutation: string | null | undefined;
  preferredGreetingName: string | null | undefined;
}): BirthdaySalutationResult {
  const manual = params.preferredSalutation?.trim();
  const shortManual = params.preferredGreetingName?.trim();

  if (manual) {
    const safe = escapeHtml(manual);
    return {
      openingLineHtml: `Dobrý den, ${safe}`,
      salutationShort: shortManual ?? null,
    };
  }

  return {
    openingLineHtml: "Dobrý den,",
    salutationShort: null,
  };
}

export function defaultBirthdaySubject(salutationShort: string | null): string {
  if (salutationShort?.trim()) {
    return `Všechno nejlepší k narozeninám, ${salutationShort.trim()}`;
  }
  return "Všechno nejlepší k narozeninám";
}

export function defaultBirthdayBodyPlain(openingLine: string): string {
  const rest = `k dnešním narozeninám Vám chci popřát pevné zdraví, mnoho radosti a ať se Vám daří v osobním i pracovním životě.

Přeji Vám, aby byl Váš dnešní den plný milých setkání, klidu a příjemných okamžiků a aby se Vám i v dalším roce dařilo přesně tak, jak si přejete.

S pozdravem`;

  if (openingLine === "Dobrý den,") {
    return `${openingLine}\n\n${rest}`;
  }
  return `${openingLine}\n\n${rest}`;
}
