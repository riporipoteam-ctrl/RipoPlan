export const UNFILTERED_STORAGE = "agentnexus_unfiltered";

/** 18+ unfiltered mode (per-device). When on, agents speak freely. */
export function getUnfiltered(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(UNFILTERED_STORAGE) === "1";
}
