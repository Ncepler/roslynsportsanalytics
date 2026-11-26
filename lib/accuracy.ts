/**
 * The accuracy note shown above every block of numbers (Noah, Nov 26). The stats come from an AI watching video, so
 * they are estimates, not official counts. `marginPercent` stays null until it has been measured by hand-counting a
 * real game; while it is null no number is shown. Never put a guessed number here.
 */
export const ACCURACY = { marginPercent: null as number | null, note: "AI estimates from game film, not exact counts. Check important numbers against the video." };

/** The note as one line of text (for exports and on-screen). Adds "Usually within ±N%." only once a margin is set. */
export function accuracyText(accuracy: { marginPercent: number | null; note: string } = ACCURACY): string {
  const margin = accuracy.marginPercent;
  return margin !== null && Number.isFinite(margin) && margin > 0 ? `${accuracy.note} Usually within ±${margin}%.` : accuracy.note;
}
