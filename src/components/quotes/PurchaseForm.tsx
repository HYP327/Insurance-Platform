"use client";

import { useState } from "react";
import { purchaseQuoteAction } from "@/app/(app)/quotes/actions";
import { SubmitButton } from "@/components/ui/Button";
import { TERM_MONTHS_OPTIONS, termMonthsLabel } from "@/lib/validation/policy.schema";

function formatXaf(amount: number): string {
  return new Intl.NumberFormat("fr-CM", { maximumFractionDigits: 0 }).format(amount) + " XAF";
}

export function PurchaseForm({ quoteId, monthlyPremium }: { quoteId: string; monthlyPremium: number }) {
  const [termMonths, setTermMonths] = useState<number>(1);
  const total = monthlyPremium * termMonths;

  return (
    <form action={purchaseQuoteAction} className="flex flex-col gap-3">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="termMonths" value={termMonths} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Pay for</span>
        <select
          value={termMonths}
          onChange={(event) => setTermMonths(Number(event.target.value))}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          {TERM_MONTHS_OPTIONS.map((months) => (
            <option key={months} value={months}>
              {termMonthsLabel(months)}
            </option>
          ))}
        </select>
      </label>

      {termMonths > 1 && (
        <p className="text-sm text-slate-600">
          Total for {termMonthsLabel(termMonths)}:{" "}
          <span className="font-semibold text-slate-900 tabular-nums">{formatXaf(total)}</span>
        </p>
      )}

      <SubmitButton>Buy this plan</SubmitButton>
    </form>
  );
}
