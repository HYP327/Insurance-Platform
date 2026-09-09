import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { policy: true },
  });

  if (!payment || payment.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    paymentStatus: payment.status,
    policyStatus: payment.policy.status,
    policyId: payment.policyId,
  });
}
