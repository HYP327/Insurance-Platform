import "server-only";
import { prisma } from "@/lib/db";
import { calculatePremium, type RatePlanInput } from "@/lib/quoting/engine";
import type { CoverageTier } from "@prisma/client";

const QUOTE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function ageFromDateOfBirth(dateOfBirth: Date): number {
  const diffMs = Date.now() - dateOfBirth.getTime();
  return Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

export interface ComparisonQuote {
  quoteId: string;
  insurerName: string;
  ratePlanName: string;
  totalMonthlyPremium: number;
  coverageSummary: string[];
  exclusions: string[];
  requiresExistingConditionDeclaration: boolean;
}

/**
 * Loads the user's profile/dependents, prices every active rate plan for
 * their chosen tier, persists each result as a Quote row (so a purchase can
 * always trace back to the exact calculation that produced its price), and
 * returns them sorted cheapest first. Returns null if the user hasn't
 * completed onboarding yet.
 */
export async function generateQuotes(userId: string): Promise<ComparisonQuote[] | null> {
  const [profile, dependents] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.dependent.findMany({ where: { userId } }),
  ]);

  if (!profile) return null;

  const ratePlans = await prisma.ratePlan.findMany({
    where: { active: true, tier: profile.desiredTier as CoverageTier, insurer: { active: true } },
    include: { insurer: true, ageBands: true, regionLoadings: true, riders: true },
  });

  const primaryAge = ageFromDateOfBirth(profile.dateOfBirth);
  const dependentAges = dependents.map((dependent) => ({ age: ageFromDateOfBirth(dependent.dateOfBirth) }));
  const expiresAt = new Date(Date.now() + QUOTE_LIFETIME_MS);

  const results: ComparisonQuote[] = [];

  for (const ratePlan of ratePlans) {
    const ratePlanInput: RatePlanInput = {
      id: ratePlan.id,
      insurerId: ratePlan.insurerId,
      insurerName: ratePlan.insurer.name,
      name: ratePlan.name,
      baseMonthlyPremium: Number(ratePlan.baseMonthlyPremium),
      ageBands: ratePlan.ageBands.map((band) => ({
        minAge: band.minAge,
        maxAge: band.maxAge,
        multiplier: Number(band.multiplier),
      })),
      regionLoadings: ratePlan.regionLoadings.map((loading) => ({
        region: loading.region,
        multiplier: Number(loading.multiplier),
      })),
      riders: ratePlan.riders.map((rider) => ({
        code: rider.code,
        label: rider.label,
        flatMonthlyCost: Number(rider.flatMonthlyCost),
        requiresExistingConditionDeclaration: rider.requiresExistingConditionDeclaration,
      })),
    };

    const breakdown = calculatePremium({
      ratePlan: ratePlanInput,
      primaryAge,
      region: profile.region,
      dependents: dependentAges,
      selectedRiderCodes: [], // v1: base premium comparison; rider selection happens post-purchase
      hasExistingConditions: profile.hasExistingConditions,
    });

    if (!breakdown) continue; // not insurable for this person — excluded, not defaulted

    const quote = await prisma.quote.create({
      data: {
        userId,
        ratePlanId: ratePlan.id,
        inputSnapshot: {
          primaryAge,
          region: profile.region,
          desiredTier: profile.desiredTier,
          dependents: dependentAges,
          hasExistingConditions: profile.hasExistingConditions,
        },
        breakdown: breakdown as unknown as object,
        totalMonthlyPremium: breakdown.totalMonthlyPremium,
        expiresAt,
      },
    });

    results.push({
      quoteId: quote.id,
      insurerName: ratePlan.insurer.name,
      ratePlanName: ratePlan.name,
      totalMonthlyPremium: breakdown.totalMonthlyPremium,
      coverageSummary: ratePlan.coverageSummary as string[],
      exclusions: ratePlan.exclusions as string[],
      requiresExistingConditionDeclaration: breakdown.requiresExistingConditionDeclaration,
    });
  }

  return results.sort((a, b) => a.totalMonthlyPremium - b.totalMonthlyPremium);
}
