import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { PaymentStatusPoller } from "@/components/policies/PaymentStatusPoller";

export default async function PaymentStatusPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const user = await requireAuth();
  const { paymentId } = await params;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== user.id) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-16">
      <h1 className="text-xl font-semibold text-slate-900">Payment status</h1>
      <PaymentStatusPoller paymentId={paymentId} />
    </div>
  );
}
