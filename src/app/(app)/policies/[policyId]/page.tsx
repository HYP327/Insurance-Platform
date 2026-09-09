import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";

function formatXaf(amount: number): string {
  return new Intl.NumberFormat("fr-CM", { maximumFractionDigits: 0 }).format(amount) + " XAF";
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const user = await requireAuth();
  const { policyId } = await params;

  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: {
      quote: { include: { ratePlan: { include: { insurer: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!policy || policy.userId !== user.id) {
    notFound();
  }

  const ratePlan = policy.quote.ratePlan;
  const coverageSummary = ratePlan.coverageSummary as string[];
  const exclusions = ratePlan.exclusions as string[];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/policies" className="text-sm font-medium text-emerald-700 hover:underline">
        ← My policies
      </Link>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">{ratePlan.insurer.name}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{ratePlan.name}</h1>
        <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
          {formatXaf(Number(policy.monthlyPremium))}
          <span className="text-sm font-normal text-slate-500"> / month</span>
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-slate-900">{policy.status.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Policy number</dt>
            <dd className="font-medium text-slate-900">{policy.policyNumber ?? "Assigned after payment"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Start date</dt>
            <dd className="font-medium text-slate-900">{formatDate(policy.startDate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">End date</dt>
            <dd className="font-medium text-slate-900">{formatDate(policy.endDate)}</dd>
          </div>
        </dl>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-slate-700">Included</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
              {coverageSummary.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Not included</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
              {exclusions.map((item) => (
                <li key={item}>– {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Payment history</h2>
        <div className="mt-3 flex flex-col gap-2">
          {policy.payments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <span className="text-slate-600">{formatDate(payment.createdAt)}</span>
              <span className="font-medium text-slate-900">{formatXaf(Number(payment.amount))}</span>
              <span className="text-slate-500">{payment.method.replace("_", " ")}</span>
              <span className="font-medium text-slate-900">{payment.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
