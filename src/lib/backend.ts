export const BACKEND_STORAGE = "agentnexus_backend";

/** URL of the Cloudflare Worker backend (ripoai-nvidia) for NVIDIA chat + image gen. */
export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const u = window.localStorage.getItem(BACKEND_STORAGE);
    if (u) return u.trim().replace(/\/+$/, "");
  }
  return "";
}

export function hasBackend(): boolean {
  return !!getBackendUrl();
}
