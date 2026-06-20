import Groq from "groq-sdk";

// Browser-side Groq. The key is baked into the static bundle (public) — this is
// required for a serverless GitHub Pages deployment. Use a restricted/rotatable key.
export const GROQ_MODEL = process.env.NEXT_PUBLIC_GROQ_MODEL || "qwen/qwen3.6-27b";

// The Groq key is injected at build time from NEXT_PUBLIC_GROQ_API_KEY
// (set as a GitHub repo secret for the Pages build). It is baked into the
// public client bundle by design — use a key you can rotate.
const GROQ_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY || "";

let _client: Groq | null = null;

export function groq() {
  if (!_client) {
    _client = new Groq({ apiKey: GROQ_KEY, dangerouslyAllowBrowser: true });
  }
  return _client;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
};
