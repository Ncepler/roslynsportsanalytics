"use client";

import { useEffect, useRef, useState } from "react";

// "Copy for Google Sheets": the label crossfades to "Copied" as feedback
// (CLAUDE.md section 19). Both labels share one grid cell so the width
// doesn't jump.
export function CopyButton({ text, label = "Copy for Google Sheets" }: { text: () => string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setFailed(false);
      setCopied(true);
    } catch {
      setFailed(true);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  const fade = "col-start-1 row-start-1 transition-[opacity,filter] duration-[var(--duration-fast)] ease-out";
  return (
    <button type="button" onClick={copy} className="btn btn-secondary min-h-10 text-sm" aria-live="polite">
      <span className="grid">
        <span className={fade} style={{ opacity: copied ? 0 : 1, filter: copied ? "blur(2px)" : "none" }}>
          {failed ? "Copy failed. Try again" : label}
        </span>
        <span className={fade} style={{ opacity: copied ? 1 : 0, filter: copied ? "none" : "blur(2px)" }} aria-hidden={!copied}>
          Copied
        </span>
      </span>
    </button>
  );
}
