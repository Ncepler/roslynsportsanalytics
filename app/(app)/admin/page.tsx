import type { Metadata } from "next";
import { ScheduleAdmin } from "@/components/admin/schedule-admin";

export const metadata: Metadata = { title: "Admin · Roslyn Film Analyzer" };

// Admin only: proxy.ts sends anyone without the admin cookie to the login page.
export default function AdminPage() {
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Schedule</h1>
      <p className="mt-2 max-w-[38rem] text-muted">The games members can pick before uploading. Each game can be analyzed once.</p>
      <div className="mt-8">
        <ScheduleAdmin />
      </div>
    </section>
  );
}
