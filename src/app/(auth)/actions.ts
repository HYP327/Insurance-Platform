"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { clearLoginAttempts, isLoginRateLimited, recordFailedLoginAttempt } from "@/lib/auth/rateLimit";
import { loginSchema, signupSchema } from "@/lib/validation/auth.schema";

export interface AuthFormState {
  error?: string;
}

export async function signupAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const { fullName, email, phone, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { fullName, email, phone: phone || null, passwordHash },
  });

  await createSession(user.id);
  redirect("/onboarding");
}

export async function loginAction(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const { email, password } = parsed.data;

  if (isLoginRateLimited(email)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  // Generic message on both branches below — don't reveal whether the email is registered.
  const invalidCredentialsError = { error: "Incorrect email or password." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    recordFailedLoginAttempt(email);
    return invalidCredentialsError;
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);
  if (!passwordMatches) {
    recordFailedLoginAttempt(email);
    return invalidCredentialsError;
  }

  clearLoginAttempts(email);
  await createSession(user.id);
  redirect("/quotes");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
