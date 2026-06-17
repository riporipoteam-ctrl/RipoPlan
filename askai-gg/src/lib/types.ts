export type MemberRole = "owner" | "member" | "agent";
export type ChannelKind = "public" | "private" | "dm";
export type AgentStatus = "online" | "idle" | "running" | "paused";
export type AuthorType = "human" | "agent" | "system";
export type RunStatus = "queued" | "running" | "succeeded" | "failed";
export type TriggerType = "mention" | "schedule" | "manual" | "workflow";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  membersCount: number;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatar: string;
};

export type Channel = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  kind: ChannelKind;
  unreadCount: number;
};

export type Agent = {
  id: string;
  workspaceId: string;
  name: string;
  handle: string;
  description: string;
  goals: string[];
  status: AgentStatus;
  model: string;
  tools: string[];
  schedule: string | null;
  visibility: "workspace" | "private";
  lastRunLabel: string;
  summary: string;
  color: string;
};

export type Message = {
  id: string;
  channelId: string;
  authorType: AuthorType;
  authorId: string;
  authorName: string;
  avatar: string;
  body: string;
  mentions: string[];
  threadId: string | null;
  attachments: string[];
  createdAt: string;
};

export type AgentRun = {
  id: string;
  agentId: string;
  triggerType: TriggerType;
  status: RunStatus;
  summary: string;
  logs: string[];
  createdAt: string;
};

export type Integration = {
  id: string;
  provider: string;
  status: "connected" | "needs-auth" | "coming-soon";
  description: string;
  scopes: string[];
  approvedAgents: string[];
};

export type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "success" | "warning";
  createdAt: string;
};

export type ThreadSummary = {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  description: string;
  participantIds: string[];
  unreadCount: number;
  updatedAt: string;
};

export type AgentDraft = {
  name: string;
  handle: string;
  description: string;
  goals: string[];
  tools: string[];
  schedule: string | null;
  visibility: "workspace" | "private";
};

export type WorkspaceSnapshot = {
  workspace: Workspace;
  currentUser: User;
  channels: Channel[];
  agents: Agent[];
  messagesByChannel: Record<string, Message[]>;
  runsByAgent: Record<string, AgentRun[]>;
  integrations: Integration[];
  notifications: NotificationItem[];
  recentThreads: ThreadSummary[];
};

export type MessageResponse = {
  userMessage: Message;
  agentMessages: Message[];
  newRuns: AgentRun[];
  updatedAgents: Agent[];
};
