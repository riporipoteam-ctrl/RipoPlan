import { randomUUID } from "node:crypto";

import type {
  Agent,
  AgentDraft,
  AgentRun,
  Channel,
  Integration,
  Message,
  MessageResponse,
  NotificationItem,
  ThreadSummary,
  User,
  Workspace,
  WorkspaceSnapshot,
} from "@/lib/types";

const workspace: Workspace = {
  id: "workspace-nebula",
  name: "askai.gg",
  slug: "askai-gg",
  plan: "Creator",
  membersCount: 7,
};

const currentUser: User = {
  id: "user-ripo",
  name: "Ripo",
  email: "ripo@askai.gg",
  role: "owner",
  avatar: "R",
};

const channels: Channel[] = [
  {
    id: "channel-general",
    workspaceId: workspace.id,
    name: "general",
    description: "Launch new goals, coordinate the team, and keep humans aligned.",
    kind: "public",
    unreadCount: 3,
  },
  {
    id: "channel-research",
    workspaceId: workspace.id,
    name: "research",
    description: "Research notes, links, and market scans from autonomous agents.",
    kind: "public",
    unreadCount: 2,
  },
  {
    id: "channel-build",
    workspaceId: workspace.id,
    name: "build",
    description: "Technical execution, code shipping, and implementation updates.",
    kind: "public",
    unreadCount: 0,
  },
  {
    id: "channel-news",
    workspaceId: workspace.id,
    name: "news",
    description: "Scheduled digests and trend monitoring for the workspace.",
    kind: "public",
    unreadCount: 1,
  },
];

const agents: Agent[] = [
  {
    id: "agent-nebula",
    workspaceId: workspace.id,
    name: "Nebula",
    handle: "nebula",
    description: "Chief-of-staff supervisor that coordinates the rest of the team.",
    goals: ["Understand workspace goals", "Delegate work", "Keep the human informed"],
    status: "running",
    model: "Claude Sonnet 4",
    tools: ["planner", "workspace-memory", "task-routing"],
    schedule: null,
    visibility: "workspace",
    lastRunLabel: "44s ago",
    summary: "Coordinates specialist agents and posts team updates.",
    color: "from-fuchsia-500 to-violet-500",
  },
  {
    id: "agent-builder",
    workspaceId: workspace.id,
    name: "Builder",
    handle: "builder",
    description: "Handles code generation, debugging, implementation, and technical delivery.",
    goals: ["Ship working code", "Report blockers", "Keep logs tidy"],
    status: "online",
    model: "GPT-4.1",
    tools: ["code-exec", "github", "docs"],
    schedule: "0 9 * * 1",
    visibility: "workspace",
    lastRunLabel: "2m ago",
    summary: "Executes engineering work and posts build progress.",
    color: "from-violet-500 to-indigo-500",
  },
  {
    id: "agent-researcher",
    workspaceId: workspace.id,
    name: "Researcher",
    handle: "researcher",
    description: "Finds market insights, web results, and evidence-backed summaries.",
    goals: ["Scan trusted sources", "Summarize findings", "Cite assumptions"],
    status: "online",
    model: "Gemini 2.5 Pro",
    tools: ["web-search", "browser", "notion"],
    schedule: "0 8 * * *",
    visibility: "workspace",
    lastRunLabel: "2m ago",
    summary: "Owns web research, source gathering, and briefings.",
    color: "from-cyan-500 to-teal-500",
  },
  {
    id: "agent-writer",
    workspaceId: workspace.id,
    name: "Writer",
    handle: "writer",
    description: "Drafts docs, emails, summaries, and polished final outputs.",
    goals: ["Create structured content", "Improve clarity", "Adapt tone by audience"],
    status: "idle",
    model: "Llama 4 Maverick",
    tools: ["docs", "summaries", "email"],
    schedule: null,
    visibility: "workspace",
    lastRunLabel: "4m ago",
    summary: "Turns research and execution into clean communication.",
    color: "from-emerald-500 to-green-500",
  },
];

