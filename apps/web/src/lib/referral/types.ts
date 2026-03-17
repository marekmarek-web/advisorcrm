/**
 * Referral system types (Phase 7).
 * Explainable model: no black-box scoring; all values from explicit queries.
 */

export type ReferralStatus = "pending" | "converted";

/** One contact that was referred by the source client (referredContacts list). */
export interface ReferredContactRow {
  id: string;
  name: string;
  createdAt: string;
  converted: boolean;
  valueCzk: number | null;
}

/** Summary for a client as referral source: who they referred, counts, value. */
export interface ReferralSummary {
  /** Who referred this client (if any). */
  referredByContactId: string | null;
  referredByContactName: string | null;
  referredBySourceText: string | null;
  /** Count of contacts this client referred (referral_contact_id = this id). */
  givenCount: number;
  /** Count of those that converted (client / won deal / contract). */
  convertedCount: number;
  /** Last referral date (max created_at of referred contacts). */
  lastReferralAt: string | null;
  /** Sum of expected_value from won opportunities of referred contacts (or null). */
  valueCzk: number | null;
  /** List of referred contacts with status. */
  referredContacts: ReferredContactRow[];
}

/** One signal for "good moment to ask for referral". */
export type ReferralRequestSignalType =
  | "won_deal_recent"
  | "meeting_recent"
  | "service_current"
  | "contract_anniversary_soon"
  | "long_relationship_recent_activity";

export interface ReferralRequestSignal {
  type: ReferralRequestSignalType;
  label: string;
  description: string;
}

/** Result of getReferralRequestSignals: may suggest asking for referral. */
export interface ReferralRequestSignalsResult {
  signals: ReferralRequestSignal[];
  /** If true, do not suggest (e.g. already asked recently, or not a client). */
  suppressReason: string | null;
}

/** Labels for signal types (Czech). */
export const REFERRAL_REQUEST_SIGNAL_LABELS: Record<ReferralRequestSignalType, string> = {
  won_deal_recent: "Obchod nedávno uzavřen",
  meeting_recent: "Nedávná schůzka",
  service_current: "Servis v pořádku",
  contract_anniversary_soon: "Blíží se výročí smlouvy",
  long_relationship_recent_activity: "Dlouhý vztah a nedávná aktivita",
};

/**
 * Determine if a referred contact (target) is "converted" based on lifecycle, opportunities, contracts.
 * Used when we have already loaded: contact.lifecycleStage, hasWonOpportunity, hasContract.
 */
export function isReferralConverted(params: {
  lifecycleStage: string | null;
  hasWonOpportunity: boolean;
  hasContract: boolean;
}): boolean {
  const { lifecycleStage, hasWonOpportunity, hasContract } = params;
  if (lifecycleStage === "client") return true;
  if (hasWonOpportunity || hasContract) return true;
  return false;
}
