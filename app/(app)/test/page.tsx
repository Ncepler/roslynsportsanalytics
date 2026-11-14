import { Suspense } from "react";
import { OwnerTest } from "@/components/admin/owner-test";
import { DemoAnalyze } from "@/components/analyze/demo-analyze";
import { getRole } from "@/lib/auth/server";

// The real-video test is only offered to admins (the demo and member roles never see it), and it still needs the owner code.
async function RealTest() {
  return (await getRole()) === "admin" ? <OwnerTest prompt /> : null;
}

export default function TestPage() {
  return (
    <>
      <DemoAnalyze />
      <Suspense fallback={null}>
        <RealTest />
      </Suspense>
    </>
  );
}
