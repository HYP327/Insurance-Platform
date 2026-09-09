import { z } from "zod";

export const CAMEROON_REGIONS = [
  "Douala",
  "Yaoundé",
  "Bamenda",
  "Bafoussam",
  "Garoua",
  "Maroua",
  "Ngaoundéré",
  "Bertoua",
  "Ebolowa",
  "Buea",
  "Other",
] as const;

export const COVERAGE_TIERS = ["BASIC", "STANDARD", "PREMIUM"] as const;
export const DEPENDENT_RELATIONSHIPS = ["SPOUSE", "CHILD", "OTHER"] as const;

const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date");

export const dependentSchema = z.object({
  relationship: z.enum(DEPENDENT_RELATIONSHIPS),
  dateOfBirth: isoDateString,
  hasExistingConditions: z.boolean().default(false),
});

export const profileSchema = z.object({
  dateOfBirth: isoDateString,
  region: z.enum(CAMEROON_REGIONS),
  desiredTier: z.enum(COVERAGE_TIERS),
  hasExistingConditions: z.boolean().default(false),
  conditionsNotes: z.string().trim().max(1000).optional().or(z.literal("")),
  dependents: z.array(dependentSchema).max(10),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type DependentInput = z.infer<typeof dependentSchema>;
