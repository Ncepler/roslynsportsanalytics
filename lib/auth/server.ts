import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type Role } from "@/lib/auth/session";

/** The signed-in role for this request (server components). Null when not signed in. */
export async function getRole(): Promise<Role | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}
