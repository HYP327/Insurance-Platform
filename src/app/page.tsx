import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await getSession();
  if (session) {
    redirect("/quotes");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          Compare health insurance quotes in Cameroon
        </h1>
        <p className="mx-auto max-w-md text-slate-600">
          Tell us about yourself once, see real premiums from several insurers side by side, and pay by Mobile
          Money.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-800"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
