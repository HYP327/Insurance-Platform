import Link from "next/link";
import { requireAuth } from "@/lib/auth/guards";
import { generateQuotes } from "@/lib/quoting/generateQuotes";
import { QuoteCard } from "@/components/quotes/QuoteCard";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const user = await requireAuth();
  const quotes = await generateQuotes(user.id);
  const { expired } = await searchParams;

  if (quotes === null) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Let&apos;s get you some quotes</h1>
        <p className="mt-2 text-slate-600">Complete your profile first so insurers can price your plan.</p>
        <Link
          href="/onboarding"
          className="mt-6 inline-block rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800"
        >
          Start onboarding
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Compare quotes</h1>
          <p className="mt-1 text-sm text-slate-600">
            Based on your profile, here&apos;s what {quotes.length} insurer{quotes.length === 1 ? "" : "s"} would charge.
          </p>
        </div>
        <Link href="/onboarding" className="text-sm font-medium text-emerald-700 hover:underline">
          Edit my details
        </Link>
      </div>

      {expired === "1" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your previous quote expired, so here are fresh prices.
        </p>
      )}

      {quotes.length === 0 ? (
        <p className="text-slate-600">No insurer currently has a plan available for your profile. Try a different coverage tier.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.map((quote, index) => (
            <QuoteCard key={quote.quoteId} quote={quote} isCheapest={index === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
