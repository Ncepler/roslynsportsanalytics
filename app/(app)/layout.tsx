import { LogoutButton } from "@/components/logout-button";
import { NavTabs } from "@/components/nav-tabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const freeTier = process.env.GEMINI_TIER === "free";

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-[var(--header-bg)] backdrop-blur-[var(--header-blur)] backdrop-saturate-150">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 sm:gap-4 sm:px-6">
          <span className="hidden text-[0.9375rem] font-semibold tracking-[-0.01em] sm:block">Roslyn Film Analyzer</span>
          <NavTabs />
          <LogoutButton />
        </div>
      </header>
      {freeTier && (
        <div role="status" className="border-b border-warning-border bg-warning-bg text-warning-text">
          <p className="mx-auto max-w-5xl px-4 py-2 text-sm font-medium sm:px-6">
            Free tier: don&apos;t upload student footage.
          </p>
        </div>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </>
  );
}
