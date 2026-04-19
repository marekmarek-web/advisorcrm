/**
 * Sdílené typy a konstanty pro e-mailové kampaně.
 * Nesmí být v souboru s "use server" — Next.js povoluje z actions exportovat jen async funkce.
 */

export type CampaignSegmentId = "all" | "vip" | "investors" | "mortgage" | "test";

export type CampaignSegment = {
  id: CampaignSegmentId;
  label: string;
  /** Seznam tagů (lowercased), které sedí do tohoto segmentu. Prázdné = `all`. */
  tags: string[];
};

export const CAMPAIGN_SEGMENTS: CampaignSegment[] = [
  { id: "all", label: "Všichni klienti", tags: [] },
  { id: "vip", label: "VIP klienti", tags: ["vip"] },
  { id: "investors", label: "Investoři", tags: ["investor", "investice", "investice-aktivni"] },
  { id: "mortgage", label: "Klienti s hypotékou", tags: ["hypoteka", "hypotéka", "mortgage"] },
  { id: "test", label: "Testovací odeslání (pouze mně)", tags: [] },
];

export type EmailCampaignRow = {
  id: string;
  name: string;
  subject: string;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
};

export type CampaignListRow = EmailCampaignRow & {
  bodyHtml: string;
  /** Počet úspěšně doručených (status='sent') – reálně z `email_campaign_recipients`. */
  sentCount: number;
  /** Počet chyb při odeslání. */
  failedCount: number;
};

export type SegmentCount = {
  id: CampaignSegmentId;
  label: string;
  count: number;
};

export type SendEmailCampaignResult = {
  ok: true;
  sent: number;
  skipped: number;
  failed: number;
  capped?: boolean;
  cap?: number;
};
