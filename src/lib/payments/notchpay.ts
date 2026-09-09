import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const NOTCHPAY_API_BASE = "https://api.notchpay.co";

interface InitializePaymentParams {
  amount: number;
  currency: string;
  reference: string;
  customerEmail: string;
  customerName: string;
  callbackUrl: string;
}

interface InitializePaymentResult {
  authorizationUrl: string;
  providerReference: string;
}

function getNotchpayPublicKey(): string {
  // NotchPay's Authorization header takes the *public* key for payment
  // initialization — the private key is only used via a separate X-Grant
  // header on privileged endpoints (transfers, balance, webhook config),
  // none of which this app calls. Confirmed against a live 401 response
  // before this was corrected.
  const key = process.env.NOTCHPAY_PUBLIC_KEY;
  if (!key) throw new Error("NOTCHPAY_PUBLIC_KEY is not configured");
  return key;
}

/**
 * Initializes a hosted checkout — Insure never collects raw MoMo/card
 * credentials itself.
 */
export async function initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
  const response = await fetch(`${NOTCHPAY_API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: getNotchpayPublicKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      email: params.customerEmail,
      reference: params.reference,
      callback: params.callbackUrl,
      description: `Insure health cover — ${params.customerName}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Notchpay initialize payment failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    authorizationUrl: data.authorization_url,
    providerReference: data.transaction?.reference ?? params.reference,
  };
}

/**
 * Verifies the webhook came from Notchpay before any payload field is
 * trusted. A payment/policy status flip must never happen off an
 * unverified request.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.NOTCHPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("NOTCHPAY_WEBHOOK_SECRET is not configured");

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signatureHeader, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
