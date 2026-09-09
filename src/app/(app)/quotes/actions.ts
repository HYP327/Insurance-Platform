"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guards";
import { initializePayment } from "@/lib/payments/notchpay";

function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function purchaseQuoteAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const quoteId = String(formData.get("quoteId"));

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { ratePlan: true },
  });

  if (!quote || quote.userId !== user.id) {
    redirect("/quotes");
  }

  if (quote.expiresAt < new Date()) {
    // Rates may have changed since this quote was computed — send the user
    // back to get a fresh one rather than honoring a stale price.
    redirect("/quotes?expired=1");
  }

  const existingPolicy = await prisma.policy.findUnique({ where: { quoteId: quote.id } });
  const policy =
    existingPolicy ??
    (await prisma.policy.create({
      data: {
        userId: user.id,
        quoteId: quote.id,
        insurerId: quote.ratePlan.insurerId,
        ratePlanId: quote.ratePlanId,
        monthlyPremium: quote.totalMonthlyPremium,
      },
    }));

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      policyId: policy.id,
      method: "MTN_MOMO",
      amount: quote.totalMonthlyPremium,
      providerReference: `pending-${policy.id}-${Date.now()}`, // replaced right after initialize
    },
  });

  const { authorizationUrl, providerReference } = await initializePayment({
    amount: Number(quote.totalMonthlyPremium),
    currency: "XAF",
    reference: payment.id,
    customerEmail: user.email,
    customerName: user.fullName,
    callbackUrl: `${getAppUrl()}/payments/${payment.id}/status`,
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerReference },
  });

  redirect(authorizationUrl);
}
