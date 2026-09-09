import { describe, expect, it } from "vitest";
import { calculatePremium, DEPENDENT_DISCOUNT_FACTOR, type RatePlanInput } from "./engine";

function makeRatePlan(overrides: Partial<RatePlanInput> = {}): RatePlanInput {
  return {
    id: "plan_1",
    insurerId: "insurer_1",
    insurerName: "Test Insurer",
    name: "Test Standard",
    baseMonthlyPremium: 20000,
    ageBands: [
      { minAge: 0, maxAge: 17, multiplier: 0.8 },
      { minAge: 18, maxAge: 39, multiplier: 1 },
      { minAge: 40, maxAge: 59, multiplier: 1.5 },
      { minAge: 60, maxAge: 75, multiplier: 2.25 },
    ],
    regionLoadings: [
      { region: "Douala", multiplier: 1.1 },
      { region: "Other", multiplier: 1 },
    ],
    riders: [
      { code: "DENTAL", label: "Dental", flatMonthlyCost: 3000, requiresExistingConditionDeclaration: false },
      { code: "MATERNITY", label: "Maternity", flatMonthlyCost: 5000, requiresExistingConditionDeclaration: true },
    ],
    ...overrides,
  };
}

describe("calculatePremium", () => {
  it("prices a single adult in a listed region with no riders", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 30,
      region: "Douala",
      dependents: [],
      selectedRiderCodes: [],
      hasExistingConditions: false,
    });

    // base 20000 * ageMultiplier 1 * regionMultiplier 1.1 = 22000
    expect(result).not.toBeNull();
    expect(result!.totalMonthlyPremium).toBe(22000);
    expect(result!.primaryAgeMultiplier).toBe(1);
    expect(result!.regionMultiplier).toBe(1.1);
  });

  it("adds discounted dependent line items", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 30,
      region: "Other",
      dependents: [{ age: 8 }, { age: 45 }],
      selectedRiderCodes: [],
      hasExistingConditions: false,
    });

    // primary: 20000 * 1 * 1 = 20000
    // dep1 (age 8): 20000 * 0.8 * 1 * 0.85 = 13600
    // dep2 (age 45): 20000 * 1.5 * 1 * 0.85 = 25500
    expect(result!.dependentLineItems).toHaveLength(2);
    expect(result!.dependentLineItems[0].cost).toBe(20000 * 0.8 * DEPENDENT_DISCOUNT_FACTOR);
    expect(result!.dependentLineItems[1].cost).toBe(20000 * 1.5 * DEPENDENT_DISCOUNT_FACTOR);
    expect(result!.totalMonthlyPremium).toBe(
      Math.round(20000 + 20000 * 0.8 * DEPENDENT_DISCOUNT_FACTOR + 20000 * 1.5 * DEPENDENT_DISCOUNT_FACTOR)
    );
  });

  it("sums only the riders the user selected", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 30,
      region: "Other",
      dependents: [],
      selectedRiderCodes: ["DENTAL"],
      hasExistingConditions: false,
    });

    expect(result!.riderLineItems).toEqual([
      { code: "DENTAL", label: "Dental", cost: 3000, requiresExistingConditionDeclaration: false },
    ]);
    expect(result!.totalMonthlyPremium).toBe(20000 + 3000);
  });

  it("flags when a selected rider requires an existing-condition declaration and the user has one", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 30,
      region: "Other",
      dependents: [],
      selectedRiderCodes: ["MATERNITY"],
      hasExistingConditions: true,
    });

    expect(result!.requiresExistingConditionDeclaration).toBe(true);
  });

  it("does not flag a declaration requirement when the user has no existing conditions", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 30,
      region: "Other",
      dependents: [],
      selectedRiderCodes: ["MATERNITY"],
      hasExistingConditions: false,
    });

    expect(result!.requiresExistingConditionDeclaration).toBe(false);
  });

  it("returns null when the primary applicant's age falls outside every age band", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 80,
      region: "Other",
      dependents: [],
      selectedRiderCodes: [],
      hasExistingConditions: false,
    });

    expect(result).toBeNull();
  });

  it("falls back to the plan's Other region loading when the user's region isn't listed", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 30,
      region: "Bamenda",
      dependents: [],
      selectedRiderCodes: [],
      hasExistingConditions: false,
    });

    expect(result!.regionMultiplier).toBe(1);
  });

  it("contributes nothing for a dependent outside every age band, without invalidating the quote", () => {
    const result = calculatePremium({
      ratePlan: makeRatePlan(),
      primaryAge: 30,
      region: "Other",
      dependents: [{ age: 90 }],
      selectedRiderCodes: [],
      hasExistingConditions: false,
    });

    expect(result).not.toBeNull();
    expect(result!.dependentLineItems[0].cost).toBe(0);
    expect(result!.totalMonthlyPremium).toBe(20000);
  });
});