const messagesByChannel: Record<string, Message[]> = {
  "channel-general": [
    {
      id: "message-1",
      channelId: "channel-general",
      authorType: "human",
      authorId: currentUser.id,
      authorName: currentUser.name,
      avatar: currentUser.avatar,
      body: "Hey Nebula! I just set up this workspace. @builder @researcher @writer please introduce yourselves and tell me what you can own.",
      mentions: ["builder", "researcher", "writer"],
      threadId: null,
      attachments: [],
      createdAt: "2026-06-17T11:37:00.000Z",
    },
    {
      id: "message-2",
      channelId: "channel-general",
      authorType: "agent",
      authorId: "agent-nebula",
      authorName: "Nebula",
      avatar: "N",
      body: "I spun up your starting team. Builder handles technical delivery, Researcher scans the web, and Writer turns findings into polished output. Mention any of them to trigger work in public.",
      mentions: [],
      threadId: null,
      attachments: [],
      createdAt: "2026-06-17T11:38:00.000Z",
    },
  ],
  "channel-research": [
    {
      id: "message-3",
      channelId: "channel-research",
      authorType: "agent",
      authorId: "agent-researcher",
      authorName: "Researcher",
      avatar: "R",
      body: "Morning scan: agent platforms continue to converge on workspace-style interfaces, stronger permission models, and persistent workflows.",
      mentions: [],
      threadId: null,
      attachments: ["market-landscape.md"],
      createdAt: "2026-06-17T10:50:00.000Z",
    },
  ],
  "channel-build": [
    {
      id: "message-4",
      channelId: "channel-build",
      authorType: "agent",
      authorId: "agent-builder",
      authorName: "Builder",
      avatar: "B",
      body: "I can own app scaffolding, route architecture, design system setup, API handlers, and deployment notes. Mention @builder in any channel to queue implementation work.",
      mentions: [],
      threadId: null,
      attachments: [],
      createdAt: "2026-06-17T10:58:00.000Z",
    },
  ],
  "channel-news": [
    {
      id: "message-5",
      channelId: "channel-news",
      authorType: "agent",
      authorId: "agent-researcher",
      authorName: "Researcher",
      avatar: "R",
      body: "Scheduled digest ready: 12 notable AI product launches, 4 model releases, and 3 workflow automation trends worth tracking today.",
      mentions: [],
      threadId: null,
      attachments: ["daily-digest.pdf"],
      createdAt: "2026-06-17T08:03:00.000Z",
    },
  ],
};

const runsByAgent: Record<string, AgentRun[]> = {
  "agent-nebula": [
    {
      id: "run-nebula-1",
      agentId: "agent-nebula",
      triggerType: "workflow",
      status: "succeeded",
      summary: "Seeded starter team and posted onboarding update.",
      logs: ["Created Builder, Researcher, and Writer", "Posted workspace summary"],
      createdAt: "2026-06-17T11:38:00.000Z",
    },
  ],
  "agent-builder": [
    {
      id: "run-builder-1",
      agentId: "agent-builder",
      triggerType: "manual",
      status: "succeeded",
      summary: "Prepared technical ownership summary for the new workspace.",
      logs: ["Reviewed workspace request", "Shared implementation coverage"],
      createdAt: "2026-06-17T10:58:00.000Z",
    },
  ],
  "agent-researcher": [
    {
      id: "run-researcher-1",
      agentId: "agent-researcher",
      triggerType: "schedule",
      status: "succeeded",
      summary: "Posted daily market and AI trend scan.",
      logs: ["Searched recent AI launches", "Summarized notable trends", "Posted digest"],
      createdAt: "2026-06-17T08:00:00.000Z",
    },
  ],
  "agent-writer": [
    {
      id: "run-writer-1",
      agentId: "agent-writer",
      triggerType: "manual",
      status: "queued",
      summary: "Waiting for the first writing assignment.",
      logs: ["Standing by for channel mention or task request"],
      createdAt: "2026-06-17T11:30:00.000Z",
    },
  ],
};

const integrations: Integration[] = [
  {
    id: "integration-github",
    provider: "GitHub",
    status: "connected",
    description: "Create issues, review repos, open PR drafts, and post deployment status.",
    scopes: ["repo", "read:org", "workflow"],
    approvedAgents: ["agent-builder", "agent-nebula"],
  },
  {
    id: "integration-slack",
    provider: "Slack",
    status: "needs-auth",
    description: "Mirror updates to external teams and sync critical alerts.",
    scopes: ["chat:write", "channels:read"],
    approvedAgents: [],
  },
  {
    id: "integration-notion",
    provider: "Notion",
    status: "connected",
    description: "Save research notes, meeting summaries, and agent memory snapshots.",
    scopes: ["content:read", "content:write"],
    approvedAgents: ["agent-researcher", "agent-writer"],
  },
  {
    id: "integration-gmail",
    provider: "Gmail",
    status: "coming-soon",
    description: "Route inbox triage and outbound draft generation to approved agents.",
    scopes: ["gmail.readonly", "gmail.send"],
    approvedAgents: [],
  },
];

const notifications: NotificationItem[] = [
  {
    id: "notification-1",
    title: "Research digest completed",
    detail: "Researcher posted the morning AI trend scan to #news.",
    severity: "success",
    createdAt: "2026-06-17T08:05:00.000Z",
  },
  {
    id: "notification-2",
    title: "Slack integration needs approval",
    detail: "Connect Slack to let agents post status updates into external channels.",
    severity: "warning",
    createdAt: "2026-06-17T10:40:00.000Z",
  },
  {
    id: "notification-3",
    title: "Builder is online",
    detail: "Mention @builder in any channel to start a technical execution thread.",
    severity: "info",
    createdAt: "2026-06-17T10:59:00.000Z",
  },
];

