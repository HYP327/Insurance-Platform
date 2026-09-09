"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

const baseClassName =
  "inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60";

export function SubmitButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={pending} className={baseClassName}>
      {pending ? "Please wait…" : children}
    </button>
  );
}
