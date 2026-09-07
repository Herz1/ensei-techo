"use client";

import { useSyncExternalStore } from "react";

export type Frontend = "classic" | "paper";
export const FRONTEND_KEY = "ensei-frontend";
const CHANGE = "ensei-frontend-change";
let fallback: Frontend = "classic";
let memoryOverride: Frontend | null = null;
function snapshot(): Frontend {
  if (memoryOverride) return memoryOverride;
  try { return localStorage.getItem(FRONTEND_KEY) === "paper" ? "paper" : "classic"; }
  catch { return fallback; }
}
function subscribe(notify: () => void) {
  const update = () => { document.documentElement.dataset.frontend = snapshot(); notify(); };
  const storage = (event: StorageEvent) => { if (event.key === FRONTEND_KEY || event.key === null) { memoryOverride = null; update(); } };
  window.addEventListener(CHANGE, update);
  window.addEventListener("storage", storage);
  update();
  return () => { window.removeEventListener(CHANGE, update); window.removeEventListener("storage", storage); };
}
export function setFrontend(mode: Frontend) {
  fallback = mode;
  try { localStorage.setItem(FRONTEND_KEY, mode); memoryOverride = null; }
  catch { memoryOverride = mode; /* Includes full storage as well as disabled storage. */ }
  document.documentElement.dataset.frontend = mode;
  window.dispatchEvent(new Event(CHANGE));
}
export function useFrontend() { return useSyncExternalStore(subscribe, snapshot, () => "classic" as const); }
