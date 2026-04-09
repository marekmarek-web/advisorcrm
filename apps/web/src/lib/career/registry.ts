import type { CareerPositionDef, CareerProgramId, CareerTrackId } from "./types";
import { BEPLAN_TOP_PORADCE } from "./beplan-top-poradce";
import { BEPLAN_MANAGEMENT } from "./beplan-management";
import { BEPLAN_REALITY } from "./beplan-reality";
import { PREMIUM_BROKERS_INDIVIDUAL } from "./premium-brokers-individual";
import { PREMIUM_BROKERS_MANAGEMENT } from "./premium-brokers-management";
import { PREMIUM_BROKERS_CALL_CENTER } from "./premium-brokers-call-center";

const ALL_DEFS: CareerPositionDef[] = [
  ...BEPLAN_TOP_PORADCE,
  ...BEPLAN_MANAGEMENT,
  ...BEPLAN_REALITY,
  ...PREMIUM_BROKERS_INDIVIDUAL,
  ...PREMIUM_BROKERS_MANAGEMENT,
  ...PREMIUM_BROKERS_CALL_CENTER,
];

type RegistryKey = string;

function k(programId: CareerProgramId, trackId: CareerTrackId, code: string): RegistryKey {
  return `${programId}::${trackId}::${code}`;
}

const byKey = new Map<RegistryKey, CareerPositionDef>();

function registerDef(def: CareerPositionDef, extraCodes: string[] = []) {
  byKey.set(k(def.programId, def.trackId, def.code), def);
  for (const alt of extraCodes) {
    byKey.set(k(def.programId, def.trackId, alt), def);
  }
}

for (const def of ALL_DEFS) {
  registerDef(def);
}

/** Starý kombinovaný finanční žebříček → nové kódy + správná větev */
const BEPLAN_TP_LEGACY: Record<string, string> = {
  BP_FIN_T1: "BP_TP_1",
  BP_FIN_T2: "BP_TP_2",
};
const BEPLAN_MS_LEGACY: Record<string, string> = {
  BP_FIN_R1: "BP_MS_R1",
  BP_FIN_VR2: "BP_MS_VR2",
  BP_FIN_VR3: "BP_MS_VR3",
  BP_FIN_VR4: "BP_MS_VR4",
  BP_FIN_M1: "BP_MS_M1",
  BP_FIN_M1P: "BP_MS_M1P",
  BP_FIN_M2: "BP_MS_M2",
  BP_FIN_D1: "BP_MS_D1",
  BP_FIN_D2: "BP_MS_D2",
  BP_FIN_D3: "BP_MS_D3",
};

for (const def of BEPLAN_TOP_PORADCE) {
  const legacy = Object.entries(BEPLAN_TP_LEGACY).find(([, canonical]) => canonical === def.code)?.[0];
  if (legacy) registerDef(def, [legacy]);
}
for (const def of BEPLAN_MANAGEMENT) {
  const legacy = Object.entries(BEPLAN_MS_LEGACY).find(([, canonical]) => canonical === def.code)?.[0];
  if (legacy) registerDef(def, [legacy]);
}

export function getCareerPositionDef(
  programId: CareerProgramId,
  trackId: CareerTrackId,
  code: string
): CareerPositionDef | null {
  if (programId === "not_set" || programId === "unknown" || trackId === "not_set" || trackId === "unknown") {
    return null;
  }
  return byKey.get(k(programId, trackId, code)) ?? null;
}

export function listCareerPositions(programId: CareerProgramId, trackId: CareerTrackId): CareerPositionDef[] {
  if (programId === "not_set" || programId === "unknown" || trackId === "not_set" || trackId === "unknown") {
    return [];
  }
  return ALL_DEFS.filter((d) => d.programId === programId && d.trackId === trackId).sort(
    (a, b) => a.progressionOrder - b.progressionOrder
  );
}

export function isKnownCareerProgramId(v: string): v is CareerProgramId {
  return v === "not_set" || v === "beplan" || v === "premium_brokers" || v === "unknown";
}

export function isKnownCareerTrackId(v: string): v is CareerTrackId {
  return (
    v === "not_set" ||
    v === "individual_performance" ||
    v === "management_structure" ||
    v === "reality" ||
    v === "call_center" ||
    v === "unknown"
  );
}

/** Normalizace hodnot z DB včetně legacy career_program */
export function normalizeCareerProgramFromDb(raw: string | null): {
  programId: CareerProgramId;
  legacyRaw: string | null;
} {
  if (raw == null || raw.trim() === "") return { programId: "not_set", legacyRaw: null };
  const t = raw.trim();
  if (t === "beplan_finance" || t === "beplan_realty") return { programId: "beplan", legacyRaw: t };
  if (t === "premium_brokers_call_center") return { programId: "premium_brokers", legacyRaw: t };
  if (t === "beplan") return { programId: "beplan", legacyRaw: null };
  if (t === "premium_brokers") return { programId: "premium_brokers", legacyRaw: null };
  if (t === "not_set") return { programId: "not_set", legacyRaw: null };
  if (isKnownCareerProgramId(t)) return { programId: t, legacyRaw: null };
  return { programId: "unknown", legacyRaw: t };
}

/**
 * Doplnění větve z legacy programu jen tam, kde je to jednoznačné.
 * beplan_finance + prázdný track → stále not_set (nutný explicitní výběr TP vs manažerské vs realita).
 */
export function inferTrackFromLegacyProgram(
  legacyProgramRaw: string | null,
  currentTrack: CareerTrackId
): { trackId: CareerTrackId; inferred: boolean } {
  if (currentTrack !== "not_set") return { trackId: currentTrack, inferred: false };
  if (legacyProgramRaw === "beplan_realty") return { trackId: "reality", inferred: true };
  if (legacyProgramRaw === "premium_brokers_call_center") return { trackId: "call_center", inferred: true };
  return { trackId: "not_set", inferred: false };
}

/** Heuristika jen pro Beplan: z kódu pozice odhadnout větev, pokud track v DB chybí (bez záruky). */
export function inferBeplanTrackFromPositionCode(code: string | null): CareerTrackId {
  if (!code?.trim()) return "not_set";
  const c = code.trim();
  if (c.startsWith("BP_RE_")) return "reality";
  if (Object.prototype.hasOwnProperty.call(BEPLAN_TP_LEGACY, c) || c.startsWith("BP_TP_")) {
    return "individual_performance";
  }
  if (c.startsWith("BP_MS_") || Object.prototype.hasOwnProperty.call(BEPLAN_MS_LEGACY, c)) {
    return "management_structure";
  }
  if (c.startsWith("BP_FIN_")) return "management_structure";
  return "not_set";
}
