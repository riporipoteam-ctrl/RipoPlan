// Map stored emoji keywords -> display glyphs (kept as keywords in DB for portability)
export const EMOJI: Record<string, string> = {
  sparkles: "✨",
  pencil: "✏️",
  magnifier: "🔍",
  wrench: "🛠️",
  globe: "🌐",
  robot: "🤖",
  rocket: "🚀",
  brain: "🧠",
  chart: "📊",
  mail: "✉️",
  code: "💻",
  camera: "📷",
  calendar: "📅",
  bell: "🔔",
  bolt: "⚡",
};

export function emojiFor(key?: string | null): string {
  if (!key) return EMOJI.robot;
  return EMOJI[key] || (key.length <= 2 ? key : EMOJI.robot);
}

export const AGENT_COLORS = [
  "#d633b9",
  "#10b981",
  "#14b8a6",
  "#8b5cf6",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
];
