/**
 * Example unit tests for financial analysis save/load (mergeLoadedState).
 * See PHASE8.md – testability.
 */

import { describe, it, expect } from "vitest";
import { mergeLoadedState } from "../saveLoad";
import { getDefaultState } from "../defaultState";
import { TOTAL_STEPS } from "../constants";

describe("saveLoad", () => {
  describe("mergeLoadedState", () => {
    it("returns default state when parsed.data is missing", () => {
      const defaultData = getDefaultState();
      const result = mergeLoadedState(defaultData, { currentStep: 3 });
      expect(result.data.client).toBeDefined();
      expect(result.currentStep).toBe(3);
    });

    it("merges client name from payload", () => {
      const defaultData = getDefaultState();
      const result = mergeLoadedState(defaultData, {
        data: { client: { name: "Jan Novák" } },
        currentStep: 1,
      });
      expect(result.data.client?.name).toBe("Jan Novák");
    });

    it("clamps currentStep to valid range", () => {
      const defaultData = getDefaultState();
      const maxStep = defaultData.includeCompany ? TOTAL_STEPS + 1 : TOTAL_STEPS;
      expect(mergeLoadedState(defaultData, { currentStep: 0 }).currentStep).toBe(1);
      expect(mergeLoadedState(defaultData, { currentStep: 10 }).currentStep).toBe(maxStep);
      expect(mergeLoadedState(defaultData, { currentStep: 4 }).currentStep).toBe(4);
    });

    it("merges cashflow income and expense", () => {
      const defaultData = getDefaultState();
      const result = mergeLoadedState(defaultData, {
        data: {
          cashflow: {
            incomeGross: 80000,
            incomes: { main: 70000, partner: 10000 },
            expenses: { housing: 20000, food: 10000 },
          },
        },
        currentStep: 2,
      });
      expect(result.data.cashflow?.incomes?.main).toBe(70000);
      expect(result.data.cashflow?.expenses?.housing).toBe(20000);
    });
  });
});
