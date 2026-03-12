/**
 * Company FA – Zustand store for wizard state.
 * Used by portal/analyses/company React UI.
 */

import { create } from "zustand";
import type {
  CompanyFaPayload,
  CompanyFaCompany,
  CompanyFaDirector,
  CompanyFaFinance,
  CompanyFaBenefits,
  CompanyFaRisks,
  CompanyFaDirectorIns,
  CompanyFaStrategy,
  CompanyFaInvestmentItem,
} from "./types";
import { getDefaultCompanyFaPayload } from "./defaultState";
import { TOTAL_STEPS } from "./constants";

function mergePayload(
  defaultPayload: CompanyFaPayload,
  loaded: Partial<CompanyFaPayload> | CompanyFaPayload
): CompanyFaPayload {
  if (!loaded || typeof loaded !== "object") return defaultPayload;
  return {
    company: { ...defaultPayload.company, ...(loaded.company ?? {}) },
    directors: Array.isArray(loaded.directors)
      ? loaded.directors.length > 0
        ? loaded.directors.map((d) => ({ ...defaultPayload.directors[0], ...d }))
        : defaultPayload.directors
      : defaultPayload.directors,
    finance: { ...defaultPayload.finance, ...(loaded.finance ?? {}) },
    benefits: { ...defaultPayload.benefits, ...(loaded.benefits ?? {}) },
    risks: {
      ...defaultPayload.risks,
      ...(loaded.risks ?? {}),
      property: { ...defaultPayload.risks.property, ...(loaded.risks as CompanyFaRisks | undefined)?.property },
      interruption: { ...defaultPayload.risks.interruption, ...(loaded.risks as CompanyFaRisks | undefined)?.interruption },
      liability: { ...defaultPayload.risks.liability, ...(loaded.risks as CompanyFaRisks | undefined)?.liability },
    },
    directorIns: { ...defaultPayload.directorIns, ...(loaded.directorIns ?? {}) },
    strategy: { ...defaultPayload.strategy, ...(loaded.strategy ?? {}) },
    investments: Array.isArray(loaded.investments) && loaded.investments.length > 0
      ? loaded.investments
      : defaultPayload.investments,
    ...(loaded.investment != null ? { investment: loaded.investment } : {}),
  };
}

export interface CompanyFaStore {
  payload: CompanyFaPayload;
  currentStep: number;
  totalSteps: number;
  analysisId: string | null;
  companyId: string | null;
  primaryContactId: string | null;
  loadFromServerPayload: (loaded: Partial<CompanyFaPayload> | CompanyFaPayload) => void;
  setAnalysisId: (id: string | null) => void;
  setCompanyId: (id: string | null) => void;
  setPrimaryContactId: (id: string | null) => void;
  setPayload: (next: CompanyFaPayload) => void;
  setCompany: (partial: Partial<CompanyFaCompany>) => void;
  setFinance: (partial: Partial<CompanyFaFinance>) => void;
  setBenefits: (partial: Partial<CompanyFaBenefits>) => void;
  setRisks: (partial: Partial<CompanyFaRisks>) => void;
  setDirectorIns: (partial: Partial<CompanyFaDirectorIns>) => void;
  setStrategy: (partial: Partial<CompanyFaStrategy>) => void;
  setDirector: (index: number, partial: Partial<CompanyFaDirector>) => void;
  addDirector: () => void;
  removeDirector: (index: number) => void;
  setInvestment: (index: number, partial: Partial<CompanyFaInvestmentItem>) => void;
  setCurrentStep: (step: number) => void;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const defaultPayload = getDefaultCompanyFaPayload();

export const useCompanyFaStore = create<CompanyFaStore>((set, get) => ({
  payload: defaultPayload,
  currentStep: 1,
  totalSteps: TOTAL_STEPS,
  analysisId: null,
  companyId: null,
  primaryContactId: null,

  loadFromServerPayload: (loaded) => {
    set({ payload: mergePayload(getDefaultCompanyFaPayload(), loaded) });
  },

  setAnalysisId: (id) => set({ analysisId: id }),
  setCompanyId: (id) => set({ companyId: id }),
  setPrimaryContactId: (id) => set({ primaryContactId: id }),

  setPayload: (next) => set({ payload: next }),

  setCompany: (partial) =>
    set((s) => ({
      payload: { ...s.payload, company: { ...s.payload.company, ...partial } },
    })),

  setFinance: (partial) =>
    set((s) => ({
      payload: { ...s.payload, finance: { ...s.payload.finance, ...partial } },
    })),

  setBenefits: (partial) =>
    set((s) => ({
      payload: { ...s.payload, benefits: { ...s.payload.benefits, ...partial } },
    })),

  setRisks: (partial) =>
    set((s) => ({
      payload: { ...s.payload, risks: { ...s.payload.risks, ...partial } },
    })),

  setDirectorIns: (partial) =>
    set((s) => ({
      payload: { ...s.payload, directorIns: { ...s.payload.directorIns, ...partial } },
    })),

  setStrategy: (partial) =>
    set((s) => ({
      payload: { ...s.payload, strategy: { ...s.payload.strategy, ...partial } },
    })),

  setDirector: (index, partial) => {
    const { payload } = get();
    const next = [...payload.directors];
    if (index >= 0 && index < next.length) {
      next[index] = { ...next[index], ...partial };
      set({ payload: { ...payload, directors: next } });
    }
  },

  addDirector: () => {
    const { payload } = get();
    const defaultDir: CompanyFaDirector = {
      name: "",
      age: null,
      share: 100,
      hasSpouse: false,
      childrenCount: 0,
      incomeType: "employee",
      netIncome: 0,
      savings: 0,
      goal: "tax",
      benefits: { dps: false, dip: false, izp: false, amountMonthly: 0 },
      paysFromOwn: false,
      paysFromOwnAmount: 0,
      hasOldPension: false,
    };
    set({ payload: { ...payload, directors: [...payload.directors, defaultDir] } });
  },

  removeDirector: (index) => {
    const { payload } = get();
    const next = payload.directors.filter((_, i) => i !== index);
    if (next.length === 0) return;
    set({ payload: { ...payload, directors: next } });
  },

  setInvestment: (index, partial) => {
    const { payload } = get();
    const next = [...payload.investments];
    if (index >= 0 && index < next.length) {
      next[index] = { ...next[index], ...partial };
      set({ payload: { ...payload, investments: next } });
    }
  },

  setCurrentStep: (step) =>
    set({ currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)) }),

  goToStep: (step) =>
    set({ currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)) }),

  nextStep: () =>
    set((s) => ({ currentStep: Math.min(s.currentStep + 1, TOTAL_STEPS) })),

  prevStep: () =>
    set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),

  reset: () =>
    set({
      payload: getDefaultCompanyFaPayload(),
      currentStep: 1,
      analysisId: null,
      companyId: null,
      primaryContactId: null,
    }),
}));
