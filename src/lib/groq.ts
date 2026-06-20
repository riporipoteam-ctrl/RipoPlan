import Groq from "groq-sdk";

// Browser-side Groq. The key is baked into the static bundle (public) — this is
// required for a serverless GitHub Pages deployment. Use a restricted/rotatable key.
export const GROQ_MODEL = process.env.NEXT_PUBLIC_GROQ_MODEL || "qwen/qwen3.6-27b";

export const GROQ_KEY_STORAGE = "agentnexus_groq_key";

/** Resolve the Groq key: user-provided (localStorage) wins, then build-time env. */
export function getGroqKey(): string {
  if (typeof window !== "undefined") {
    const k = window.localStorage.getItem(GROQ_KEY_STORAGE);
    if (k) return k.trim();
  }
  return process.env.NEXT_PUBLIC_GROQ_API_KEY || "";
}

export function hasGroqKey(): boolean {
  return !!getGroqKey();
}

export function groq() {
  // Re-create per call so a freshly-saved key takes effect immediately.
  return new Groq({ apiKey: getGroqKey(), dangerouslyAllowBrowser: true });
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
};
