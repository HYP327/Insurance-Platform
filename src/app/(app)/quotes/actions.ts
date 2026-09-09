"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guards";
import { initializePayment } from "@/lib/payments/notchpay";
import { purchaseSchema } from "@/lib/validation/policy.schema";

function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function purchaseQuoteAction(formData: FormData): Promise<void> {
  const user = await requireAuth();

  const parsed = purchaseSchema.safeParse({
    quoteId: formData.get("quoteId"),
    termMonths: formData.get("termMonths"),
  });

  if (!parsed.success) {
    redirect("/quotes");
  }

  const { quoteId, termMonths } = parsed.data;

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

  const totalAmount = Math.round(Number(quote.totalMonthlyPremium) * termMonths);

  const existingPolicy = await prisma.policy.findUnique({ where: { quoteId: quote.id } });

  if (existingPolicy?.status === "ACTIVE") {
    redirect(`/policies/${existingPolicy.id}`);
  }

  const policy = existingPolicy
    ? await prisma.policy.update({
        where: { id: existingPolicy.id },
        // The user may have changed the payment term since a prior attempt.
        data: { termMonths, monthlyPremium: quote.totalMonthlyPremium },
      })
    : await prisma.policy.create({
        data: {
          userId: user.id,
          quoteId: quote.id,
          insurerId: quote.ratePlan.insurerId,
          ratePlanId: quote.ratePlanId,
          monthlyPremium: quote.totalMonthlyPremium,
          termMonths,
        },
      });

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      policyId: policy.id,
      method: "MTN_MOMO",
      amount: totalAmount,
      providerReference: `pending-${policy.id}-${Date.now()}`, // replaced right after initialize
    },
  });

  const { authorizationUrl, providerReference } = await initializePayment({
    amount: totalAmount,
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
