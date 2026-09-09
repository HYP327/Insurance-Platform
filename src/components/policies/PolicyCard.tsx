import Link from "next/link";
import type { Policy, PolicyStatus } from "@prisma/client";

function formatXaf(amount: number): string {
  return new Intl.NumberFormat("fr-CM", { maximumFractionDigits: 0 }).format(amount) + " XAF";
}

const STATUS_STYLES: Record<PolicyStatus, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-200 text-slate-700",
  EXPIRED: "bg-slate-200 text-slate-700",
};

const STATUS_LABELS: Record<PolicyStatus, string> = {
  PENDING_PAYMENT: "Payment pending",
  ACTIVE: "Active",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export function PolicyCard({
  policy,
  insurerName,
  ratePlanName,
}: {
  policy: Policy;
  insurerName: string;
  ratePlanName: string;
}) {
  return (
    <Link
      href={`/policies/${policy.id}`}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-500">{insurerName}</p>
          <h3 className="text-lg font-semibold text-slate-900">{ratePlanName}</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[policy.status]}`}>
          {STATUS_LABELS[policy.status]}
        </span>
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums">
        {formatXaf(Number(policy.monthlyPremium))}
        <span className="text-sm font-normal text-slate-500"> / month</span>
      </p>
      {policy.policyNumber && <p className="text-xs text-slate-500">Policy no. {policy.policyNumber}</p>}
    </Link>
  );
}
