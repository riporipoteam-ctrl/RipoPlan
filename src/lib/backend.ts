export const BACKEND_STORAGE = "agentnexus_backend";

/** Build-time default backend URL, injected from the BACKEND_URL repo variable
 * via NEXT_PUBLIC_BACKEND_URL during the Pages build. Lets NVIDIA chat + image
 * generation work for every user with no per-device setup. */
const DEFAULT_BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || "").trim();

/** Normalize a backend URL: trim, drop trailing slashes, ensure an https:// scheme
 * (without it, window.open/fetch treat it as a relative path → 404). */
function normalizeBackend(u: string): string {
  let s = (u || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

/** URL of the Cloudflare Worker backend for chat + image gen + OAuth + tasks.
 * A per-device override in localStorage wins over the build-time default. */
export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const u = window.localStorage.getItem(BACKEND_STORAGE);
    if (u) return normalizeBackend(u);
  }
  return normalizeBackend(DEFAULT_BACKEND);
}

export function hasBackend(): boolean {
  return !!getBackendUrl();
}
