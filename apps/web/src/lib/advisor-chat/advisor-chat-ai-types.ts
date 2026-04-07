/** Typy pro AI asistenta v poradenském chatu (kontext + návrh odpovědi). */

export type AdvisorChatAiMessageTurn = {
  sender: "client" | "advisor";
  body: string;
  createdAt: string;
};

export type AdvisorChatAiOpenTask = { title: string; dueDate: string | null };

export type AdvisorChatAiAttachmentLine = { fileName: string; mimeType: string | null };

export type AdvisorChatAiPendingMaterial = { title: string; category: string };

/** Otevřené / nedávné žádosti o výpověď u kontaktu (modul terminací). */
export type AdvisorChatAiTerminationLine = {
  id: string;
  status: string;
  insurerName: string;
  updatedAt: string;
};

export type AdvisorChatAiPrimaryOpportunity = {
  title: string;
  caseType: string;
  stageName: string;
};

/** Vstup pro model — pouze fakta z DB, žádné odhady navíc. */
export type AdvisorChatAiBundle = {
  contactId: string;
  contactDisplayName: string;
  contactMetaLine: string;
  lastThreadActivityAt: string | null;
  messages: AdvisorChatAiMessageTurn[];
  primaryOpportunity: AdvisorChatAiPrimaryOpportunity | null;
  openTasks: AdvisorChatAiOpenTask[];
  pendingMaterialRequests: AdvisorChatAiPendingMaterial[];
  crmCounts: {
    openTasksCount: number;
    overdueTasksCount: number;
    pendingMaterialRequestsCount: number;
    openOpportunitiesCount: number;
    opportunitiesReadable: boolean;
  };
  attachmentHints: AdvisorChatAiAttachmentLine[];
  terminationRequests: AdvisorChatAiTerminationLine[];
};

/** Strukturovaný souhrn pro pravý panel. */
export type AdvisorChatAiSummary = {
  clientFocus: string;
  missing: string;
  recommendedNextStep: string;
};

/** Rozhraní poskytovatele — lze vyměnit (např. jiný LLM). */
export type AdvisorChatAiProvider = {
  generateContextSummary(bundle: AdvisorChatAiBundle): Promise<AdvisorChatAiSummary>;
  generateReplyDraft(bundle: AdvisorChatAiBundle, options?: { variantHint?: string }): Promise<string>;
};
