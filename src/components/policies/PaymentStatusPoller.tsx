"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PaymentStatus = "INITIATED" | "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

const POLL_INTERVAL_MS = 3000;

export function PaymentStatusPoller({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<PaymentStatus>("INITIATED");
  const [policyId, setPolicyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/payments/${paymentId}/status`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;

        setStatus(data.paymentStatus);
        setPolicyId(data.policyId);

        if (data.paymentStatus === "SUCCEEDED" || data.paymentStatus === "FAILED" || data.paymentStatus === "CANCELLED") {
          return; // stop polling — terminal state reached
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  if (status === "SUCCEEDED") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg font-semibold text-emerald-800">Payment confirmed — your policy is active.</p>
        <button
          onClick={() => policyId && router.push(`/policies/${policyId}`)}
          className="rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800"
        >
          View my policy
        </button>
      </div>
    );
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg font-semibold text-red-700">The payment didn&apos;t go through.</p>
        <button
          onClick={() => router.push("/quotes")}
          className="rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-800"
        >
          Back to quotes
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" aria-hidden />
      <p className="text-slate-600">Confirming your Mobile Money payment…</p>
    </div>
  );
}
