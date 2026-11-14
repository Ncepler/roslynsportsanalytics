// Shown on Analyze and Season for sports that have no stat config yet. A normal state, not an error.
export function NoStats() {
  return (
    <div aria-disabled="true" className="rounded-[0.75rem] border border-dashed border-border-strong bg-surface-sunken px-5 py-8 text-center text-muted">
      <p className="font-medium text-text">Stats for this sport aren&apos;t set up yet</p>
      <p className="mt-1 text-sm">This team can still have a schedule. Analysis will be available once the sport&apos;s stats are added.</p>
    </div>
  );
}
