"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { IntegrationCard } from "@/components/IntegrationCard";

const CATALOG = [
  { provider: "gmail", label: "Gmail", description: "Read & send email on your behalf", glyph: "✉️", color: "#ea4335" },
  { provider: "google_calendar", label: "Google Calendar", description: "Schedule & manage events", glyph: "📅", color: "#4285f4" },
  { provider: "google_drive", label: "Google Drive", description: "Read & write files and docs", glyph: "📁", color: "#0f9d58" },
  { provider: "github", label: "GitHub", description: "Issues, PRs, code & reviews", glyph: "🐙", color: "#24292e" },
  { provider: "slack", label: "Slack", description: "Post & read messages in channels", glyph: "💬", color: "#4a154b" },
  { provider: "notion", label: "Notion", description: "Create & update pages and databases", glyph: "📝", color: "#000000" },
  { provider: "linear", label: "Linear", description: "Create & track issues and projects", glyph: "📐", color: "#5e6ad2" },
  { provider: "sheets", label: "Google Sheets", description: "Read & update spreadsheets", glyph: "📊", color: "#0f9d58" },
];

export default function AppsPage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [connected, setConnected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ctx) return;
    supabase
      .from("integrations")
      .select("provider,status")
      .eq("workspace_id", ctx.workspace.id)
      .then(({ data }) => {
        setConnected(new Set((data || []).filter((i: any) => i.status === "connected").map((i: any) => i.provider)));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  return (
    <>
      <TopBar title="Apps" subtitle="Connect your tools so agents can act" profileName={ctx?.profile.display_name} profileColor={ctx?.profile.avatar_color} />
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="rounded-2xl border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-800">
          Connecting grants agents permission to act in that tool. OAuth is simulated in this demo — add provider credentials to enable live connections.
        </div>
        {CATALOG.map((c) => (
          <IntegrationCard key={c.provider} {...c} connected={connected.has(c.provider)} />
        ))}
      </div>
    </>
  );
}
