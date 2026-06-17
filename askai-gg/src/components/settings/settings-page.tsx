"use client";

import { KeyRound, ShieldCheck, Users2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useInitializeWorkspace } from "@/hooks/use-initialize-workspace";
import type { WorkspaceSnapshot } from "@/lib/types";
import { useWorkspaceStore } from "@/store/workspace-store";

export function SettingsPage({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  useInitializeWorkspace(snapshot);

  const storeWorkspace = useWorkspaceStore((state) => state.workspace);
  const storeCurrentUser = useWorkspaceStore((state) => state.currentUser);
  const storeChannels = useWorkspaceStore((state) => state.channels);
  const storeAgents = useWorkspaceStore((state) => state.agents);
  const storeNotifications = useWorkspaceStore((state) => state.notifications);

  const workspace = storeWorkspace.id ? storeWorkspace : snapshot.workspace;
  const currentUser = storeCurrentUser.id ? storeCurrentUser : snapshot.currentUser;
  const channels = storeChannels.length > 0 ? storeChannels : snapshot.channels;
  const agents = storeAgents.length > 0 ? storeAgents : snapshot.agents;
  const notifications =
    storeNotifications.length > 0 ? storeNotifications : snapshot.notifications;

  return (
    <AppShell
      workspace={workspace}
      currentUser={currentUser}
      channels={channels}
      agents={agents}
      notificationsCount={notifications.length}
      title="Settings"
      subtitle="Workspace governance for members, auth, and safe agent execution."
      actions={<StatusBadge label="Owner controls" tone="fuchsia" />}
      aside={
        <SectionCard eyebrow="Production Notes" title="Hardening roadmap">
          <ul className="space-y-3 text-sm text-slate-300">
            <li>Use Supabase Auth or Clerk for production-grade email and OAuth flows.</li>
            <li>Encrypt provider tokens with KMS-backed secrets and audit access.</li>
            <li>Move tool execution into isolated workers or sandboxed containers.</li>
          </ul>
        </SectionCard>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <SectionCard eyebrow="Team" title={`${workspace.membersCount} workspace members`}>
          <Users2 className="h-5 w-5 text-cyan-300" />
          <p className="mt-4 text-sm text-slate-300">
            Invite teammates, assign owner or member roles, and distinguish agents from humans in every channel.
          </p>
        </SectionCard>
        <SectionCard eyebrow="Auth" title="Email + OAuth ready">
          <KeyRound className="h-5 w-5 text-fuchsia-300" />
          <p className="mt-4 text-sm text-slate-300">
            Production integration targets include email magic links plus Google and GitHub OAuth.
          </p>
        </SectionCard>
        <SectionCard eyebrow="Security" title="Guardrails first">
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
          <p className="mt-4 text-sm text-slate-300">
            Agents only act with explicit scopes, visible logs, rate limits, and escalation paths for risky actions.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
