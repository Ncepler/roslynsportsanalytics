"use client";

import { useEffect, useState } from "react";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";

// Noah's Gemini test. Nothing is shown until the owner code (ADMIN_BYPASS_CODE)
// is typed on this page; wrong codes look like nothing happened. The test runs
// the real upload and analysis on any video, needs no scheduled game, skips the
// Roslyn check, and saves nothing, so it never counts toward a game or season.
export function OwnerTest() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (token) return;
    let typed = "";
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return; // the schedule fields have digits too
      if (e.ctrlKey || e.metaKey || e.altKey || !/^\d$/.test(e.key)) return;
      typed = (typed + e.key).slice(-10);
      if (typed.length < 10) return;
      const code = typed;
      typed = ""; // every attempt needs a fresh 10 digits, so a wrong try can't fire a request per keystroke after it
      fetch("/api/admin/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
        .then((r) => r.json())
        .then((r: { ok?: boolean; token?: string }) => {
          if (r.ok && r.token) setToken(r.token);
        })
        .catch(() => {});
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [token]);

  if (!token) return null;
  return (
    <section aria-labelledby="owner-test-title" className="mt-14 border-t border-border pt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="owner-test-title" className="text-xl font-semibold tracking-[-0.01em]">
          Gemini test
        </h2>
        <button type="button" className="btn btn-ghost min-h-9 px-2 text-sm" onClick={() => setToken(null)}>
          Lock this again
        </button>
      </div>
      <div className="mt-6">
        <AnalyzeFlow ownerToken={token} />
      </div>
    </section>
  );
}
