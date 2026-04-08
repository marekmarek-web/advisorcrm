/**
 * Classifier: z vytěžených polí (productName, productTypeRaw, volný text)
 * navrhne kanonický segment smlouvy.
 *
 * Pracuje čistě lokálně (bez AI/DB) – rychlá heuristika nad klíčovými slovy.
 * Výsledek je návrh; poradce ho musí potvrdit nebo upravit ručně.
 */

import { SEGMENT_LABELS } from "@/app/lib/segment-labels";

export interface SegmentClassification {
  /** Kanonický segment code (shodný s SEGMENT_LABELS) nebo null, pokud nelze určit. */
  segment: string | null;
  /** 0–1; < 0.4 = nizka jistota → požádat uživatele o ručné potvrzení. */
  confidence: number;
  /** Lidsky čitelné vysvětlení (pro debug banner). */
  reason: string;
}

interface SegmentRule {
  segment: string;
  patterns: RegExp[];
}

const RULES: SegmentRule[] = [
  {
    segment: "AUTO_PR",
    patterns: [
      /povinné ručení/i,
      /povinné pojistné.*vozidl/i,
      /odpovědnost.*provoz.*vozidl/i,
      /odpovědnost z provozu/i,
      /\bmtpl\b/i,
      /motor third/i,
      /zák[ao]nn[áe] odpovědnost.*auto/i,
      /pojišt.*odpovědnost.*provoz/i,
    ],
  },
  {
    segment: "AUTO_HAV",
    patterns: [
      /havarijní/i,
      /\bcasco\b/i,
      /\bkasko\b/i,
      /havarijko/i,
      /pojišt.*vozidla.*havárie/i,
      /auto.*škoda.*pojišt/i,
    ],
  },
  {
    segment: "MAJ",
    patterns: [
      /domácnost/i,
      /nemovitost/i,
      /dům.*pojišt/i,
      /byt.*pojišt/i,
      /pojišt.*domu/i,
      /pojišt.*bytu/i,
      /majetk(ové|á)/i,
      /stavba/i,
      /rekreační objekt/i,
      /chata.*pojišt/i,
      /chalupa.*pojišt/i,
      /rodinný dům/i,
      /bytová jednotka/i,
    ],
  },
  {
    segment: "ODP",
    patterns: [
      /občanská odpovědnost/i,
      /profesní odpovědnost/i,
      /odpovědnost za škodu/i,
      /odpovědnost z výkonu/i,
      /pojišt.*odpovědnost(?!.*provoz)/i,
      /liability insurance/i,
    ],
  },
  {
    segment: "ZP",
    patterns: [
      /životní pojišt/i,
      /life insurance/i,
      /životko/i,
      /investiční životní/i,
      /kapitálové životní/i,
      /rizikové životní/i,
      /smíšené životní/i,
      /úrazové pojišt/i,
      /pojišt.*invalidity/i,
      /pojišt.*práce?neschopnosti/i,
      /pojišt.*práceschopnosti/i,
      /pojišt.*závažn/i,
      /pojišt.*nemoci/i,
      /pojišt.*kritick/i,
      /pojišt.*smrt/i,
      /pojišt.*dožití/i,
      /pojišt.*úraz/i,
    ],
  },
  {
    segment: "CEST",
    patterns: [
      /cestovní pojišt/i,
      /travel.*insurance/i,
      /pojišt.*cest/i,
      /pojišt.*zahranič/i,
      /pojišt.*dovolená/i,
    ],
  },
  {
    segment: "DPS",
    patterns: [
      /doplňkové penzijní spoření/i,
      /penzijní připojištění/i,
      /transformovaný fond/i,
      /\bdps\b/i,
      /penzijní spoření/i,
    ],
  },
  {
    segment: "DIP",
    patterns: [
      /dlouhodobý investiční produkt/i,
      /\bdip\b/i,
    ],
  },
  {
    segment: "INV",
    patterns: [
      /investiční fond/i,
      /podílové listy/i,
      /investiční produkt/i,
      /portfolio.*pojišt/i,
      /unit.link/i,
    ],
  },
  {
    segment: "HYPO",
    patterns: [
      /hypotéka/i,
      /hypoteční úvěr/i,
      /mortgage/i,
      /hypoteční smlouva/i,
    ],
  },
  {
    segment: "UVER",
    patterns: [
      /spotřebitelský úvěr/i,
      /splátkový úvěr/i,
      /půjčka/i,
      /kontokorent/i,
      /úvěrová smlouva/i,
    ],
  },
  {
    segment: "FIRMA_POJ",
    patterns: [
      /pojišt.*podnikat/i,
      /pojišt.*firmy/i,
      /pojišt.*podnikání/i,
      /podnikatelské pojišt/i,
      /živnostník/i,
      /komerční pojišt/i,
      /pojišt.*podniku/i,
    ],
  },
];

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((p) => p.test(text)).length;
}

/**
 * Klasifikuje segment smlouvy z textu (productName + productTypeRaw + volný text).
 * Vrátí nejlepší kandidát nebo { segment: null, confidence: 0 } pokud nelze určit.
 */
export function classifyInsuranceSegment(
  productName: string | null | undefined,
  productTypeRaw: string | null | undefined,
  additionalText?: string | null,
): SegmentClassification {
  const combined = [productName, productTypeRaw, additionalText]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!combined) {
    return { segment: null, confidence: 0, reason: "Žádný text pro klasifikaci segmentu." };
  }

  let bestSegment: string | null = null;
  let bestScore = 0;
  let secondScore = 0;

  for (const rule of RULES) {
    const score = countMatches(combined, rule.patterns);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestSegment = rule.segment;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (bestScore === 0 || bestSegment === null) {
    return { segment: null, confidence: 0, reason: "Žádná shoda s klíčovými slovy pro automatický návrh segmentu." };
  }

  // Confidence: čím větší náskok oproti druhému kandidátu, tím vyšší
  const gap = bestScore - secondScore;
  const raw = Math.min(0.95, bestScore * 0.25 + gap * 0.25);
  const confidence = parseFloat(raw.toFixed(2));
  const label = SEGMENT_LABELS[bestSegment] ?? bestSegment;

  return {
    segment: bestSegment,
    confidence,
    reason: `Nalezeno ${bestScore} klíčových slov → navrhován segment „${label}"${confidence < 0.5 ? " (nízká jistota, zkontrolujte)" : ""}.`,
  };
}
