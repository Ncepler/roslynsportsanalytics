import { cookies } from "next/headers";
import Link from "next/link";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth/session";

// Shown in the header only when the admin cookie is valid. Read on the server
// per request (inside Suspense, because Cache Components is on).
export async function AdminLink() {
  const jar = await cookies();
  if (!(await verifyAdminToken(jar.get(ADMIN_COOKIE)?.value))) return null;
  return (
    <Link href="/admin" className="btn btn-ghost min-h-10 shrink-0 px-2 sm:px-3">
      Admin
    </Link>
  );
}
