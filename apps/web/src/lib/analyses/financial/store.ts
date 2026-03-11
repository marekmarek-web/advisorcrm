/**
 * Financial analysis – Zustand store for wizard state.
 * Used by portal/analyses/financial React UI.
 */

import { create } from "zustand";
import type { FinancialAnalysisData, ChildEntry, GoalEntry, CreditWishEntry, LoanEntry, InvestmentEntry, AssetListItem, OtherDetailItem } from "./types";
import { getDefaultState } from "./defaultState";
import { TOTAL_STEPS } from "./constants";
import { loadFromStorage, saveToStorage, clearStorage, mergeLoadedState, type LoadedState } from "./saveLoad";
import { computeGoalComputed } from "./calculations";
import { loansListBalanceSum, loansListPaymentsSum, monthlyPayment } from "./calculations";
import { ownResourcesFromLtv, ownResourcesFromAko } from "./calculations";
import { recomputeInvestmentsFv } from "./charts";

export interface FinancialAnalysisStore {
  data: FinancialAnalysisData;
  currentStep: number;
  totalSteps: number;
  /** CRM analysis id when loaded/saved from server. */
  analysisId: string | null;
  /** Hydrate from localStorage on mount (call once in layout/page). */
  hydrate: () => void;
  /** Load state from server payload (e.g. after getFinancialAnalysis). Merges with default state. */
  loadFromServerPayload: (parsed: { data?: Record<string, unknown>; currentStep?: number }) => void;
  setAnalysisId: (id: string | null) => void;
  setData: (partial: Partial<FinancialAnalysisData>) => void;
  setCurrentStep: (step: number) => void;
  goToStep: (step: number) => void;
  nextStep: () => boolean;
  prevStep: () => boolean;
  saveToStorage: () => void;
  reset: () => void;
  loadFromFile: (json: string) => boolean;
  // Client & family
  setClient: (partial: Partial<FinancialAnalysisData["client"]>) => void;
  setPartner: (partial: Partial<FinancialAnalysisData["partner"]>) => void;
  addChild: () => ChildEntry;
  updateChild: (id: number, field: keyof ChildEntry, value: string) => void;
  removeChild: (id: number) => void;
  // Cashflow
  setCashflowField: (path: string, value: number | string) => void;
  addIncomeOther: (desc: string, amount: number) => void;
  updateIncomeOther: (id: number, patch: { desc?: string; amount?: number }) => void;
  removeIncomeOther: (id: number) => void;
  addExpenseOther: (desc: string, amount: number) => void;
  updateExpenseOther: (id: number, patch: { desc?: string; amount?: number }) => void;
  removeExpenseOther: (id: number) => void;
  // Assets
  setAssetsField: (key: string, value: number) => void;
  addAssetInvestment: (type: string, value: number) => void;
  updateAssetInvestment: (id: number, patch: { type?: string; value?: number }) => void;
  removeAssetInvestment: (id: number) => void;
  addAssetPension: (type: string, value: number) => void;
  updateAssetPension: (id: number, patch: { type?: string; value?: number }) => void;
  removeAssetPension: (id: number) => void;
  recalcAssetTotals: () => void;
  // Liabilities
  setLiabilitiesField: (path: string, value: number | string) => void;
  addLoan: (entry: Omit<LoanEntry, "id">) => void;
  updateLoan: (id: number | string, patch: Partial<Omit<LoanEntry, "id">>) => void;
  removeLoan: (id: number | string) => void;
  recalcLoansTotal: () => void;
  // Goals
  addGoal: (raw: { type: string; name: string; amount?: number; horizon?: number; strategy?: number; initial?: number; lumpsum?: number }) => void;
  updateGoal: (id: number, raw: Partial<{ type: string; name: string; amount: number; horizon: number; strategy: number; initial: number; lumpsum: number }>) => void;
  removeGoal: (id: number) => void;
  // Credit wishes
  addCreditWish: (entry: Omit<CreditWishEntry, "id">) => void;
  removeCreditWish: (id: number | string) => void;
  // Strategy
  setStrategyProfile: (profile: FinancialAnalysisData["strategy"]["profile"]) => void;
  setConservativeMode: (value: boolean) => void;
  updateInvestment: (productKey: string, type: "lump" | "monthly" | "pension", field: keyof InvestmentEntry, value: number) => void;
  recalcInvestmentsFv: () => void;
  // Insurance
  setInsurance: (partial: Partial<FinancialAnalysisData["insurance"]>) => void;
  // CRM link (from URL)
  setLinkIds: (clientId?: string, householdId?: string) => void;
}

