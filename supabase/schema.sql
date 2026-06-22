-- askai.gg — full database schema (Postgres + Supabase)
-- Apply with: supabase db execute < supabase/schema.sql  (or paste into the SQL editor)

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ============================ TABLES ============================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text, avatar_url text,
  avatar_color text default '#ef4444', created_at timestamptz default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text, avatar_url text,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.ranks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null, color text default '#a855f7', badge text default 'star',
  position int default 100, is_default boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_ranks_ws on public.ranks(workspace_id, position);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null, handle text, role text, description text, goals text,
  emoji text default 'robot', avatar_color text default '#a855f7', avatar_url text,
  rank_id uuid references public.ranks(id) on delete set null,
  model text default 'llama-3.3-70b-versatile', system_prompt text,
  tools jsonb default '[]'::jsonb, schedule text,
  status text default 'active' check (status in ('active','paused','archived')),
  memory_enabled boolean default true, is_supervisor boolean default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(), last_run_at timestamptz
);

create table if not exists public.mini_apps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null, description text, html text, prompt text,
  channel_id uuid references public.channels(id) on delete set null,
  built_by uuid references public.agents(id) on delete set null,
  status text default 'ready' check (status in ('building','ready','error')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists idx_mini_apps_ws on public.mini_apps(workspace_id, created_at desc);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null, description text, is_default boolean default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  primary_agent_id uuid references public.agents(id) on delete set null,
  title text, summary text,
  created_by uuid references public.profiles(id) on delete set null,
  last_activity_at timestamptz default now(), unread_count int default 0,
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  sender_type text not null check (sender_type in ('user','agent','system')),
  user_id uuid references public.profiles(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  content text, attachments jsonb default '[]'::jsonb, activities jsonb default '[]'::jsonb,
  status text default 'complete' check (status in ('thinking','streaming','complete','error')),
  created_at timestamptz default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete set null,
  trigger text, status text default 'running' check (status in ('running','done','error')),
  input text, output text, steps jsonb default '[]'::jsonb,
  tokens_in int default 0, tokens_out int default 0,
  started_at timestamptz default now(), finished_at timestamptz
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  name text not null, schedule text, prompt text,
  channel_id uuid references public.channels(id) on delete set null,
  enabled boolean default true, last_run_at timestamptz, next_run_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null,
  status text default 'available' check (status in ('available','connected','error')),
  scopes jsonb default '[]'::jsonb, account_label text, secret text,
  connected_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  type text, title text, body text, link text, read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  content text not null, kind text default 'note',
  embedding vector(384), metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_messages_thread on public.messages(thread_id, created_at);
create index if not exists idx_messages_channel on public.messages(channel_id, created_at);
create index if not exists idx_threads_ws on public.threads(workspace_id, last_activity_at desc);
create index if not exists idx_agents_ws on public.agents(workspace_id);
create index if not exists idx_channels_ws on public.channels(workspace_id);
create index if not exists idx_runs_agent on public.agent_runs(agent_id, started_at desc);
create index if not exists idx_notif_user on public.notifications(user_id, read, created_at desc);
create index if not exists idx_mem_agent on public.agent_memories(agent_id);

-- ============================ RLS ============================
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid());
$$;
revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.ranks enable row level security;
alter table public.mini_apps enable row level security;
alter table public.agents enable row level security;
alter table public.channels enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.jobs enable row level security;
alter table public.integrations enable row level security;
alter table public.notifications enable row level security;
alter table public.agent_memories enable row level security;

create policy "profiles_select_all" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid());
create policy "profiles_insert_self" on public.profiles for insert with check (id = auth.uid());

create policy "ws_select_member" on public.workspaces for select using (public.is_workspace_member(id) or owner_id = auth.uid());
create policy "ws_insert_owner" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "ws_update_owner" on public.workspaces for update using (owner_id = auth.uid());

create policy "wm_select_member" on public.workspace_members for select using (public.is_workspace_member(workspace_id) or user_id = auth.uid());
create policy "wm_insert_self_or_member" on public.workspace_members for insert with check (user_id = auth.uid() or public.is_workspace_member(workspace_id));
create policy "wm_delete_member" on public.workspace_members for delete using (public.is_workspace_member(workspace_id));

create policy "ranks_rw" on public.ranks for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "mini_apps_rw" on public.mini_apps for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "agents_rw" on public.agents for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "channels_rw" on public.channels for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "threads_rw" on public.threads for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "messages_rw" on public.messages for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "runs_rw" on public.agent_runs for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "jobs_rw" on public.jobs for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "integrations_rw" on public.integrations for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "memories_rw" on public.agent_memories for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "notif_select_self" on public.notifications for select using (user_id = auth.uid());
create policy "notif_update_self" on public.notifications for update using (user_id = auth.uid());

