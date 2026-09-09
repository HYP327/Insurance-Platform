import { z } from "zod";

/** How many months of premium the user can prepay in one purchase. */
export const TERM_MONTHS_OPTIONS = [1, 2, 3, 4, 6, 7, 8, 12, 24, 48] as const;

export function termMonthsLabel(months: number): string {
  if (months % 12 === 0 && months >= 12) {
    const years = months / 12;
    return `${months} months (${years} year${years > 1 ? "s" : ""})`;
  }
  return months === 1 ? "1 month" : `${months} months`;
}

export const purchaseSchema = z.object({
  quoteId: z.string().min(1),
  termMonths: z
    .string()
    .transform((value) => Number(value))
    .refine((value): value is (typeof TERM_MONTHS_OPTIONS)[number] =>
      TERM_MONTHS_OPTIONS.includes(value as (typeof TERM_MONTHS_OPTIONS)[number])
    , "Choose a valid payment term"),
});
