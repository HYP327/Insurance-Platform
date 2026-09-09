import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/payments/notchpay";
import { randomUUID } from "crypto";

const SUCCESS_EVENTS = new Set(["payment.complete"]);
const FAILURE_EVENTS = new Set(["payment.failed", "payment.canceled", "payment.expired"]);

function generatePolicyNumber(insurerId: string): string {
  return `INS-${insurerId.slice(-4).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-notch-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { reference?: string; transaction?: { reference?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const providerReference = event.data?.reference ?? event.data?.transaction?.reference;
  if (!providerReference || !event.type) {
    return NextResponse.json({ received: true });
  }

  const payment = await prisma.payment.findUnique({
    where: { providerReference },
    include: { policy: true },
  });

  if (!payment) {
    // Unknown reference — ack anyway so NotchPay doesn't retry indefinitely.
    return NextResponse.json({ received: true });
  }

  // Idempotent: a terminal status is never revisited, so a redelivered
  // webhook (NotchPay retries on non-2xx) can't double-activate a policy.
  if (payment.status === "SUCCEEDED" || payment.status === "FAILED" || payment.status === "CANCELLED") {
    return NextResponse.json({ received: true });
  }

  if (SUCCESS_EVENTS.has(event.type)) {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCEEDED", confirmedAt: new Date(), rawWebhookPayload: event as object },
      }),
      prisma.policy.update({
        where: { id: payment.policyId },
        data: {
          status: "ACTIVE",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          policyNumber: generatePolicyNumber(payment.policy.insurerId),
        },
      }),
    ]);
  } else if (FAILURE_EVENTS.has(event.type)) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", rawWebhookPayload: event as object },
    });
  }

  return NextResponse.json({ received: true });
}
