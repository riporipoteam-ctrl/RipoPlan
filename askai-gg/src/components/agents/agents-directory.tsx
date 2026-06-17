"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Plus, Sparkles, Wand2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useInitializeWorkspace } from "@/hooks/use-initialize-workspace";
import type { AgentDraft, WorkspaceSnapshot } from "@/lib/types";
import { useWorkspaceStore } from "@/store/workspace-store";

type AgentsDirectoryProps = {
  snapshot: WorkspaceSnapshot;
};

const suggestedPrompts = [
  "Create a Research Agent that daily searches AI news, summarizes it, and posts to #news.",
  "Create a Code Reviewer agent that monitors GitHub PRs and leaves concise review notes.",
  "Create an Operations Agent that checks inbox triage and posts blockers to #general.",
];

export function AgentsDirectory({ snapshot }: AgentsDirectoryProps) {
  useInitializeWorkspace(snapshot);

  const [prompt, setPrompt] = useState(suggestedPrompts[0]);
  const [loading, setLoading] = useState(false);

  const storeWorkspace = useWorkspaceStore((state) => state.workspace);
  const storeCurrentUser = useWorkspaceStore((state) => state.currentUser);
  const storeChannels = useWorkspaceStore((state) => state.channels);
  const storeAgents = useWorkspaceStore((state) => state.agents);
  const storeNotifications = useWorkspaceStore((state) => state.notifications);
  const addAgent = useWorkspaceStore((state) => state.addAgent);
  const draft = useWorkspaceStore((state) => state.draft);
  const setAgentDraft = useWorkspaceStore((state) => state.setAgentDraft);

  const workspace = storeWorkspace.id ? storeWorkspace : snapshot.workspace;
  const currentUser = storeCurrentUser.id ? storeCurrentUser : snapshot.currentUser;
  const channels = storeChannels.length > 0 ? storeChannels : snapshot.channels;
  const agents = storeAgents.length > 0 ? storeAgents : snapshot.agents;
  const notifications =
    storeNotifications.length > 0 ? storeNotifications : snapshot.notifications;

  async function generateDraft() {
    setLoading(true);
    const response = await fetch("/api/agents/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, workspaceId: workspace.id }),
    });
    const payload = await response.json();
    setAgentDraft(payload.draft as AgentDraft);
    setLoading(false);
  }

  async function createAgent() {
    if (!draft) {
      return;
    }

    setLoading(true);
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const payload = await response.json();
    addAgent(payload.agent);
    setLoading(false);
  }

  return (
    <AppShell
      workspace={workspace}
      currentUser={currentUser}
      channels={channels}
      agents={agents}
      notificationsCount={notifications.length}
      title="Agents"
      subtitle="Spin up specialist teammates from natural language, then edit their tools, goals, and schedules."
      actions={<StatusBadge label={`${agents.length} active`} tone="green" />}
      aside={
        <SectionCard eyebrow="Templates" title="Recommended starters">
          <div className="space-y-3">
            {["Daily digest", "Code reviewer", "Founder desk", "Support triage"].map((label) => (
              <button
                key={label}
                onClick={() => setPrompt(`Create a ${label} agent for this workspace.`)}
                className="w-full rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/8"
              >
                {label}
              </button>
            ))}
          </div>
        </SectionCard>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <SectionCard eyebrow="Create" title="Describe your next agent">
          <div className="rounded-[28px] border border-white/10 bg-[#07111d] p-4">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-32 w-full resize-none bg-transparent text-sm leading-7 text-white outline-none placeholder:text-slate-500"
              placeholder="Describe the role, tools, schedule, and output you want."
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestedPrompts.map((item) => (
                <button
                  key={item}
                  onClick={() => setPrompt(item)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/8"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={generateDraft}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:opacity-60"
              >
                <Wand2 className="h-4 w-4" />
                {loading ? "Thinking..." : "Generate draft"}
              </button>
              <button
                onClick={createAgent}
                disabled={!draft || loading}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Create agent
              </button>
            </div>
          </div>

          {draft ? (
            <div className="mt-4 rounded-[28px] border border-cyan-300/10 bg-cyan-400/6 p-4">
              <div className="flex items-center gap-2 text-cyan-200">
                <Sparkles className="h-4 w-4" />
                Draft ready
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-200">
                <p>
                  <span className="text-slate-400">Name:</span> {draft.name}
                </p>
                <p>
                  <span className="text-slate-400">Handle:</span> @{draft.handle}
                </p>
                <p>
                  <span className="text-slate-400">Description:</span> {draft.description}
                </p>
                <p>
                  <span className="text-slate-400">Tools:</span> {draft.tools.join(", ")}
                </p>
                <p>
                  <span className="text-slate-400">Schedule:</span> {draft.schedule ?? "None"}
                </p>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Directory" title="Workspace agent roster">
          <div className="space-y-3">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:bg-white/8"
              >
                <div
                  className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${agent.color} text-sm font-black text-white`}
                >
                  {agent.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-white">{agent.name}</p>
                    <StatusBadge
                      label={agent.status}
                      tone={agent.status === "running" ? "green" : "slate"}
                    />
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{agent.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {agent.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
                <Bot className="h-5 w-5 text-slate-400" />
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
