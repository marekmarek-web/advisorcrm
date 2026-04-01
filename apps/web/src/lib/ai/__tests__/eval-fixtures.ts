type ContractRow = {
  id: string;
  contactId: string;
  segment: string;
  type: string;
  partnerId: string | null;
  productId: string | null;
  partnerName: string | null;
  productName: string | null;
  premiumAmount: string | null;
  premiumAnnual: string | null;
  contractNumber: string | null;
  startDate: string | null;
  anniversaryDate: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ActiveDealSummary = {
  id: string;
  title: string;
  stageName: string;
  caseType: string;
  expectedValue: string | null;
  expectedCloseDate: string | null;
  contactName: string;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  isNew: boolean;
  isStale: boolean;
  dealCategory: "new_opportunity" | "active_deal" | "service_need";
};

type ClientTimelineEvent = {
  id: string;
  eventType: string;
  category: "meeting" | "task" | "deal" | "analysis" | "contract" | "document" | "service";
  contactId: string;
  householdId: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  timestamp: Date;
  title: string;
  summary: string | null;
};

export type EvalContext = {
  clientProfile: {
    name: string;
    birthDate: string | null;
    age: string | null;
    city: string | null;
    title: string | null;
    lifecycleStage: string | null;
    priority: string | null;
    tags: string[] | null;
  };
  householdSummary: {
    name: string | null;
    memberCount: number;
    role: string | null;
  };
  financialSummary: {
    primaryAnalysisId: string | null;
    scope: "contact" | "household";
    householdName: string | null;
    status: "draft" | "completed" | "exported" | "archived" | "missing";
    updatedAt: Date | null;
    lastExportedAt: Date | null;
    goals: { name: string }[];
    goalsCount: number;
    income: number;
    expenses: number;
    surplus: number;
    assets: number;
    liabilities: number;
    netWorth: number;
    reserveOk: boolean;
    reserveGap: number;
    priorities: string[];
    gaps: string[];
  };
  contractsSummary: ContractRow[];
  timelineEvents: ClientTimelineEvent[];
  openItems: { tasks: unknown[]; events: unknown[] };
  serviceStatus: {
    lastServiceDate: string | null;
    nextServiceDue: string | null;
    serviceCycleMonths: string | null;
    isOverdue: boolean;
    daysSinceLastService: number | null;
    daysUntilNextService: number | null;
    upcomingAnniversaries: { segment: string; date: string; daysUntil: number }[];
    upcomingFixations: { segment: string; date: string; daysUntil: number }[];
    openServiceTasks: number;
    noContactRisk: boolean;
    coverageSummary: string;
  };
  activeDeals: ActiveDealSummary[];
  timelineTotalCount: number;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function daysAhead(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function baseTimeline(category: ClientTimelineEvent["category"], days: number, title: string): ClientTimelineEvent {
  return {
    id: `${category}-${title}`,
    eventType: `${category}_event`,
    category,
    contactId: "c-1",
    householdId: null,
    sourceEntityType: "event",
    sourceEntityId: `${category}-${days}`,
    timestamp: daysAgo(days),
    title,
    summary: null,
  };
}

function baseContract(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    id: "ctr-1",
    contactId: "c-1",
    segment: "HYPO",
    type: "HYPO",
    partnerId: null,
    productId: null,
    partnerName: "Česká spořitelna",
    productName: "Hypotéka Premium",
    premiumAmount: "12000",
    premiumAnnual: null,
    contractNumber: "H123456",
    startDate: "2022-06-01",
    anniversaryDate: daysAhead(45),
    note: null,
    createdAt: daysAgo(400),
    updatedAt: daysAgo(10),
    ...overrides,
  };
}

function baseDeal(overrides: Partial<ActiveDealSummary> = {}): ActiveDealSummary {
  return {
    id: "deal-1",
    title: "Hypotéka Novák",
    stageName: "Nabídka",
    caseType: "HYPO",
    expectedValue: "500000",
    expectedCloseDate: "2026-06-01",
    contactName: "Jan Novák",
    assignedTo: "advisor-1",
    createdAt: daysAgo(10),
    updatedAt: daysAgo(3),
    isNew: true,
    isStale: false,
    dealCategory: "active_deal",
    ...overrides,
  };
}

function baseContext(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    clientProfile: {
      name: "Jan Novák",
      birthDate: "1985-01-10",
      age: "41 let",
      city: "Praha",
      title: "IT konzultant",
      lifecycleStage: "rodina",
      priority: "vysoká",
      tags: ["hypo", "servis"],
    },
    householdSummary: {
      name: "Novákovi",
      memberCount: 4,
      role: "hlava domácnosti",
    },
    financialSummary: {
      primaryAnalysisId: "fa-1",
      scope: "household",
      householdName: "Novákovi",
      status: "completed",
      updatedAt: daysAgo(2),
      lastExportedAt: daysAgo(1),
      goals: [{ name: "Bydlení" }, { name: "Rezerva" }],
      goalsCount: 2,
      income: 100000,
      expenses: 85000,
      surplus: 15000,
      assets: 1500000,
      liabilities: 900000,
      netWorth: 600000,
      reserveOk: true,
      reserveGap: 0,
      priorities: ["Rezerva", "Pojištění"],
      gaps: [],
    },
    contractsSummary: [baseContract()],
    timelineEvents: [
      baseTimeline("meeting", 5, "Servisní schůzka"),
      baseTimeline("deal", 12, "Posun HYPO případu"),
      baseTimeline("analysis", 15, "Aktualizace FA"),
    ],
    openItems: {
      tasks: [],
      events: [],
    },
    serviceStatus: {
      lastServiceDate: daysAgo(30).toISOString().slice(0, 10),
      nextServiceDue: daysAhead(30),
      serviceCycleMonths: "12",
      isOverdue: false,
      daysSinceLastService: 30,
      daysUntilNextService: 30,
      upcomingAnniversaries: [{ segment: "HYPO", date: daysAhead(45), daysUntil: 45 }],
      upcomingFixations: [{ segment: "HYPO", date: daysAhead(45), daysUntil: 45 }],
      openServiceTasks: 1,
      noContactRisk: false,
      coverageSummary: "Celkem 6, pokryto 4, mezery 2",
    },
    activeDeals: [baseDeal()],
    timelineTotalCount: 3,
    ...overrides,
  };
}

export const evalFixtures = {
  familyLowReserve: baseContext({
    financialSummary: {
      ...baseContext().financialSummary,
      reserveOk: false,
      reserveGap: 120000,
      gaps: ["Chybí rezerva"],
    },
  }),
  minimalData: baseContext({
    clientProfile: {
      name: "Klient bez dat",
      birthDate: null,
      age: null,
      city: null,
      title: null,
      lifecycleStage: null,
      priority: null,
      tags: null,
    },
    financialSummary: {
      ...baseContext().financialSummary,
      status: "missing",
      updatedAt: null,
      goals: [],
      priorities: [],
      gaps: [],
    },
    contractsSummary: [],
    timelineEvents: [],
    activeDeals: [],
    serviceStatus: {
      ...baseContext().serviceStatus,
      lastServiceDate: null,
      noContactRisk: true,
      openServiceTasks: 0,
    },
    timelineTotalCount: 0,
  }),
  wellCovered: baseContext({
    contractsSummary: [
      baseContract(),
      baseContract({ id: "ctr-2", segment: "RIZ", partnerName: "Kooperativa" }),
      baseContract({ id: "ctr-3", segment: "INV", partnerName: "Conseq" }),
      baseContract({ id: "ctr-4", segment: "PEN", partnerName: "ČSOB penze" }),
      baseContract({ id: "ctr-5", segment: "MAJ", partnerName: "Allianz" }),
    ],
    financialSummary: {
      ...baseContext().financialSummary,
      status: "exported",
      reserveOk: true,
    },
    serviceStatus: {
      ...baseContext().serviceStatus,
      openServiceTasks: 0,
      noContactRisk: false,
    },
  }),
  staleNoContact: baseContext({
    financialSummary: {
      ...baseContext().financialSummary,
      updatedAt: daysAgo(540),
      status: "archived",
    },
    serviceStatus: {
      ...baseContext().serviceStatus,
      lastServiceDate: daysAgo(220).toISOString().slice(0, 10),
      nextServiceDue: daysAgo(40).toISOString().slice(0, 10),
      daysSinceLastService: 220,
      daysUntilNextService: -40,
      isOverdue: true,
      noContactRisk: true,
    },
  }),
  openDealNoDuplicate: baseContext({
    activeDeals: [
      baseDeal({
        title: "Hypotéka Novák - refinancování",
        stageName: "Nabídka",
        dealCategory: "active_deal",
        isNew: false,
      }),
    ],
  }),
} as const;
