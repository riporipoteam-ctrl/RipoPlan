"use client";

import { BellRing, ShieldAlert, Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useInitializeWorkspace } from "@/hooks/use-initialize-workspace";
import type { WorkspaceSnapshot } from "@/lib/types";
import { formatRelativeLabel } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";

export function InboxPage({ snapshot }: { snapshot: WorkspaceSnapshot }) {
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
      title="Inbox"
      subtitle="Escalations, scheduled run completions, approvals, and collaboration nudges land here."
      actions={<StatusBadge label={`${notifications.length} unread`} tone="amber" />}
      aside={
        <SectionCard eyebrow="Escalation" title="Human in the loop">
          <p className="text-sm leading-7 text-slate-300">
            Agents can request approval before using integrations, taking external actions, or escalating ambiguous tasks.
          </p>
        </SectionCard>
      }
    >
      <SectionCard eyebrow="Activity Feed" title="Workspace events">
        <div className="space-y-3">
          {notifications.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/5 p-4"
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white">
                {item.severity === "warning" ? (
                  <ShieldAlert className="h-5 w-5 text-amber-300" />
                ) : item.severity === "success" ? (
                  <Sparkles className="h-5 w-5 text-emerald-300" />
                ) : (
                  <BellRing className="h-5 w-5 text-cyan-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <span className="text-xs text-slate-400">{formatRelativeLabel(item.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
