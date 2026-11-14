"use client";

import { useState, type FormEvent } from "react";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";

// Noah's Gemini test, on the admin page only. It stays locked until the owner code (ADMIN_BYPASS_CODE)
// is typed into the box. The test runs
// the real upload and analysis on any video, needs no scheduled game, skips the
// Roslyn check, and saves nothing, so it never counts toward a game or season.
export function OwnerTest() {
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const r = (await (await fetch("/api/admin/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })).json()) as { ok?: boolean; token?: string };
      if (r.ok && r.token) setToken(r.token);
      else setFailed(true);
    } catch {
      setFailed(true);
    }
    setCode("");
    setBusy(false);
  }

  if (!token) {
    return (
      <section aria-labelledby="real-test-title" className="mt-14 border-t border-border pt-10">
        <h2 id="real-test-title" className="text-xl font-semibold tracking-[-0.01em]">
          Run a real video through the AI
        </h2>
        <p className="mt-2 max-w-[40rem] text-muted">
          This runs the whole thing for real on any video you upload (upload, trim, set up, Gemini, review, export). It isn&apos;t a real team: it skips the Roslyn check, saves nothing, and counts toward no
          game or season. It uses real Gemini credits, so it needs the owner code.
        </p>
        <form onSubmit={unlock} className="mt-4 flex max-w-sm gap-2">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Owner code"
            placeholder="Owner code"
            className="field min-w-0 flex-1"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFailed(false);
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || code.length === 0}>
            Unlock
          </button>
        </form>
        <p role="alert" className="mt-2 min-h-5 text-sm text-danger">
          {failed ? "That didn't unlock it." : ""}
        </p>
      </section>
    );
  }
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
