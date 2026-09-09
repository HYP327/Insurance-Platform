import Link from "next/link";
import { requireAuth } from "@/lib/auth/guards";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/quotes" className="text-lg font-semibold text-emerald-800">
            Insure
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/quotes" className="text-slate-600 hover:text-slate-900">
              Compare quotes
            </Link>
            <Link href="/policies" className="text-slate-600 hover:text-slate-900">
              My policies
            </Link>
            <span className="hidden text-slate-400 sm:inline">{user.fullName}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-slate-600 hover:text-slate-900">
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
