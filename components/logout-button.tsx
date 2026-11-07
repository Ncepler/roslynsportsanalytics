"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-ghost -mr-1 min-h-10 shrink-0 px-2 sm:-mr-2 sm:px-3" onClick={logout} disabled={pending}>
      Log out
    </button>
  );
}
