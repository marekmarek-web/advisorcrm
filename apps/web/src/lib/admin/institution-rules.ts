/**
 * Institution rules (Plan 8C.3).
 * Profiles and rules for Czech insurance and financial institutions.
 */

export type PaymentConventions = {
  preferredAccountFormat: "iban" | "czech_local" | "both";
  requiresVariableSymbol: boolean;
  requiresConstantSymbol: boolean;
  requiresSpecificSymbol: boolean;
  currencyCode: string;
};

export type ApplyStrictnessOverride = "low" | "medium" | "high" | "strict" | "institution_default";

export type InstitutionApplyRules = {
  institutionCode: string;
  applyStrictness: ApplyStrictnessOverride;
  requireHumanReviewAlways: boolean;
  minExtractionConfidence: number;
  minClassificationConfidence: number;
  requireDualApprovalAbove?: ApplyStrictnessOverride;
};

export type ExtractionHints = {
  institutionCode: string;
  contractNumberLocation?: string;
  clientNumberLocation?: string;
  ibanLocation?: string;
  amountLocation?: string;
  validFromLocation?: string;
};

export type InstitutionProfile = {
  code: string;
  canonicalName: string;
  aliases: string[];
  documentMarkers: string[];
  paymentConventions: PaymentConventions;
  requiredIdentifiers: string[];
  specialValidation: string[];
  alwaysRequireHumanReview: boolean;
  country: string;
};

export const INSTITUTION_PROFILES: InstitutionProfile[] = [
  {
    code: "CPOJ",
    canonicalName: "Česká pojišťovna",
    aliases: ["Ceska pojistovna", "CP", "ČP"],
    documentMarkers: ["Česká pojišťovna", "ceska pojistovna", "cp.cz"],
    paymentConventions: {
      preferredAccountFormat: "czech_local",
      requiresVariableSymbol: true,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber", "variableSymbol"],
    specialValidation: ["contractNumber:CP-[0-9]{10}"],
    alwaysRequireHumanReview: false,
    country: "CZ",
  },
  {
    code: "KOOP",
    canonicalName: "Kooperativa pojišťovna",
    aliases: ["Kooperativa", "Koop", "KOOPERATIVA"],
    documentMarkers: ["Kooperativa", "kooperativa.cz", "KOOP"],
    paymentConventions: {
      preferredAccountFormat: "czech_local",
      requiresVariableSymbol: true,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber", "variableSymbol"],
    specialValidation: [],
    alwaysRequireHumanReview: false,
    country: "CZ",
  },
  {
    code: "ALLIANZ",
    canonicalName: "Allianz pojišťovna",
    aliases: ["Allianz", "allianz.cz"],
    documentMarkers: ["Allianz", "allianz.cz"],
    paymentConventions: {
      preferredAccountFormat: "iban",
      requiresVariableSymbol: false,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber", "iban"],
    specialValidation: [],
    alwaysRequireHumanReview: false,
    country: "CZ",
  },
  {
    code: "UNIQA",
    canonicalName: "UNIQA pojišťovna",
    aliases: ["Uniqa", "UNIQA", "uniqa.cz"],
    documentMarkers: ["UNIQA", "uniqa.cz"],
    paymentConventions: {
      preferredAccountFormat: "iban",
      requiresVariableSymbol: false,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber"],
    specialValidation: [],
    alwaysRequireHumanReview: false,
    country: "CZ",
  },
  {
    code: "GENERALI",
    canonicalName: "Generali Česká pojišťovna",
    aliases: ["Generali", "Generali CP", "generali.cz"],
    documentMarkers: ["Generali", "generali.cz", "Generali Česká"],
    paymentConventions: {
      preferredAccountFormat: "iban",
      requiresVariableSymbol: false,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber"],
    specialValidation: [],
    alwaysRequireHumanReview: false,
    country: "CZ",
  },
  {
    code: "NN",
    canonicalName: "NN pojišťovna",
    aliases: ["NN", "ING pojišťovna", "nn.cz"],
    documentMarkers: ["NN pojišťovna", "nn.cz"],
    paymentConventions: {
      preferredAccountFormat: "iban",
      requiresVariableSymbol: false,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber"],
    specialValidation: [],
    alwaysRequireHumanReview: false,
    country: "CZ",
  },
  {
    code: "CSOB",
    canonicalName: "ČSOB pojišťovna",
    aliases: ["CSOB", "ČSOB", "csob.cz"],
    documentMarkers: ["ČSOB pojišťovna", "csob.cz"],
    paymentConventions: {
      preferredAccountFormat: "iban",
      requiresVariableSymbol: true,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber", "variableSymbol"],
    specialValidation: [],
    alwaysRequireHumanReview: false,
    country: "CZ",
  },
  {
    code: "METLIFE",
    canonicalName: "MetLife pojišťovna",
    aliases: ["MetLife", "metlife.cz"],
    documentMarkers: ["MetLife", "metlife.cz"],
    paymentConventions: {
      preferredAccountFormat: "iban",
      requiresVariableSymbol: false,
      requiresConstantSymbol: false,
      requiresSpecificSymbol: false,
      currencyCode: "CZK",
    },
    requiredIdentifiers: ["contractNumber"],
    specialValidation: [],
    alwaysRequireHumanReview: true,
    country: "CZ",
  },
];

const DEFAULT_APPLY_RULES: InstitutionApplyRules = {
  institutionCode: "DEFAULT",
  applyStrictness: "medium",
  requireHumanReviewAlways: false,
  minExtractionConfidence: 0.5,
  minClassificationConfidence: 0.55,
};

const INSTITUTION_APPLY_RULES: Record<string, InstitutionApplyRules> = {
  METLIFE: {
    institutionCode: "METLIFE",
    applyStrictness: "strict",
    requireHumanReviewAlways: true,
    minExtractionConfidence: 0.75,
    minClassificationConfidence: 0.8,
  },
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function getInstitutionProfile(name: string): InstitutionProfile | null {
  const normalizedInput = normalize(name);

  for (const profile of INSTITUTION_PROFILES) {
    if (normalize(profile.canonicalName) === normalizedInput) return profile;
    for (const alias of profile.aliases) {
      if (normalize(alias) === normalizedInput) return profile;
    }
  }

  // Partial match fallback
  for (const profile of INSTITUTION_PROFILES) {
    if (normalize(profile.canonicalName).includes(normalizedInput) ||
        normalizedInput.includes(normalize(profile.canonicalName))) {
      return profile;
    }
    for (const alias of profile.aliases) {
      if (normalize(alias).includes(normalizedInput) ||
          normalizedInput.includes(normalize(alias))) {
        return profile;
      }
    }
  }

  return null;
}

export function getInstitutionApplyRules(institutionCode: string): InstitutionApplyRules {
  return INSTITUTION_APPLY_RULES[institutionCode] ?? {
    ...DEFAULT_APPLY_RULES,
    institutionCode,
  };
}

export function getInstitutionExtractionHints(institutionCode: string): ExtractionHints {
  // Currently returns stub hints - would be populated with real extraction location hints
  return {
    institutionCode,
    contractNumberLocation: "top-right",
    ibanLocation: "payment section",
  };
}

export function detectInstitutionFromText(text: string): InstitutionProfile | null {
  const normalizedText = normalize(text);

  for (const profile of INSTITUTION_PROFILES) {
    for (const marker of profile.documentMarkers) {
      if (normalizedText.includes(normalize(marker))) return profile;
    }
  }

  return null;
}

export function getAllInstitutions(): InstitutionProfile[] {
  return [...INSTITUTION_PROFILES];
}