const defaultData = getDefaultState();

function setNested<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!(key in current) || typeof current[key] !== "object") (current as Record<string, unknown>)[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  (current as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

export const useFinancialAnalysisStore = create<FinancialAnalysisStore>((set, get) => ({
  data: defaultData,
  currentStep: 1,
  totalSteps: TOTAL_STEPS,
  analysisId: null,

  hydrate: () => {
    const loaded = loadFromStorage();
    if (loaded) set({ data: loaded.data, currentStep: loaded.currentStep });
  },

  loadFromServerPayload: (parsed) => {
    const loaded = mergeLoadedState(defaultData, parsed);
    set({ data: loaded.data, currentStep: loaded.currentStep });
  },

  setAnalysisId: (id) => set({ analysisId: id }),

  setData: (partial) => {
    set((s) => ({ data: { ...s.data, ...partial } }));
    get().saveToStorage();
  },

  setCurrentStep: (step) => {
    const n = Math.max(1, Math.min(TOTAL_STEPS, step));
    set({ currentStep: n });
    get().saveToStorage();
  },

  goToStep: (step) => {
    if (step >= 1 && step <= TOTAL_STEPS) {
      set({ currentStep: step });
      get().saveToStorage();
      return true;
    }
    return false;
  },

  nextStep: () => {
    const { currentStep, totalSteps } = get();
    if (currentStep < totalSteps) {
      set({ currentStep: currentStep + 1 });
      get().saveToStorage();
      return true;
    }
    return false;
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 1) {
      set({ currentStep: currentStep - 1 });
      get().saveToStorage();
      return true;
    }
    return false;
  },

  saveToStorage: () => {
    const { data, currentStep } = get();
    saveToStorage(data, currentStep);
  },

  reset: () => {
    const prev = get().data;
    clearStorage();
    const next = getDefaultState();
    if (prev.clientId != null) next.clientId = prev.clientId;
    if (prev.householdId != null) next.householdId = prev.householdId;
    set({ data: next, currentStep: 1, analysisId: null });
  },

  loadFromFile: (json) => {
    let parsed: { data?: Record<string, unknown>; currentStep?: number };
    try {
      parsed = JSON.parse(json) as { data?: Record<string, unknown>; currentStep?: number };
    } catch {
      return false;
    }
    try {
      const loaded = mergeLoadedState(getDefaultState(), parsed);
      set({ data: loaded.data, currentStep: loaded.currentStep, analysisId: null });
      get().recalcInvestmentsFv();
      get().recalcLoansTotal();
      get().recalcAssetTotals();
      return true;
    } catch {
      return false;
    }
  },

  setClient: (partial) => {
    set((s) => ({ data: { ...s.data, client: { ...s.data.client, ...partial } } }));
    get().saveToStorage();
  },

  setPartner: (partial) => {
    set((s) => ({ data: { ...s.data, partner: { ...s.data.partner, ...partial } } }));
    get().saveToStorage();
  },

  addChild: () => {
    const child: ChildEntry = { id: Date.now(), name: "", birthDate: "" };
    set((s) => ({ data: { ...s.data, children: [...s.data.children, child] } }));
    get().saveToStorage();
    return child;
  },

  updateChild: (id, field, value) => {
    set((s) => ({
      data: {
        ...s.data,
        children: s.data.children.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
      },
    }));
    get().saveToStorage();
  },

  removeChild: (id) => {
    set((s) => ({ data: { ...s.data, children: s.data.children.filter((c) => c.id !== id) } }));
    get().saveToStorage();
  },

  setCashflowField: (path, value) => {
    set((s) => {
      const cashflow = JSON.parse(JSON.stringify(s.data.cashflow)) as FinancialAnalysisData["cashflow"];
      setNested(cashflow as unknown as Record<string, unknown>, path, value);
      return { data: { ...s.data, cashflow } };
    });
    get().saveToStorage();
  },

  addIncomeOther: (desc, amount) => {
    const item: OtherDetailItem = { id: Date.now(), desc, amount };
    set((s) => ({
      data: {
        ...s.data,
        cashflow: {
          ...s.data.cashflow,
          incomes: {
            ...s.data.cashflow.incomes,
            otherDetails: [...(s.data.cashflow.incomes.otherDetails || []), item],
          },
        },
      },
    }));
    get().saveToStorage();
  },

  updateIncomeOther: (id, patch) => {
    set((s) => ({
      data: {
        ...s.data,
        cashflow: {
          ...s.data.cashflow,
          incomes: {
            ...s.data.cashflow.incomes,
            otherDetails: (s.data.cashflow.incomes.otherDetails || []).map((i) =>
              i.id === id ? { ...i, ...patch } : i
            ),
          },
        },
      },
    }));
    get().saveToStorage();
  },

  removeIncomeOther: (id) => {
    set((s) => ({
      data: {
        ...s.data,
        cashflow: {
          ...s.data.cashflow,
          incomes: {
            ...s.data.cashflow.incomes,
            otherDetails: (s.data.cashflow.incomes.otherDetails || []).filter((i) => i.id !== id),
          },
        },
      },
    }));
    get().saveToStorage();
  },

  addExpenseOther: (desc, amount) => {
    const item: OtherDetailItem = { id: Date.now(), desc, amount };
    set((s) => ({
      data: {
        ...s.data,
        cashflow: {
          ...s.data.cashflow,
          expenses: {
            ...s.data.cashflow.expenses,
            otherDetails: [...(s.data.cashflow.expenses.otherDetails || []), item],
          },
        },
      },
    }));
    get().saveToStorage();
  },

  updateExpenseOther: (id, patch) => {
    set((s) => ({
      data: {
        ...s.data,
        cashflow: {
          ...s.data.cashflow,
          expenses: {
            ...s.data.cashflow.expenses,
            otherDetails: (s.data.cashflow.expenses.otherDetails || []).map((i) =>
              i.id === id ? { ...i, ...patch } : i
            ),
          },
        },
      },
    }));
    get().saveToStorage();
  },

  removeExpenseOther: (id) => {
    set((s) => ({
      data: {
        ...s.data,
        cashflow: {
          ...s.data.cashflow,
          expenses: {
            ...s.data.cashflow.expenses,
            otherDetails: (s.data.cashflow.expenses.otherDetails || []).filter((i) => i.id !== id),
          },
        },
      },
    }));
    get().saveToStorage();
  },

  setAssetsField: (key, value) => {
    set((s) => ({ data: { ...s.data, assets: { ...s.data.assets, [key]: value } } }));
    get().saveToStorage();
  },

  addAssetInvestment: (type, value) => {
    const item: AssetListItem = { id: Date.now(), type, value };
    set((s) => ({
      data: {
        ...s.data,
        assets: {
          ...s.data.assets,
          investmentsList: [...s.data.assets.investmentsList, item],
        },
      },
    }));
    get().recalcAssetTotals();
    get().saveToStorage();
  },

  updateAssetInvestment: (id, patch) => {
    set((s) => ({
      data: {
        ...s.data,
        assets: {
          ...s.data.assets,
          investmentsList: s.data.assets.investmentsList.map((i) =>
            i.id === id ? { ...i, ...patch } : i
          ),
        },
      },
    }));
    get().recalcAssetTotals();
    get().saveToStorage();
  },

  removeAssetInvestment: (id) => {
    set((s) => ({
      data: {
        ...s.data,
        assets: {
          ...s.data.assets,
          investmentsList: s.data.assets.investmentsList.filter((i) => i.id !== id),
        },
      },
    }));
    get().recalcAssetTotals();
    get().saveToStorage();
  },

  addAssetPension: (type, value) => {
    const item: AssetListItem = { id: Date.now(), type, value };
    set((s) => ({
      data: {
        ...s.data,
        assets: {
          ...s.data.assets,
          pensionList: [...s.data.assets.pensionList, item],
        },
      },
    }));
    get().recalcAssetTotals();
    get().saveToStorage();
  },

  updateAssetPension: (id, patch) => {
    set((s) => ({
      data: {
        ...s.data,
        assets: {
          ...s.data.assets,
          pensionList: s.data.assets.pensionList.map((i) =>
            i.id === id ? { ...i, ...patch } : i
          ),
        },
      },
    }));
    get().recalcAssetTotals();
    get().saveToStorage();
  },

  removeAssetPension: (id) => {
    set((s) => ({
      data: {
        ...s.data,
        assets: {
          ...s.data.assets,
          pensionList: s.data.assets.pensionList.filter((i) => i.id !== id),
        },
      },
    }));
    get().recalcAssetTotals();
    get().saveToStorage();
  },

  recalcAssetTotals: () => {
    set((s) => {
      const invSum = s.data.assets.investmentsList.reduce((a, b) => a + b.value, 0);
      const penSum = s.data.assets.pensionList.reduce((a, b) => a + b.value, 0);
      return {
        data: {
          ...s.data,
          assets: {
            ...s.data.assets,
            investments: invSum,
            pension: penSum,
          },
        },
      };
    });
  },

  setLiabilitiesField: (path, value) => {
    set((s) => {
      const liabilities = JSON.parse(JSON.stringify(s.data.liabilities)) as FinancialAnalysisData["liabilities"];
      setNested(liabilities as unknown as Record<string, unknown>, path, value);
      return { data: { ...s.data, liabilities } };
    });
    get().recalcLoansTotal();
    get().saveToStorage();
  },

  addLoan: (entry) => {
    const loan: LoanEntry = { ...entry, id: Date.now() };
    set((s) => ({
      data: {
        ...s.data,
        liabilities: {
          ...s.data.liabilities,
          loansList: [...s.data.liabilities.loansList, loan],
        },
      },
    }));
    get().recalcLoansTotal();
    get().saveToStorage();
  },

  updateLoan: (id, patch) => {
    set((s) => ({
      data: {
        ...s.data,
        liabilities: {
          ...s.data.liabilities,
          loansList: s.data.liabilities.loansList.map((l) =>
            l.id === id ? { ...l, ...patch } : l
          ),
        },
      },
    }));
    get().recalcLoansTotal();
    get().saveToStorage();
  },

  removeLoan: (id) => {
    set((s) => ({
      data: {
        ...s.data,
        liabilities: {
          ...s.data.liabilities,
          loansList: s.data.liabilities.loansList.filter((l) => l.id !== id),
        },
      },
    }));
    get().recalcLoansTotal();
    get().saveToStorage();
  },

  recalcLoansTotal: () => {
    set((s) => {
      const list = s.data.liabilities.loansList;
      const sum = loansListBalanceSum(list);
      const sumPayments = loansListPaymentsSum(list);
      return {
        data: {
          ...s.data,
          liabilities: { ...s.data.liabilities, loans: sum },
          cashflow: {
            ...s.data.cashflow,
            expenses: { ...s.data.cashflow.expenses, loans: sumPayments },
          },
        },
      };
    });
  },

  addGoal: (raw) => {
    const strategyLabel = (raw.strategy ?? 0.07) >= 0.09 ? "dynamic" : (raw.strategy ?? 0.07) <= 0.05 ? "conservative" : "balanced";
    const horizon = raw.horizon ?? 1;
    const annualRate = raw.strategy ?? 0.07;
    const initial = raw.initial ?? 0;
    const lumpsum = raw.lumpsum ?? 0;
    const amount = raw.amount ?? 0;
    const { fvTarget, pmt, netNeeded } = computeGoalComputed(raw.type, amount, horizon, annualRate, initial, lumpsum);
    const goal: GoalEntry = {
      id: Date.now(),
      type: raw.type,
      name: raw.name,
      years: horizon,
      horizon,
      strategy: strategyLabel,
      annualRate,
      amount,
      initialAmount: initial,
      lumpSumNow: lumpsum,
      computed: { fvTarget, pmt, netNeeded },
    };
    set((s) => ({ data: { ...s.data, goals: [...s.data.goals, goal] } }));
    get().saveToStorage();
  },

  updateGoal: (id, raw) => {
    set((s) => {
      const goals = s.data.goals.map((g) => {
        if (g.id !== id) return g;
        const type = raw.type ?? g.type;
        const name = raw.name ?? g.name;
        const amount = raw.amount ?? g.amount ?? 0;
        const horizon = raw.horizon ?? g.horizon ?? g.years ?? 1;
        const annualRate = raw.strategy ?? g.annualRate ?? 0.07;
        const initial = raw.initial ?? g.initialAmount ?? 0;
        const lumpsum = raw.lumpsum ?? g.lumpSumNow ?? 0;
        const strategyLabel = annualRate >= 0.09 ? "dynamic" : annualRate <= 0.05 ? "conservative" : "balanced";
        const { fvTarget, pmt, netNeeded } = computeGoalComputed(type, amount, horizon, annualRate, initial, lumpsum);
        return {
          ...g,
          type,
          name,
          amount,
          years: horizon,
          horizon,
          strategy: strategyLabel,
          annualRate,
          initialAmount: initial,
          lumpSumNow: lumpsum,
          computed: { fvTarget, pmt, netNeeded },
        };
      });
      return { data: { ...s.data, goals } };
    });
    get().saveToStorage();
  },

  removeGoal: (id) => {
    set((s) => ({ data: { ...s.data, goals: s.data.goals.filter((g) => g.id !== id) } }));
    get().saveToStorage();
  },

  addCreditWish: (entry) => {
    const withId: CreditWishEntry = { ...entry, id: Date.now() + Math.random() };
    set((s) => ({ data: { ...s.data, newCreditWishList: [...s.data.newCreditWishList, withId] } }));
    get().saveToStorage();
  },

  removeCreditWish: (id) => {
    set((s) => ({
      data: { ...s.data, newCreditWishList: s.data.newCreditWishList.filter((c) => c.id !== id) },
    }));
    get().saveToStorage();
  },

  setStrategyProfile: (profile) => {
    set((s) => ({ data: { ...s.data, strategy: { ...s.data.strategy, profile } } }));
    get().recalcInvestmentsFv();
    get().saveToStorage();
  },

  setConservativeMode: (value) => {
    set((s) => ({ data: { ...s.data, strategy: { ...s.data.strategy, conservativeMode: value } } }));
    get().recalcInvestmentsFv();
    get().saveToStorage();
  },

  updateInvestment: (productKey, type, field, value) => {
    set((s) => ({
      data: {
        ...s.data,
        investments: s.data.investments.map((inv) =>
          inv.productKey === productKey && inv.type === type ? { ...inv, [field]: value } : inv
        ),
      },
    }));
    get().recalcInvestmentsFv();
    get().saveToStorage();
  },

  recalcInvestmentsFv: () => {
    set((s) => {
      const conservative = s.data.strategy.conservativeMode;
      const investments = recomputeInvestmentsFv(s.data.investments, conservative);
      return { data: { ...s.data, investments } };
    });
  },

  setInsurance: (partial) => {
    set((s) => ({ data: { ...s.data, insurance: { ...s.data.insurance, ...partial } } }));
    get().saveToStorage();
  },

  setLinkIds: (clientId, householdId) => {
    set((s) => ({
      data: {
        ...s.data,
        ...(clientId != null && clientId !== "" && { clientId }),
        ...(householdId != null && householdId !== "" && { householdId }),
      },
    }));
    get().saveToStorage();
  },
}));
