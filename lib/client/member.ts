"use client";

// The club member's own name, remembered in this browser so it can be shown next to the games they are in charge of.
// There are no per-person accounts (one shared password), so this is a label the person types, not a login.
// Never a student from the footage. Stored only in this browser until a game is claimed.

import { useSyncExternalStore } from "react";

const KEY = "club-member-name";
const listeners = new Set<() => void>();

export const NAME_PATTERN = /^[\p{L}][\p{L} .'’-]*$/u;

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 40 && NAME_PATTERN.test(name) ? name : null;
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let memory: string | null = null; // used when localStorage is blocked, so the name still works for this visit

export function getMemberName(): string | null {
  return read() ?? memory;
}

export function setMemberName(raw: string): string | null {
  const name = cleanName(raw);
  if (!name) return null;
  memory = name;
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* the name still lives in memory for this visit */
  }
  listeners.forEach((l) => l());
  return name;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

/** The saved name, or null before one is typed (and null during the server render). */
export const useMemberName = () => useSyncExternalStore(subscribe, getMemberName, () => null);
