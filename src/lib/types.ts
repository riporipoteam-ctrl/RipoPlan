export type Role = "owner" | "admin" | "member";
export type AgentStatus = "active" | "paused" | "archived";
export type SenderType = "user" | "agent" | "system";
export type MessageStatus = "thinking" | "streaming" | "complete" | "error";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  owner_id: string | null;
}

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  handle: string | null;
  role: string | null;
  description: string | null;
  goals: string | null;
  emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  model: string | null;
  system_prompt: string | null;
  tools: string[];
  schedule: string | null;
  status: AgentStatus;
  memory_enabled: boolean;
  is_supervisor: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
}

export interface Thread {
  id: string;
  workspace_id: string;
  channel_id: string | null;
  primary_agent_id: string | null;
  title: string | null;
  summary: string | null;
  last_activity_at: string;
  unread_count: number;
  created_at: string;
}

export interface Activity {
  label: string;
  tool?: string;
  detail?: string;
  status?: "running" | "done" | "error";
}

export interface Message {
  id: string;
  workspace_id: string;
  thread_id: string | null;
  channel_id: string | null;
  sender_type: SenderType;
  user_id: string | null;
  agent_id: string | null;
  content: string | null;
  attachments: any[];
  activities: Activity[];
  status: MessageStatus;
  created_at: string;
}

export interface Job {
  id: string;
  workspace_id: string;
  agent_id: string;
  name: string;
  schedule: string | null;
  prompt: string | null;
  channel_id: string | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface Integration {
  id: string;
  workspace_id: string;
  provider: string;
  status: "available" | "connected" | "error";
  scopes: string[];
  account_label: string | null;
}
