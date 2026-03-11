/**
 * Example unit tests for financial analysis calculations.
 * See PHASE8.md – testability.
 */

import { describe, it, expect } from "vitest";
import {
  totalIncome,
  totalExpense,
  surplus,
  reserveTarget,
  reserveGap,
  isReserveMet,
  monthlyPayment,
  totalRepayment,
} from "../calculations";

describe("calculations", () => {
  describe("cashflow", () => {
    it("totalIncome sums main, partner and otherDetails", () => {
      const incomes = { main: 50000, partner: 30000, otherDetails: [{ desc: "x", amount: 5000 }] };
      expect(totalIncome(incomes)).toBe(85000);
    });

    it("totalExpense sums all expense categories", () => {
      const expenses = {
        housing: 15000,
        energy: 3000,
        food: 8000,
        transport: 4000,
        children: 2000,
        insurance: 3000,
        otherDetails: [],
      };
      expect(totalExpense(expenses)).toBe(35000);
    });

    it("surplus is income minus expense", () => {
      const incomes = { main: 60000, partner: 0, otherDetails: [] };
      const expenses = { housing: 12000, energy: 0, food: 0, transport: 0, children: 0, insurance: 0, otherDetails: [] };
      expect(surplus(incomes, expenses)).toBe(48000);
    });

    it("reserveTarget is monthly expense * months", () => {
      expect(reserveTarget(30000, 6)).toBe(180000);
    });

    it("reserveGap is max(0, target - cash)", () => {
      expect(reserveGap(100000, 180000)).toBe(80000);
      expect(reserveGap(200000, 180000)).toBe(0);
    });

    it("isReserveMet when cash >= target", () => {
      expect(isReserveMet(180000, 180000)).toBe(true);
      expect(isReserveMet(179000, 180000)).toBe(false);
    });
  });

  describe("credit", () => {
    it("monthlyPayment for annuity", () => {
      const pmt = monthlyPayment(3_000_000, 5, 25);
      expect(pmt).toBeGreaterThan(17000);
      expect(pmt).toBeLessThan(18000);
    });

    it("totalRepayment is monthly * years * 12", () => {
      expect(totalRepayment(10000, 10)).toBe(1_200_000);
    });
  });
});
