import { purchaseQuoteAction } from "@/app/(app)/quotes/actions";
import { SubmitButton } from "@/components/ui/Button";
import type { ComparisonQuote } from "@/lib/quoting/generateQuotes";

function formatXaf(amount: number): string {
  return new Intl.NumberFormat("fr-CM", { maximumFractionDigits: 0 }).format(amount) + " XAF";
}

export function QuoteCard({ quote, isCheapest }: { quote: ComparisonQuote; isCheapest: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-500">{quote.insurerName}</p>
          <h3 className="text-lg font-semibold text-slate-900">{quote.ratePlanName}</h3>
        </div>
        {isCheapest && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
            Lowest price
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-slate-900 tabular-nums">
        {formatXaf(quote.totalMonthlyPremium)}
        <span className="text-sm font-normal text-slate-500"> / month</span>
      </p>

      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium text-slate-700">Included</p>
        <ul className="flex flex-col gap-1 text-slate-600">
          {quote.coverageSummary.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-emerald-600">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {quote.exclusions.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium text-slate-700">Not included</p>
          <ul className="flex flex-col gap-1 text-slate-500">
            {quote.exclusions.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden>–</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {quote.requiresExistingConditionDeclaration && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This plan requires a health declaration for one or more of your selections.
        </p>
      )}

      <form action={purchaseQuoteAction}>
        <input type="hidden" name="quoteId" value={quote.quoteId} />
        <SubmitButton>Buy this plan</SubmitButton>
      </form>
    </div>
  );
}
