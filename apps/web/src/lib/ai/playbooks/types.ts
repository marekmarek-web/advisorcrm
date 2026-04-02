import type { ProductDomain, CanonicalIntent } from "../assistant-domain-model";

export type AssistantPlaybookId =
  | "hypo_uver"
  | "investice_dip_dps"
  | "zivotni_riziko"
  | "majetek_odpovednost_auto"
  | "servis_vyroci"
  | "schuzka_ukol_zapis";

export type AssistantPlaybook = {
  id: AssistantPlaybookId;
  label: string;
  /** Heuristická detekce z textu + intentu */
  matches: (messageLower: string, intent: CanonicalIntent) => boolean;
  defaultProductDomain: ProductDomain | null;
  /** Doporučená pole k doplnění před provedením zápisu */
  priorityMissingHints: string[];
  /** Krátké návrhy dalších kroků (copy pro UI / odpověď) */
  nextStepSuggestions: string[];
};
