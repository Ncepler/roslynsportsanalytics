"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Mode = "password" | "test" | "admin-test" | "admin-password";

// If the server hasn't answered or the next page hasn't loaded after this long, say so instead of spinning forever.
const STUCK_MS = 10_000;

export function LoginForm({ testEnabled, adminTestEnabled }: { testEnabled: boolean; adminTestEnabled: boolean }) {
  // /admin sends people without the admin cookie here as /login?admin=1: the password box then logs in as admin.
  const adminLogin = useSearchParams().has("admin");
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "password" || mode === "admin-password" ? { mode, password } : { mode }),
      });
      if (res.ok) {
        // A full page load, not router.replace + refresh: those two navigations
        // can race and leave this form stuck on "Logging in…".
        window.location.assign(mode === "admin-test" || mode === "admin-password" ? "/admin" : "/");
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
      setError(adminLogin ? "Enter the admin password." : "Enter the club password.");
      return;
    }
    void login(adminLogin ? "admin-password" : "password");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8">
      <label htmlFor="password" className="block text-sm font-medium">
        {adminLogin ? "Admin password" : "Password"}
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
        {testEnabled && !adminLogin && (
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
        {pending === "password" || pending === "admin-password" ? "Logging in…" : adminLogin ? "Log in as admin" : "Log in"}
      </button>
      {adminTestEnabled && (
        <button type="button" className="btn btn-secondary mt-2 w-full" disabled={pending !== null} onClick={() => void login("admin-test")}>
          {pending === "admin-test" ? "Logging in…" : "Admin test"}
        </button>
      )}
    </form>
  );
}
