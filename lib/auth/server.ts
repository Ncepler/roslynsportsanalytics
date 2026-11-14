import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken, type Role } from "@/lib/auth/session";

/** The signed-in role for this request (server components). Null when not signed in. */
export async function getRole(): Promise<Role | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** For server components that read stored data: demo and signed-out users never get through. */
export async function requireMember(): Promise<Role> {
  const role = await getRole();
  if (role !== "member" && role !== "admin") redirect("/login");
  return role;
}
