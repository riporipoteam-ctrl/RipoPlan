export const BACKEND_STORAGE = "agentnexus_backend";

/** Build-time default backend URL, injected from the BACKEND_URL repo variable
 * via NEXT_PUBLIC_BACKEND_URL during the Pages build. Lets NVIDIA chat + image
 * generation work for every user with no per-device setup. */
const DEFAULT_BACKEND = (process.env.NEXT_PUBLIC_BACKEND_URL || "").trim().replace(/\/+$/, "");

/** URL of the Cloudflare Worker backend (ripoai-nvidia) for NVIDIA chat + image gen.
 * A per-device override in localStorage wins over the build-time default. */
export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const u = window.localStorage.getItem(BACKEND_STORAGE);
    if (u) return u.trim().replace(/\/+$/, "");
  }
  return DEFAULT_BACKEND;
}

export function hasBackend(): boolean {
  return !!getBackendUrl();
}
