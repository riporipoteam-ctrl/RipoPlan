"use client";

import { CheckCircle2, Lock, PlugZap } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useInitializeWorkspace } from "@/hooks/use-initialize-workspace";
import type { WorkspaceSnapshot } from "@/lib/types";
import { useWorkspaceStore } from "@/store/workspace-store";

export function IntegrationsPage({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  useInitializeWorkspace(snapshot);

  const storeWorkspace = useWorkspaceStore((state) => state.workspace);
  const storeCurrentUser = useWorkspaceStore((state) => state.currentUser);
  const storeChannels = useWorkspaceStore((state) => state.channels);
  const storeAgents = useWorkspaceStore((state) => state.agents);
  const storeIntegrations = useWorkspaceStore((state) => state.integrations);
  const storeNotifications = useWorkspaceStore((state) => state.notifications);

  const workspace = storeWorkspace.id ? storeWorkspace : snapshot.workspace;
  const currentUser = storeCurrentUser.id ? storeCurrentUser : snapshot.currentUser;
  const channels = storeChannels.length > 0 ? storeChannels : snapshot.channels;
  const agents = storeAgents.length > 0 ? storeAgents : snapshot.agents;
  const integrations =
    storeIntegrations.length > 0 ? storeIntegrations : snapshot.integrations;
  const notifications =
    storeNotifications.length > 0 ? storeNotifications : snapshot.notifications;

  return (
    <AppShell
      workspace={workspace}
      currentUser={currentUser}
      channels={channels}
      agents={agents}
      notificationsCount={notifications.length}
      title="Integrations"
      subtitle="OAuth-ready connectors with per-agent approval scopes and clear security boundaries."
      actions={<StatusBadge label="Permissioned" tone="blue" />}
      aside={
        <SectionCard eyebrow="Security" title="Scope model">
          <p className="text-sm leading-7 text-slate-300">
            Each integration grants user-approved scopes first, then maps a subset of those scopes to specific agents.
          </p>
        </SectionCard>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <SectionCard key={integration.id} eyebrow={integration.provider} title={integration.description}>
            <div className="flex items-center gap-3">
              <StatusBadge
                label={integration.status}
                tone={
                  integration.status === "connected"
                    ? "green"
                    : integration.status === "needs-auth"
                      ? "amber"
                      : "slate"
                }
              />
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Lock className="h-4 w-4" />
                Least privilege
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {integration.scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300"
                >
                  {scope}
                </span>
              ))}
            </div>
            <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                {integration.status === "connected" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                ) : (
                  <PlugZap className="h-4 w-4 text-cyan-300" />
                )}
                Approved agents
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {integration.approvedAgents.length > 0
                  ? agents
                      .filter((agent) => integration.approvedAgents.includes(agent.id))
                      .map((agent) => agent.name)
                      .join(", ")
                  : "No agents approved yet"}
              </p>
            </div>
          </SectionCard>
        ))}
      </div>
    </AppShell>
  );
}
