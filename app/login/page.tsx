import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · Roslyn Film Analyzer" };

export default function LoginPage() {
  // Read on the server only. The API enforces the same flag, so this only
  // decides whether the button is shown.
  const testEnabled = process.env.ALLOW_TEST_LOGIN === "true";
  const adminTestEnabled = process.env.ALLOW_ADMIN_TEST === "true";

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Roslyn Film Analyzer</h1>
        <p className="mt-2 text-muted">Sports analytics club. Enter the club password to continue.</p>
        <LoginForm testEnabled={testEnabled} adminTestEnabled={adminTestEnabled} />
      </div>
    </main>
  );
}
