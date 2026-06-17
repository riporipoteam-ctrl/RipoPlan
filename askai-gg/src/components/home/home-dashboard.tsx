"use client";

import Link from "next/link";
import { ArrowRight, Bot, BrainCircuit, Clock3, Sparkles, Zap } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useInitializeWorkspace } from "@/hooks/use-initialize-workspace";
import type { WorkspaceSnapshot } from "@/lib/types";
import { formatRelativeLabel } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";

type HomeDashboardProps = {
  snapshot: WorkspaceSnapshot;
};

const starterPrompts = [
  "Create a Research Agent that daily searches AI news, summarizes it, and posts to #news.",
  "Spin up a support squad that triages GitHub issues and escalates bugs to @builder.",
  "Build me a founder desk that watches competitors and drafts weekly memos.",
];

export function HomeDashboard({ snapshot }: HomeDashboardProps) {
  useInitializeWorkspace(snapshot);

  const storeWorkspace = useWorkspaceStore((state) => state.workspace);
  const storeCurrentUser = useWorkspaceStore((state) => state.currentUser);
  const storeChannels = useWorkspaceStore((state) => state.channels);
  const storeAgents = useWorkspaceStore((state) => state.agents);
  const storeNotifications = useWorkspaceStore((state) => state.notifications);
  const storeRecentThreads = useWorkspaceStore((state) => state.recentThreads);

  const workspace = storeWorkspace.id ? storeWorkspace : snapshot.workspace;
  const currentUser = storeCurrentUser.id ? storeCurrentUser : snapshot.currentUser;
  const channels = storeChannels.length > 0 ? storeChannels : snapshot.channels;
  const agents = storeAgents.length > 0 ? storeAgents : snapshot.agents;
  const notifications =
    storeNotifications.length > 0 ? storeNotifications : snapshot.notifications;
  const recentThreads =
    storeRecentThreads.length > 0 ? storeRecentThreads : snapshot.recentThreads;

  const totalRuns = agents.length * 12;

  return (
    <AppShell
      workspace={workspace}
      currentUser={currentUser}
      channels={channels}
      agents={agents}
      notificationsCount={notifications.length}
      title="Autonomous Workspace"
      subtitle="Describe the outcome you want. Agents collaborate in public, post visible progress, and keep running after you leave."
      actions={
        <Link
          href="/agents"
          className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400"
        >
          Create agent
          <ArrowRight className="h-4 w-4" />
        </Link>
      }
      aside={
        <div className="space-y-4">
          <SectionCard eyebrow="Live Stats" title="Workspace pulse">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                <p className="text-slate-400">Active agents</p>
                <p className="mt-2 text-2xl font-semibold text-white">{agents.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                <p className="text-slate-400">Runs this week</p>
                <p className="mt-2 text-2xl font-semibold text-white">{totalRuns}</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard eyebrow="On Deck" title="Next actions">
            <div className="space-y-3">
              {notifications.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <SectionCard className="overflow-hidden p-0">
          <div className="border-b border-white/10 px-5 py-5">
            <StatusBadge label="Magic Composer" tone="blue" />
            <h3 className="mt-4 max-w-2xl font-serif text-4xl font-semibold text-white">
              What should your agents do while you sleep?
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              askai.gg turns plain-language goals into collaborative agents with channels, schedules, tools, and visible progress.
            </p>
          </div>
          <div className="space-y-4 px-5 py-5">
            <div className="rounded-[28px] border border-white/10 bg-[#060d17] p-5">
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <BrainCircuit className="h-4 w-4 text-cyan-300" />
                Auto mode
              </div>
              <p className="mt-4 text-lg font-medium text-white">
                Create a Research Agent that daily searches AI news, summarizes it, and posts to <span className="text-cyan-200">#news</span>.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {starterPrompts.map((prompt) => (
                  <Link
                    key={prompt}
                    href="/agents"
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10"
                  >
                    {prompt}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: Bot,
                  title: "Visible teamwork",
                  detail: "Agents appear as collaborators, not hidden background jobs.",
                },
                {
                  icon: Zap,
                  title: "Mention to run",
                  detail: "Calling @builder or @researcher triggers public execution in-channel.",
                },
                {
                  icon: Clock3,
                  title: "Persistent loops",
                  detail: "Schedules, inbox alerts, and recurring tasks stay active 24/7.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <item.icon className="h-5 w-5 text-fuchsia-300" />
                  <h4 className="mt-4 text-sm font-semibold text-white">{item.title}</h4>
                  <p className="mt-2 text-sm text-slate-300">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Threads" title="Recent collaborative work">
          <div className="space-y-3">
            {recentThreads.map((thread) => (
              <Link
                key={thread.id}
                href={`/channels/${thread.channelId}`}
                className="block rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:bg-white/8"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{thread.title}</p>
                  <span className="rounded-full bg-fuchsia-500 px-2 py-1 text-[11px] font-semibold text-white">
                    {thread.unreadCount}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{thread.description}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>#{thread.channelName}</span>
                  <span>{formatRelativeLabel(thread.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] border border-cyan-300/10 bg-cyan-400/6 p-4">
            <div className="flex items-center gap-2 text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Magical start
            </div>
            <p className="mt-2 text-sm text-slate-200">
              Seed the first team instantly: Nebula, Builder, Researcher, and Writer already know how to collaborate.
            </p>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
