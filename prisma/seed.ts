import { PrismaClient, CoverageTier } from "@prisma/client";

const prisma = new PrismaClient();

const STANDARD_AGE_BANDS = [
  { minAge: 0, maxAge: 17, multiplier: 0.7 },
  { minAge: 18, maxAge: 29, multiplier: 1.0 },
  { minAge: 30, maxAge: 39, multiplier: 1.15 },
  { minAge: 40, maxAge: 49, multiplier: 1.4 },
  { minAge: 50, maxAge: 59, multiplier: 1.85 },
  { minAge: 60, maxAge: 70, multiplier: 2.5 },
];

const STANDARD_REGION_LOADINGS = [
  { region: "Douala", multiplier: 1.15 },
  { region: "Yaoundé", multiplier: 1.1 },
  { region: "Other", multiplier: 1.0 },
];

const TIER_BASE_MULTIPLIER: Record<CoverageTier, number> = {
  BASIC: 1,
  STANDARD: 1.6,
  PREMIUM: 2.4,
};

const TIER_COVERAGE: Record<CoverageTier, { included: string[]; excluded: string[] }> = {
  BASIC: {
    included: ["Outpatient consultations", "Generic prescription drugs", "Emergency room visits"],
    excluded: ["Private hospital rooms", "Dental", "Optical", "Elective surgery", "Medical evacuation"],
  },
  STANDARD: {
    included: [
      "Outpatient consultations",
      "Prescription drugs",
      "Hospitalization (shared room)",
      "Specialist referrals",
      "Emergency room visits",
    ],
    excluded: ["Private hospital rooms", "Dental", "Optical", "Medical evacuation"],
  },
  PREMIUM: {
    included: [
      "Outpatient consultations",
      "Prescription drugs",
      "Hospitalization (private room)",
      "Specialist referrals",
      "Emergency room visits",
      "Annual health screening",
    ],
    excluded: ["Cosmetic procedures"],
  },
};

const RIDER_TEMPLATES = [
  { code: "DENTAL", label: "Dental care", flatMonthlyCost: 3500, requiresExistingConditionDeclaration: false },
  { code: "OPTICAL", label: "Optical care", flatMonthlyCost: 2500, requiresExistingConditionDeclaration: false },
  { code: "MATERNITY", label: "Maternity cover", flatMonthlyCost: 8000, requiresExistingConditionDeclaration: true },
  { code: "EVACUATION", label: "Medical evacuation", flatMonthlyCost: 6000, requiresExistingConditionDeclaration: false },
];

interface InsurerSeed {
  name: string;
  /** Base monthly premium for the BASIC tier, in XAF; STANDARD/PREMIUM scale off TIER_BASE_MULTIPLIER. */
  basicBasePremium: number;
}

const INSURERS: InsurerSeed[] = [
  { name: "AXA Cameroun", basicBasePremium: 18000 },
  { name: "Activa", basicBasePremium: 15500 },
  { name: "Prudential Beneficial", basicBasePremium: 16500 },
  { name: "SUNU Assurances", basicBasePremium: 14000 },
];

async function main() {
  for (const insurerSeed of INSURERS) {
    const insurer = await prisma.insurer.upsert({
      where: { name: insurerSeed.name },
      update: {},
      create: { name: insurerSeed.name },
    });

    for (const tier of Object.values(CoverageTier)) {
      const baseMonthlyPremium = Math.round(insurerSeed.basicBasePremium * TIER_BASE_MULTIPLIER[tier]);
      const coverage = TIER_COVERAGE[tier];

      const existing = await prisma.ratePlan.findFirst({
        where: { insurerId: insurer.id, tier },
      });
      if (existing) continue; // idempotent re-seed

      await prisma.ratePlan.create({
        data: {
          insurerId: insurer.id,
          tier,
          name: `${insurerSeed.name} ${tier.charAt(0) + tier.slice(1).toLowerCase()}`,
          baseMonthlyPremium,
          coverageSummary: coverage.included,
          exclusions: coverage.excluded,
          ageBands: { create: STANDARD_AGE_BANDS },
          regionLoadings: { create: STANDARD_REGION_LOADINGS },
          riders: { create: RIDER_TEMPLATES },
        },
      });
    }
  }

  const insurerCount = await prisma.insurer.count();
  const ratePlanCount = await prisma.ratePlan.count();
  console.log(`Seeded ${insurerCount} insurers with ${ratePlanCount} rate plans.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
