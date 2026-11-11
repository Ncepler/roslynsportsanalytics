"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "password" | "test" | "admin-test";

export function LoginForm({ testEnabled, adminTestEnabled }: { testEnabled: boolean; adminTestEnabled: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Mode | null>(null);

  async function login(mode: Mode) {
    setPending(mode);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "password" ? { mode, password } : { mode }),
      });
      if (res.ok) {
        router.replace(mode === "admin-test" || new URLSearchParams(window.location.search).has("admin") ? "/admin" : "/");
        router.refresh();
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
      setError("Enter the club password.");
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
      {adminTestEnabled && (
        <button type="button" className="btn btn-secondary mt-2 w-full" disabled={pending !== null} onClick={() => void login("admin-test")}>
          {pending === "admin-test" ? "Logging in…" : "Admin test"}
        </button>
      )}
    </form>
  );
}
