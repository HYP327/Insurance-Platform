"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type AuthFormState } from "../actions";
import { TextField, FormError } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";

const initialState: AuthFormState = {};

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Log in to Insure</h1>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        <FormError message={state.error} />
        <SubmitButton>Log in</SubmitButton>
      </form>
      <p className="text-center text-sm text-slate-600">
        New to Insure?{" "}
        <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
