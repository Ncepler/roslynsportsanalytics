"use client";

import { useEffect, useState, type FormEvent } from "react";

type Mode = "password" | "test";

// If the server hasn't answered or the next page hasn't loaded after this long, say so instead of spinning forever.
const STUCK_MS = 10_000;

export function LoginForm({ testEnabled }: { testEnabled: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Mode | null>(null);

  // A stuck "Logging in…" must never be permanent (the page might not load, or the request might hang).
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setPending(null);
      setError("That's taking too long. Reload the page and try again.");
    }, STUCK_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  async function login(mode: Mode) {
    setPending(mode);
    setError(null);
    try {
      // Where the user was headed before login. The server checks it again (same-site paths only).
      const next = new URLSearchParams(window.location.search).get("next");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "password" ? { mode, password, next } : { mode, next }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { redirect?: string } | null;
        // A full page load, not router.replace + refresh: those two navigations
        // can race and leave this form stuck on "Logging in…".
        window.location.assign(data?.redirect ?? "/");
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Couldn't log in. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setPending(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password) {
      setError("Enter the club or admin password.");
      return;
    }
    void login("password");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8">
      <label htmlFor="password" className="block text-sm font-medium">
        Password
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-[0.625rem] border border-border-strong bg-surface px-3 text-base outline-offset-0 aria-invalid:border-danger aria-invalid:outline-danger"
        />
        {testEnabled && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending !== null}
            onClick={() => void login("test")}
          >
            {pending === "test" ? "Logging in…" : "Test"}
          </button>
        )}
      </div>
      <p id="login-error" role="alert" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
      <button type="submit" className="btn btn-primary mt-3 w-full" disabled={pending !== null}>
        {pending === "password" ? "Logging in…" : "Log in"}
      </button>

    </form>
  );
}
