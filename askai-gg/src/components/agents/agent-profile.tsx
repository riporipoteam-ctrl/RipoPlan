"use client";

import Link from "next/link";
import { Activity, CalendarClock, LockKeyhole, Orbit, Wrench } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useInitializeWorkspace } from "@/hooks/use-initialize-workspace";
import type { Agent, AgentRun, Integration, WorkspaceSnapshot } from "@/lib/types";
import { formatRelativeLabel } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";

type AgentProfileProps = {
  snapshot: WorkspaceSnapshot;
  agentId: string;
};

function getTone(agent: Agent) {
  return agent.status === "running" ? "green" : agent.status === "idle" ? "amber" : "slate";
}

export function AgentProfile({ snapshot, agentId }: AgentProfileProps) {
  useInitializeWorkspace(snapshot);

  const storeWorkspace = useWorkspaceStore((state) => state.workspace);
  const storeCurrentUser = useWorkspaceStore((state) => state.currentUser);
  const storeChannels = useWorkspaceStore((state) => state.channels);
  const storeAgents = useWorkspaceStore((state) => state.agents);
  const storeRunsByAgent = useWorkspaceStore((state) => state.runsByAgent);
  const storeIntegrations = useWorkspaceStore((state) => state.integrations);
  const storeNotifications = useWorkspaceStore((state) => state.notifications);

  const workspace = storeWorkspace.id ? storeWorkspace : snapshot.workspace;
  const currentUser = storeCurrentUser.id ? storeCurrentUser : snapshot.currentUser;
  const channels = storeChannels.length > 0 ? storeChannels : snapshot.channels;
  const agents = storeAgents.length > 0 ? storeAgents : snapshot.agents;
  const runsByAgent =
    Object.keys(storeRunsByAgent).length > 0 ? storeRunsByAgent : snapshot.runsByAgent;
  const integrations =
    storeIntegrations.length > 0 ? storeIntegrations : snapshot.integrations;
  const notifications =
    storeNotifications.length > 0 ? storeNotifications : snapshot.notifications;

  const agent = agents.find((item) => item.id === agentId) ?? agents[0];
  const runs = runsByAgent[agent.id] ?? [];
  const grantedIntegrations = integrations.filter((item) => item.approvedAgents.includes(agent.id));

  return (
    <AppShell
      workspace={workspace}
      currentUser={currentUser}
      channels={channels}
      agents={agents}
      notificationsCount={notifications.length}
      title={agent.name}
      subtitle={agent.summary}
      actions={<StatusBadge label={agent.status} tone={getTone(agent)} />}
      aside={<AgentSidePanel integrations={grantedIntegrations} />}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <SectionCard eyebrow="Profile" title="Identity and execution">
          <div className="flex flex-col gap-5 rounded-[28px] border border-white/10 bg-[#07111d] p-5 md:flex-row md:items-center">
            <div className={`grid h-28 w-28 place-items-center rounded-[28px] bg-gradient-to-br ${agent.color} text-4xl font-black text-white`}>
              {agent.name[0]}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-serif text-4xl font-semibold text-white">{agent.name}</h3>
                <StatusBadge label={agent.model} tone="fuchsia" />
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">{agent.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-200"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <MiniMetric icon={Orbit} label="Visibility" value={agent.visibility} />
            <MiniMetric icon={CalendarClock} label="Schedule" value={agent.schedule ?? "Manual + mentions"} />
            <MiniMetric icon={Wrench} label="Tools" value={`${agent.tools.length} enabled`} />
            <MiniMetric icon={Activity} label="Last run" value={agent.lastRunLabel} />
          </div>
        </SectionCard>

        <SectionCard eyebrow="Goals" title="What this agent owns">
          <div className="space-y-3">
            {agent.goals.map((goal) => (
              <div key={goal} className="rounded-[20px] border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                {goal}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[24px] border border-cyan-300/10 bg-cyan-400/6 p-4">
            <p className="text-sm text-slate-200">
              Mention <span className="font-semibold text-white">@{agent.handle}</span> in a shared channel to start an auditable run with visible updates.
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
        <SectionCard eyebrow="Run History" title="Recent activity">
          <div className="space-y-3">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Navigate" title="Related surfaces">
          <div className="space-y-3">
            <Link
              href="/channels/channel-general"
              className="block rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/8"
            >
              Return to channel workspace
            </Link>
            <Link
              href="/integrations"
              className="block rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/8"
            >
              Review integration permissions
            </Link>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <Icon className="h-5 w-5 text-fuchsia-300" />
      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function RunCard({ run }: { run: AgentRun }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge label={run.status} tone={run.status === "succeeded" ? "green" : "amber"} />
        <span className="text-xs text-slate-400">{formatRelativeLabel(run.createdAt)}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{run.summary}</p>
      <div className="mt-3 space-y-2 text-sm text-slate-300">
        {run.logs.map((log) => (
          <p key={log}>{log}</p>
        ))}
      </div>
    </div>
  );
}

function AgentSidePanel({ integrations }: { integrations: Integration[] }) {
  return (
    <div className="space-y-4">
      <SectionCard eyebrow="Permissions" title="Granted integrations">
        <div className="space-y-3">
          {integrations.length > 0 ? (
            integrations.map((integration) => (
              <div
                key={integration.id}
                className="rounded-[20px] border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center gap-2 text-white">
                  <LockKeyhole className="h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold">{integration.provider}</p>
                </div>
                <p className="mt-2 text-sm text-slate-300">{integration.description}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-300">No external integrations approved yet.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
