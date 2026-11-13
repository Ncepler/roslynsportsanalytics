import Link from "next/link";
import { getRole } from "@/lib/auth/server";

// Shown in the header only for admins. Read on the server per request
// (inside Suspense, because Cache Components is on).
export async function AdminLink() {
  if ((await getRole()) !== "admin") return null;
  return (
    <Link href="/admin" className="btn btn-ghost min-h-10 shrink-0 px-2 sm:px-3">
      Admin
    </Link>
  );
}
