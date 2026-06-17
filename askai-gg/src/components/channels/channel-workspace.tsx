"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, AtSign, Paperclip, ShieldCheck, Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useInitializeWorkspace } from "@/hooks/use-initialize-workspace";
import type { Channel, WorkspaceSnapshot } from "@/lib/types";
import { formatRelativeLabel } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";

type ChannelWorkspaceProps = {
  snapshot: WorkspaceSnapshot;
  channelId: string;
};

export function ChannelWorkspace({ snapshot, channelId }: ChannelWorkspaceProps) {
  useInitializeWorkspace(snapshot);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const storeWorkspace = useWorkspaceStore((state) => state.workspace);
  const storeCurrentUser = useWorkspaceStore((state) => state.currentUser);
  const storeChannels = useWorkspaceStore((state) => state.channels);
  const storeAgents = useWorkspaceStore((state) => state.agents);
  const storeNotifications = useWorkspaceStore((state) => state.notifications);
  const storeMessagesByChannel = useWorkspaceStore((state) => state.messagesByChannel);
  const appendConversation = useWorkspaceStore((state) => state.appendConversation);

  const workspace = storeWorkspace.id ? storeWorkspace : snapshot.workspace;
  const currentUser = storeCurrentUser.id ? storeCurrentUser : snapshot.currentUser;
  const channels = storeChannels.length > 0 ? storeChannels : snapshot.channels;
  const agents = storeAgents.length > 0 ? storeAgents : snapshot.agents;
  const notifications =
    storeNotifications.length > 0 ? storeNotifications : snapshot.notifications;
  const messagesByChannel =
    Object.keys(storeMessagesByChannel).length > 0
      ? storeMessagesByChannel
      : snapshot.messagesByChannel;

  const channel = useMemo<Channel>(
    () => channels.find((item) => item.id === channelId) ?? channels[0],
    [channelId, channels],
  );
  const messages = messagesByChannel[channel?.id] ?? [];

  async function onSubmit() {
    if (!draft.trim()) {
      return;
    }

    setSending(true);
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channel.id, body: draft }),
    });
    const payload = await response.json();
    appendConversation(channel.id, payload);
    setDraft("");
    setSending(false);
  }

  return (
    <AppShell
      workspace={workspace}
      currentUser={currentUser}
      channels={channels}
      agents={agents}
      notificationsCount={notifications.length}
      title={`#${channel?.name ?? "general"}`}
      subtitle={channel?.description ?? "Shared workspace conversation"}
      actions={
        <StatusBadge
          label={`${agents.filter((agent) => agent.status !== "paused").length} agents ready`}
          tone="green"
        />
      }
      aside={
        <div className="space-y-4">
          <SectionCard eyebrow="Participants" title="Humans + agents">
            <div className="space-y-3">
              {[currentUser, ...agents].map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-sm font-semibold text-white">
                    {"avatar" in participant ? participant.avatar : participant.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{participant.name}</p>
                    <p className="text-xs text-slate-400">
                      {"handle" in participant ? `@${participant.handle}` : participant.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Tips" title="Triggering agents">
            <div className="space-y-3 text-sm text-slate-300">
              <p>Mention `@builder`, `@researcher`, `@writer`, or `@nebula` to queue work.</p>
              <p>Agents reply in public so the rest of the workspace can audit the work.</p>
              <p>Scheduled jobs and approvals appear later in the inbox and integrations views.</p>
            </div>
          </SectionCard>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard className="flex min-h-[72vh] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <StatusBadge label="Live channel" tone="blue" />
              <p className="text-sm text-slate-300">{messages.length} messages</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Permissioned integrations only
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {messages.map((message) => (
              <article
                key={message.id}
                className="rounded-[24px] border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-sm font-black text-white">
                    {message.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-white">{message.authorName}</h3>
                      <p className="text-xs text-slate-400">
                        {formatRelativeLabel(message.createdAt)}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                      {message.body}
                    </p>
                    {message.attachments.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.attachments.map((attachment) => (
                          <span
                            key={attachment}
                            className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-300"
                          >
                            {attachment}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="border-t border-white/10 px-4 py-4">
            <div className="rounded-[28px] border border-white/10 bg-[#08111d] p-4">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Message (@ to mention). Try: @builder create the app shell and @researcher scan public Nebula references."
                className="min-h-28 w-full resize-none bg-transparent text-sm leading-7 text-white outline-none placeholder:text-slate-500"
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <AtSign className="h-4 w-4" />
                  Mention agents to trigger autonomous runs
                </div>
                <div className="flex items-center gap-2">
                  <button className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 text-slate-300 transition hover:bg-white/8">
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    onClick={onSubmit}
                    disabled={sending}
                    className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? "Sending..." : "Send"}
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard eyebrow="Fast Actions" title="Starter tasks">
            <div className="space-y-3">
              {[
                "Ask @researcher for a competitive scan",
                "Ask @writer to summarize the latest thread",
                "Ask @builder to draft the first implementation plan",
              ].map((item) => (
                <button
                  key={item}
                  onClick={() => setDraft(item.replace("Ask ", ""))}
                  className="w-full rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-white/8"
                >
                  {item}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Go Deeper" title="Connected views">
            <div className="space-y-3">
              <Link
                href="/agents"
                className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/8"
              >
                Open agent directory
                <Sparkles className="h-4 w-4 text-fuchsia-300" />
              </Link>
              <Link
                href="/integrations"
                className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/8"
              >
                Review integrations
                <ArrowUp className="h-4 w-4 rotate-45 text-cyan-300" />
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
