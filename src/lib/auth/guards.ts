import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import type { User } from "@prisma/client";

/** Use in Server Components/Actions guarding an authenticated-only route. Redirects to /login instead of throwing, since these run during render. */
export async function requireAuth(): Promise<User> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session.user;
}
