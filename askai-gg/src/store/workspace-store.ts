"use client";

import { create } from "zustand";

import type {
  Agent,
  AgentDraft,
  AgentRun,
  Message,
  NotificationItem,
  WorkspaceSnapshot,
} from "@/lib/types";

type WorkspaceState = WorkspaceSnapshot & {
  initialized: boolean;
  initialize: (snapshot: WorkspaceSnapshot) => void;
  appendConversation: (
    channelId: string,
    payload: {
      userMessage: Message;
      agentMessages: Message[];
      newRuns: AgentRun[];
      updatedAgents: Agent[];
    },
  ) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (agent: Agent) => void;
  pushNotification: (notification: NotificationItem) => void;
  setAgentDraft: (draft: AgentDraft | null) => void;
  draft: AgentDraft | null;
};

const emptySnapshot: WorkspaceSnapshot = {
  workspace: {
    id: "",
    name: "",
    slug: "",
    plan: "",
    membersCount: 0,
  },
  currentUser: {
    id: "",
    name: "",
    email: "",
    role: "member",
    avatar: "",
  },
  channels: [],
  agents: [],
  messagesByChannel: {},
  runsByAgent: {},
  integrations: [],
  notifications: [],
  recentThreads: [],
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...emptySnapshot,
  initialized: false,
  draft: null,
  initialize: (snapshot) => {
    if (get().initialized) {
      return;
    }

    set({
      ...snapshot,
      initialized: true,
    });
  },
  appendConversation: (channelId, payload) =>
    set((state) => {
      const existingMessages = state.messagesByChannel[channelId] ?? [];
      const nextMessages = [...existingMessages, payload.userMessage, ...payload.agentMessages];
      const nextRuns = { ...state.runsByAgent };

      payload.newRuns.forEach((run) => {
        nextRuns[run.agentId] = [run, ...(nextRuns[run.agentId] ?? [])];
      });

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: nextMessages,
        },
        runsByAgent: nextRuns,
        agents: state.agents.map((agent) => {
          const updated = payload.updatedAgents.find((item) => item.id === agent.id);
          return updated ?? agent;
        }),
      };
    }),
  addAgent: (agent) =>
    set((state) => ({
      agents: [agent, ...state.agents],
      notifications: [
        {
          id: `${agent.id}-created`,
          title: `${agent.name} is ready`,
          detail: `Mention @${agent.handle} in any channel to kick off its first run.`,
          severity: "success",
          createdAt: new Date().toISOString(),
        },
        ...state.notifications,
      ],
    })),
  updateAgent: (agent) =>
    set((state) => ({
      agents: state.agents.map((item) => (item.id === agent.id ? agent : item)),
    })),
  pushNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
    })),
  setAgentDraft: (draft) => set({ draft }),
}));
