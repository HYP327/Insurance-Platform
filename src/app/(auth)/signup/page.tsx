"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type AuthFormState } from "../actions";
import { TextField, FormError } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";

const initialState: AuthFormState = {};

export default function SignupPage() {
  const [state, formAction] = useActionState(signupAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Create your Insure account</h1>
        <p className="mt-1 text-sm text-slate-600">Compare health cover from Cameroon&apos;s insurers in one place.</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <TextField label="Full name" name="fullName" autoComplete="name" required />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField
          label="Mobile number (optional)"
          name="phone"
          type="tel"
          inputMode="numeric"
          placeholder="6XXXXXXXX"
          autoComplete="tel-national"
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FormError message={state.error} />
        <SubmitButton>Create account</SubmitButton>
      </form>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
