"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";

// Noah's Gemini test. Nothing is shown until the owner code (ADMIN_BYPASS_CODE)
// is typed on this page; wrong codes look like nothing happened. The test runs
// the real upload and analysis on any video, needs no scheduled game, skips the
// Roslyn check, and saves nothing, so it never counts toward a game or season.
export function OwnerTest({ prompt = false }: { /** On /test: show a visible code box to unlock it, instead of listening for typed digits. */ prompt?: boolean }) {
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

  useEffect(() => {
    if (token || prompt) return;
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
  }, [token, prompt]);

  if (!token && prompt) {
    return (
      <section aria-labelledby="real-test-title" className="mt-14 border-t border-border pt-10">
        <h2 id="real-test-title" className="text-xl font-semibold tracking-[-0.01em]">
          Run a real video through the AI
        </h2>
        <p className="mt-2 max-w-[40rem] text-muted">
          Everything above is simulated. This runs the whole thing for real on any video you upload (upload, trim, set up, Gemini, review, export). It isn&apos;t a real team: it skips the Roslyn check, saves nothing, and counts toward no
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
