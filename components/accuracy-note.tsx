import type { ReactNode } from "react";
import { accuracyText } from "@/lib/accuracy";

/**
 * One small, muted line saying the numbers below are AI estimates. Put it directly above a block of numbers.
 * `children` sit next to it (the "needs a second look" markers).
 */
export function AccuracyNote({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p data-accuracy-note className="text-xs text-muted">
        {accuracyText()}
      </p>
      {children}
    </div>
  );
}
