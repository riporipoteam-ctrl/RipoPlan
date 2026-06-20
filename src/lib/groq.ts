import Groq from "groq-sdk";

export const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.6-27b";

let _client: Groq | null = null;

export function groq() {
  if (!_client) {
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
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
