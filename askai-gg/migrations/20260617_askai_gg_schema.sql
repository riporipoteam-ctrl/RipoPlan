create extension if not exists vector;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'member', 'agent')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('public', 'private', 'dm')),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  handle text not null,
  description text not null,
  status text not null default 'online',
  model text not null default 'gpt-4.1-mini',
  schedule text,
  visibility text not null default 'workspace',
  goals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, handle)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  author_id uuid not null,
  author_type text not null check (author_type in ('human', 'agent', 'system')),
  body text not null,
  thread_id uuid,
  mentions jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('mention', 'schedule', 'manual', 'workflow')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  summary text,
  logs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table agent_tools (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  tool_key text not null,
  config jsonb not null default '{}'::jsonb
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  encrypted_tokens jsonb not null default '{}'::jsonb,
  unique (workspace_id, provider)
);

create table integration_grants (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  scopes jsonb not null default '[]'::jsonb,
  unique (integration_id, agent_id)
);

create table agent_memories (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_channels_workspace_id on channels(workspace_id);
create index idx_agents_workspace_id on agents(workspace_id);
create index idx_messages_channel_id on messages(channel_id, created_at desc);
create index idx_agent_runs_agent_id on agent_runs(agent_id, created_at desc);
create index idx_agent_memories_embedding on agent_memories using ivfflat (embedding vector_cosine_ops);
