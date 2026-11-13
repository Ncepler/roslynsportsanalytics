import type { Metadata } from "next";
import { ClubAdmin } from "@/components/admin/club-admin";
import { OwnerTest } from "@/components/admin/owner-test";
import { ScheduleAdmin } from "@/components/admin/schedule-admin";

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
      {/* Temporary: the old schedule that the current Analyze picker still reads. Replaced in Stage 5. */}
      <details className="mt-12 border-t border-border pt-6">
        <summary className="cursor-pointer text-sm font-medium text-muted">Old game picker schedule (until the Save flow replaces it)</summary>
        <div className="mt-6">
          <ScheduleAdmin />
        </div>
      </details>
      <OwnerTest />
    </section>
  );
}
