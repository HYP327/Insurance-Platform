import Link from "next/link";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PolicyCard } from "@/components/policies/PolicyCard";

export default async function PoliciesPage() {
  const user = await requireAuth();

  const policies = await prisma.policy.findMany({
    where: { userId: user.id },
    include: { quote: { include: { ratePlan: { include: { insurer: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  if (policies.length === 0) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-slate-900">No policies yet</h1>
        <p className="mt-2 text-slate-600">Compare quotes and buy a plan to see it here.</p>
        <Link
          href="/quotes"
          className="mt-6 inline-block rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800"
        >
          Compare quotes
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">My policies</h1>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {policies.map((policy) => (
          <PolicyCard
            key={policy.id}
            policy={policy}
            insurerName={policy.quote.ratePlan.insurer.name}
            ratePlanName={policy.quote.ratePlan.name}
          />
        ))}
      </div>
    </div>
  );
}
