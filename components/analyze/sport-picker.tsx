"use client";

import { SPORT_REGISTRY } from "@/lib/sports/registry";

/** The sport dropdown: all 22 sports from the registry. Shown before the video is chosen (Upload step). */
export function SportPicker({ value, onPick }: { value: string | null; onPick: (sportId: string) => void }) {
  return (
    <label className="block text-left">
      <span className="label">What sport is this?</span>
      <select className="field sm:max-w-xs" value={value ?? ""} onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="" disabled>
          Choose a sport…
        </option>
        {SPORT_REGISTRY.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
