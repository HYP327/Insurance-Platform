/**
 * Pure, server-only premium calculation. No DB or HTTP concerns here so it
 * stays trivial to unit test — the comparison dashboard and the persisted
 * Quote.breakdown both consume exactly this shape, so there's no separate
 * "display" math that could drift from what was actually charged.
 */

export interface AgeBand {
  minAge: number;
  maxAge: number;
  multiplier: number;
}

export interface RegionLoading {
  region: string;
  multiplier: number;
}

export interface RiderOption {
  code: string;
  label: string;
  flatMonthlyCost: number;
  requiresExistingConditionDeclaration: boolean;
}

export interface RatePlanInput {
  id: string;
  insurerId: string;
  insurerName: string;
  name: string;
  baseMonthlyPremium: number;
  ageBands: AgeBand[];
  regionLoadings: RegionLoading[];
  riders: RiderOption[];
}

export interface DependentInput {
  age: number;
}

export interface CalculatePremiumInput {
  ratePlan: RatePlanInput;
  primaryAge: number;
  region: string;
  dependents: DependentInput[];
  selectedRiderCodes: string[];
  hasExistingConditions: boolean;
}

export interface RiderLineItem {
  code: string;
  label: string;
  cost: number;
  requiresExistingConditionDeclaration: boolean;
}

export interface PremiumBreakdown {
  ratePlanId: string;
  insurerId: string;
  insurerName: string;
  ratePlanName: string;
  baseMonthlyPremium: number;
  primaryAgeMultiplier: number;
  regionMultiplier: number;
  region: string;
  primaryLineCost: number;
  dependentLineItems: { age: number; ageMultiplier: number; cost: number }[];
  riderLineItems: RiderLineItem[];
  totalMonthlyPremium: number;
  requiresExistingConditionDeclaration: boolean;
}

/** Dependents are priced at a flat discount off the same base rate/age curve as the primary applicant. Configurable per rate plan in v2; a constant is enough for v1. */
export const DEPENDENT_DISCOUNT_FACTOR = 0.85;

const DEFAULT_REGION_KEY = "Other";

function findAgeBandMultiplier(bands: AgeBand[], age: number): number | null {
  const band = bands.find((b) => age >= b.minAge && age <= b.maxAge);
  return band ? band.multiplier : null;
}

function findRegionMultiplier(loadings: RegionLoading[], region: string): number {
  const match = loadings.find((l) => l.region === region);
  if (match) return match.multiplier;
  const fallback = loadings.find((l) => l.region === DEFAULT_REGION_KEY);
  return fallback ? fallback.multiplier : 1;
}

/** Rounds to the nearest whole XAF — the CFA franc has no minor subunit in practice. */
function roundToWholeCurrencyUnit(amount: number): number {
  return Math.round(amount);
}

/**
 * Returns null when the primary applicant falls outside every age band this
 * rate plan defines — the plan is not insurable for this person, and should
 * be excluded from comparison results rather than silently priced at a
 * default multiplier.
 */
export function calculatePremium(input: CalculatePremiumInput): PremiumBreakdown | null {
  const { ratePlan, primaryAge, region, dependents, selectedRiderCodes, hasExistingConditions } = input;

  const primaryAgeMultiplier = findAgeBandMultiplier(ratePlan.ageBands, primaryAge);
  if (primaryAgeMultiplier === null) {
    return null;
  }

  const regionMultiplier = findRegionMultiplier(ratePlan.regionLoadings, region);
  const primaryLineCost = ratePlan.baseMonthlyPremium * primaryAgeMultiplier * regionMultiplier;

  const dependentLineItems = dependents.map((dependent) => {
    const ageMultiplier = findAgeBandMultiplier(ratePlan.ageBands, dependent.age);
    // A dependent outside every age band simply contributes nothing (they'd
    // need their own policy) rather than invalidating the whole quote.
    const cost = ageMultiplier === null
      ? 0
      : ratePlan.baseMonthlyPremium * ageMultiplier * regionMultiplier * DEPENDENT_DISCOUNT_FACTOR;
    return { age: dependent.age, ageMultiplier: ageMultiplier ?? 0, cost };
  });

  const riderLineItems: RiderLineItem[] = ratePlan.riders
    .filter((rider) => selectedRiderCodes.includes(rider.code))
    .map((rider) => ({
      code: rider.code,
      label: rider.label,
      cost: rider.flatMonthlyCost,
      requiresExistingConditionDeclaration: rider.requiresExistingConditionDeclaration,
    }));

  const dependentsTotal = dependentLineItems.reduce((sum, item) => sum + item.cost, 0);
  const ridersTotal = riderLineItems.reduce((sum, item) => sum + item.cost, 0);

  const totalMonthlyPremium = roundToWholeCurrencyUnit(primaryLineCost + dependentsTotal + ridersTotal);

  const requiresExistingConditionDeclaration =
    hasExistingConditions && riderLineItems.some((item) => item.requiresExistingConditionDeclaration);

  return {
    ratePlanId: ratePlan.id,
    insurerId: ratePlan.insurerId,
    insurerName: ratePlan.insurerName,
    ratePlanName: ratePlan.name,
    baseMonthlyPremium: ratePlan.baseMonthlyPremium,
    primaryAgeMultiplier,
    regionMultiplier,
    region,
    primaryLineCost: roundToWholeCurrencyUnit(primaryLineCost),
    dependentLineItems: dependentLineItems.map((item) => ({
      ...item,
      cost: roundToWholeCurrencyUnit(item.cost),
    })),
    riderLineItems,
    totalMonthlyPremium,
    requiresExistingConditionDeclaration,
  };
}
