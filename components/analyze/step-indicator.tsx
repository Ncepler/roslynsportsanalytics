export const STEPS = ["Upload", "Trim", "Set up", "Analyze", "Review"] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

// Wayfinding: where am I in the flow (CLAUDE.md section 19). Past steps are
// clickable so the user is never trapped.
export function StepIndicator({ current, reachable, onGo, firstLabel }: { current: StepIndex; reachable: StepIndex; onGo: (s: StepIndex) => void; /** Name for step 1: "Upload" in the simulation, "Game" when a schedule picks the game first. */ firstLabel?: string }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {STEPS.map((stepLabel, i) => {
        const label = i === 0 && firstLabel ? firstLabel : stepLabel;
        const idx = i as StepIndex;
        const state = idx === current ? "current" : idx <= reachable ? "done" : "todo";
        return (
          <li key={label} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden className="mx-0.5 h-px w-2 bg-border-strong sm:mx-1 sm:w-4" />}
            <button
              type="button"
              disabled={state === "todo" || state === "current"}
              onClick={() => onGo(idx)}
              aria-current={state === "current" ? "step" : undefined}
              className={`flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-full px-1.5 sm:px-2.5 font-medium tabular-nums ${
                state === "current" ? "text-text" : state === "done" ? "text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-text" : "text-muted opacity-60"
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[0.6875rem] ${
                  state === "current" ? "bg-accent text-accent-fg" : "border border-border-strong"
                }`}
              >
                {i + 1}
              </span>
              {/* Phones show every step's number but only the current step's name, so the list fits on one line. */}
              <span className={state === "current" ? undefined : "max-sm:sr-only"}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
