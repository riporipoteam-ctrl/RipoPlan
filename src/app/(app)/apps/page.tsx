"use client";

import { Globe, Search, Code2, ImageIcon, Users, Brain, Github, Zap } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/session";

// Capabilities that work right now, with no keys and no sign-in. These are the
// tools every agent already has access to from the browser.
const CAPABILITIES = [
  { icon: Search, label: "Web Search", description: "Live web search across multiple engines + Wikipedia", color: "#4285f4" },
  { icon: Globe, label: "Live Browser", description: "Open & read any page, follow links, extract content", color: "#0f9d58" },
  { icon: Code2, label: "Code Runner", description: "Write & run code in a sandbox to compute answers", color: "#6e5494" },
  { icon: ImageIcon, label: "Image Generation", description: "Create images from a text prompt", color: "#ea4335" },
  { icon: Users, label: "Agent Teamwork", description: "Spin up new agents and delegate work between them", color: "#5e6ad2" },
  { icon: Brain, label: "Shared Memory", description: "Agents remember facts across every chat, new and old", color: "#ff6b6b" },
  { icon: Github, label: "GitHub (read)", description: "Search public repos, read code, issues & PRs", color: "#24292e" },
];

export default function AppsPage() {
  const { ctx } = useSession();

  return (
    <>
      <TopBar title="Integrations" subtitle="Built-in capabilities — no keys needed" profileName={ctx?.profile.display_name} profileColor={ctx?.profile.avatar_color} />
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="rounded-2xl border border-emerald-300/40 bg-emerald-50 p-3 text-xs text-emerald-800">
          Every capability below is already on for your agents — no API keys, no sign-in, no setup. Just ask in any chat.
        </div>
        {CAPABILITIES.map((c) => (
          <div key={c.label} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: c.color }}>
              <c.icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{c.label}</div>
              <div className="truncate text-xs text-[var(--muted)]">{c.description}</div>
            </div>
            <span className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
              <Zap size={12} /> Active
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
