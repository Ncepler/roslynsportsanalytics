import type { Metadata } from "next";
import { ClubAdmin } from "@/components/admin/club-admin";
import { OwnerTest } from "@/components/admin/owner-test";

export const metadata: Metadata = { title: "Admin · Roslyn Film Analyzer" };

// Admin only: proxy.ts blocks everyone else (members get a 403 page).
export default function AdminPage() {
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Admin</h1>
      <p className="mt-2 max-w-[38rem] text-muted">Teams, seasons and schedules. Everything here is stored in the club database.</p>
      <div className="mt-8">
        <ClubAdmin />
      </div>
      <OwnerTest />
    </section>
  );
}