-- ============================ BOOTSTRAP ============================
create or replace function public.bootstrap_workspace(p_owner uuid, p_ws_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
  a_nebula uuid; a_writer uuid; a_researcher uuid; a_builder uuid; a_web uuid;
  c_general uuid; c_research uuid; c_news uuid; t1 uuid; t2 uuid; t3 uuid;
begin
  insert into public.workspaces(name, owner_id) values (coalesce(p_ws_name,'My Workspace'), p_owner) returning id into v_ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (v_ws, p_owner, 'owner');

  insert into public.agents(workspace_id, name, handle, role, description, emoji, avatar_color, is_supervisor, system_prompt, tools, created_by)
    values (v_ws,'Nebula','nebula','Chief of Staff','Your AI Chief of Staff. Coordinates the team, decomposes goals, and delegates.','sparkles','#d633b9', true,
      'You are Nebula, the Chief of Staff and supervisor agent. You decompose goals, delegate to specialists, and synthesize results in clear markdown.',
      '["web_search","delegate","code"]'::jsonb, p_owner) returning id into a_nebula;
  insert into public.agents(workspace_id, name, handle, role, description, emoji, avatar_color, system_prompt, tools, created_by)
    values (v_ws,'Writer','writer','Content Writer','Your go-to for any content that needs writing.','pencil','#10b981',
      'You are Writer, a world-class content writer producing clear, engaging writing.','["web_search"]'::jsonb, p_owner) returning id into a_writer;
  insert into public.agents(workspace_id, name, handle, role, description, emoji, avatar_color, system_prompt, tools, created_by)
    values (v_ws,'Researcher','researcher','Research Analyst','Researches topics and produces structured findings.','magnifier','#14b8a6',
      'You are Researcher, a meticulous analyst. Gather info, cite sources, present findings as tables.','["web_search"]'::jsonb, p_owner) returning id into a_researcher;
  insert into public.agents(workspace_id, name, handle, role, description, emoji, avatar_color, system_prompt, tools, created_by)
    values (v_ws,'Builder','builder','Automation Builder','Builds and runs workflows, jobs, and automations.','wrench','#8b5cf6',
      'You are Builder, an automation engineer who designs jobs and writes/executes code.','["code","web_search"]'::jsonb, p_owner) returning id into a_builder;
  insert into public.agents(workspace_id, name, handle, role, description, emoji, avatar_color, system_prompt, tools, created_by)
    values (v_ws,'Web Browser','web-browser','Web Browser','Browses the live web and extracts information.','globe','#6366f1',
      'You are Web Browser. Always search before answering and summarize what you found.','["web_search","browse"]'::jsonb, p_owner) returning id into a_web;

  insert into public.channels(workspace_id, name, description, is_default, created_by) values (v_ws,'general','Company-wide chat', true, p_owner) returning id into c_general;
  insert into public.channels(workspace_id, name, description, created_by) values (v_ws,'research','Research tasks and findings', p_owner) returning id into c_research;
  insert into public.channels(workspace_id, name, description, created_by) values (v_ws,'news','Daily digests from your agents', p_owner) returning id into c_news;

  insert into public.threads(workspace_id, primary_agent_id, title, summary, created_by, last_activity_at)
    values (v_ws, a_writer,'Establish agent role and goals','The agent introduced its capabilities, and the user has initiated the process of defining goals.', p_owner, now() - interval '1 minute') returning id into t1;
  insert into public.threads(workspace_id, primary_agent_id, title, summary, created_by, last_activity_at)
    values (v_ws, a_researcher,'Establishing Project Objectives','The assistant has introduced itself and is awaiting the user''s defined project goals.', p_owner, now() - interval '1 minute') returning id into t2;
  insert into public.threads(workspace_id, primary_agent_id, title, summary, created_by, last_activity_at)
    values (v_ws, a_builder,'Define Project Goal and Objectives','The agent introduced itself and requested clarification on the project goal.', p_owner, now()) returning id into t3;

  insert into public.messages(workspace_id, thread_id, sender_type, agent_id, content) values
    (v_ws, t1, 'agent', a_writer, 'Hi — I''m **Writer**, your go-to for content. What role and goals should I focus on?'),
    (v_ws, t2, 'agent', a_researcher, 'Hello! I''m **Researcher**. What project objectives should I help establish?'),
    (v_ws, t3, 'agent', a_builder, 'Hey, I''m **Builder**. What''s the goal of the project you want to build?');
  insert into public.messages(workspace_id, channel_id, sender_type, agent_id, content) values
    (v_ws, c_general, 'agent', a_nebula, 'Welcome to Nebula! I''m your Chief of Staff. Mention me with **@nebula** in any channel, or describe a goal and I''ll coordinate the team.');
  return v_ws;
end;
$$;
revoke all on function public.bootstrap_workspace(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));
  insert into public.profiles(id, email, display_name) values (new.id, new.email, v_name) on conflict (id) do nothing;
  perform public.bootstrap_workspace(new.id, v_name || '''s Workspace');
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = new.id; -- auto-confirm (remove to require email verification)
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============================ REALTIME ============================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.threads;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.agent_runs;
alter publication supabase_realtime add table public.mini_apps;
alter table public.messages replica identity full;
alter table public.threads replica identity full;
alter table public.agent_runs replica identity full;