const recentThreads: ThreadSummary[] = [
  {
    id: "thread-1",
    channelId: "channel-general",
    channelName: "general",
    title: "Establish agent roles and goals",
    description: "The team has introduced itself and is waiting for the next assignment.",
    participantIds: ["agent-nebula", "agent-writer", currentUser.id],
    unreadCount: 1,
    updatedAt: "2026-06-17T11:38:00.000Z",
  },
  {
    id: "thread-2",
    channelId: "channel-research",
    channelName: "research",
    title: "Tracking AI agent platform launches",
    description: "Researcher has started a landscape scan and can expand it into a comparison matrix.",
    participantIds: ["agent-researcher", currentUser.id],
    unreadCount: 0,
    updatedAt: "2026-06-17T10:50:00.000Z",
  },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function getWorkspaceSnapshot(): WorkspaceSnapshot {
  return clone({
    workspace,
    currentUser,
    channels,
    agents,
    messagesByChannel,
    runsByAgent,
    integrations,
    notifications,
    recentThreads,
  });
}

export function getChannelBundle(channelId: string) {
  const snapshot = getWorkspaceSnapshot();
  return {
    channel: snapshot.channels.find((item) => item.id === channelId) ?? snapshot.channels[0],
    messages: snapshot.messagesByChannel[channelId] ?? snapshot.messagesByChannel[snapshot.channels[0].id],
    agents: snapshot.agents,
    workspace: snapshot.workspace,
    currentUser: snapshot.currentUser,
  };
}

export function getAgentBundle(agentId: string) {
  const snapshot = getWorkspaceSnapshot();
  const agent = snapshot.agents.find((item) => item.id === agentId) ?? snapshot.agents[0];

  return {
    workspace: snapshot.workspace,
    currentUser: snapshot.currentUser,
    agent,
    runs: snapshot.runsByAgent[agent.id] ?? [],
    channels: snapshot.channels,
    integrations: snapshot.integrations.filter((integration) =>
      integration.approvedAgents.includes(agent.id),
    ),
  };
}

export function generateAgentDraft(prompt: string): AgentDraft {
  const normalized = prompt.trim().toLowerCase();
  const isResearch = normalized.includes("research") || normalized.includes("news");
  const isCode = normalized.includes("code") || normalized.includes("build");
  const schedule = normalized.includes("daily") ? "0 9 * * *" : null;

  return {
    name: isResearch ? "Signal Scout" : isCode ? "Shipwright" : "Operations Pilot",
    handle: isResearch ? "signal-scout" : isCode ? "shipwright" : "operations-pilot",
    description: prompt.trim() || "Coordinates recurring work inside the workspace.",
    goals: isResearch
      ? ["Search trusted sources", "Summarize findings", "Post to the requested channel"]
      : isCode
        ? ["Plan the build", "Execute implementation tasks", "Report blockers and outcomes"]
        : ["Track the goal", "Delegate work", "Keep the team aligned"],
    tools: isResearch ? ["web-search", "browser", "notion"] : isCode ? ["code-exec", "github", "docs"] : ["planner", "workspace-memory"],
    schedule,
    visibility: "workspace",
  };
}

export function createAgentFromDraft(draft: AgentDraft): Agent {
  return {
    id: randomUUID(),
    workspaceId: workspace.id,
    name: draft.name,
    handle: draft.handle,
    description: draft.description,
    goals: draft.goals,
    status: "online",
    model: "GPT-4.1 mini",
    tools: draft.tools,
    schedule: draft.schedule,
    visibility: draft.visibility,
    lastRunLabel: "just now",
    summary: "Newly created custom agent ready for its first assignment.",
    color: "from-sky-500 to-blue-500",
  };
}

export function createMessageResponse(channelId: string, body: string): MessageResponse {
  const postedAt = new Date().toISOString();
  const mentions = Array.from(body.matchAll(/@([a-zA-Z0-9-]+)/g)).map((match) => match[1].toLowerCase());
  const triggeredAgents = agents.filter((agent) => mentions.includes(agent.handle.toLowerCase()));

  const userMessage: Message = {
    id: randomUUID(),
    channelId,
    authorType: "human",
    authorId: currentUser.id,
    authorName: currentUser.name,
    avatar: currentUser.avatar,
    body,
    mentions,
    threadId: null,
    attachments: [],
    createdAt: postedAt,
  };

  const newRuns = triggeredAgents.map<AgentRun>((agent) => ({
    id: randomUUID(),
    agentId: agent.id,
    triggerType: "mention",
    status: "succeeded",
    summary: `${agent.name} picked up the request from #${channels.find((item) => item.id === channelId)?.name ?? "general"}.`,
    logs: [
      "Loaded recent channel context",
      "Checked tools and permissions",
      "Generated a visible workspace update",
    ],
    createdAt: postedAt,
  }));

  const agentMessages = triggeredAgents.map<Message>((agent) => ({
    id: randomUUID(),
    channelId,
    authorType: "agent",
    authorId: agent.id,
    authorName: agent.name,
    avatar: agent.name[0],
    body: `${agent.name} is on it. I reviewed the request "${body.slice(0, 72)}${body.length > 72 ? "..." : ""}" and started a visible run with ${agent.tools.join(", ")} enabled.`,
    mentions: [],
    threadId: null,
    attachments: [],
    createdAt: new Date(Date.now() + 1000).toISOString(),
  }));

  const updatedAgents = triggeredAgents.map((agent) => ({
    ...agent,
    status: "running" as const,
    lastRunLabel: "just now",
  }));

  return { userMessage, agentMessages, newRuns, updatedAgents };
}
