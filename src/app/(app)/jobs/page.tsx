"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Plus, Play, Pencil, Trash2, Mail, X, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { AgentAvatar } from "@/components/Avatar";
import { runJob, toggleJob } from "@/lib/actions";
import { relativeTime } from "@/lib/format";
import type { Agent, Job } from "@/lib/types";

const SCHEDULES = [
  { value: "", label: "Once (run now / at a set time)" },
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
];

export default function JobsPage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Job> | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    if (!ctx) return;
    const [{ data: j }, { data: a }] = await Promise.all([
      supabase.from("jobs").select("*").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }),
      supabase.from("agents").select("*").eq("workspace_id", ctx.workspace.id).neq("status", "archived"),
    ]);
    setJobs((j as Job[]) || []);
    setAgents((a as Agent[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ctx?.workspace.id]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  async function save(job: Partial<Job>) {
    if (!ctx) return;
    const row: any = {
      workspace_id: ctx.workspace.id,
      agent_id: job.agent_id || agents[0]?.id,
      name: job.name || "Untitled job",
      prompt: job.prompt || "",
      schedule: job.schedule || null,
      run_at: job.run_at || null,
      email_on_start: !!job.email_on_start,
      enabled: job.enabled ?? true,
    };
    if (job.id) await supabase.from("jobs").update(row).eq("id", job.id);
    else await supabase.from("jobs").insert(row);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this job?")) return;
    setJobs((j) => j.filter((x) => x.id !== id));
    await supabase.from("jobs").delete().eq("id", id);
  }

  async function runNow(id: string) {
    if (!ctx) return;
    setRunning(id);
    try { await runJob(supabase, ctx, id); } finally { setRunning(null); load(); }
  }

  return (
    <>
      <TopBar
        title="Jobs"
        subtitle="Tasks & reminders your agents run"
        back="/settings"
        leading={
          <button onClick={() => setEditing({ enabled: true })} className="-ml-1 mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5" aria-label="New job">
            <Plus size={20} />
          </button>
        }
      />
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted)]">
          Run a job <b>now</b> any time, or schedule it. With the backend worker deployed, scheduled jobs run 24/7 even with the app closed, and (if Gmail is connected) email you when they start.
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-[var(--muted)]">
            <Clock /> No jobs yet.
            <button onClick={() => setEditing({ enabled: true })} className="rounded-xl bg-nebula-600 px-4 py-2 font-medium text-white">Create a job</button>
          </div>
        ) : (
          jobs.map((j) => {
            const agent = agentMap.get(j.agent_id);
            return (
              <div key={j.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 lift">
                <div className="flex items-center gap-3">
                  {agent && <AgentAvatar emoji={agent.emoji} color={agent.avatar_color} imageUrl={agent.avatar_url} size={34} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{j.name}</span>
                      {j.email_on_start && <Mail size={12} className="text-nebula-500" />}
                    </div>
                    <div className="truncate text-xs text-[var(--muted)]">
                      {agent?.name || "Agent"} · {j.schedule ? j.schedule : j.run_at ? `at ${new Date(j.run_at).toLocaleString()}` : "manual"}
                      {j.last_run_at ? ` · ran ${relativeTime(j.last_run_at)}` : ""}
                    </div>
                  </div>
                  <button onClick={() => runNow(j.id)} disabled={running === j.id} className="flex items-center gap-1 rounded-lg bg-nebula-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    {running === j.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
                  </button>
                  <button onClick={() => setEditing(j)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/5"><Pencil size={15} /></button>
                  <button onClick={() => remove(j.id)} className="rounded-lg p-1.5 text-[var(--muted)] hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <JobEditor job={editing} agents={agents} onChange={setEditing} onSave={() => save(editing)} onCancel={() => setEditing(null)} />
      )}
    </>
  );
}

function JobEditor({ job, agents, onChange, onSave, onCancel }: { job: Partial<Job>; agents: Agent[]; onChange: (j: Partial<Job>) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-md space-y-3 rounded-t-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:rounded-3xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="font-bold">{job.id ? "Edit job" : "New job"}</span>
          <button onClick={onCancel} className="text-[var(--muted)]"><X size={18} /></button>
        </div>
        <input value={job.name || ""} onChange={(e) => onChange({ ...job, name: e.target.value })} placeholder="Job name (e.g. Morning news digest)" className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-nebula-500" />
        <select value={job.agent_id || ""} onChange={(e) => onChange({ ...job, agent_id: e.target.value })} className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none">
          <option value="">Pick an agent…</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <textarea value={job.prompt || ""} onChange={(e) => onChange({ ...job, prompt: e.target.value })} placeholder="What should the agent do? (the task / reminder)" rows={3} className="w-full resize-none rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-nebula-500" />
        <div>
          <div className="mb-1 text-xs text-[var(--muted)]">Schedule</div>
          <select value={job.schedule || ""} onChange={(e) => onChange({ ...job, schedule: e.target.value })} className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none">
            {SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {!job.schedule && (
          <div>
            <div className="mb-1 text-xs text-[var(--muted)]">Run at a specific time (optional)</div>
            <input type="datetime-local" value={job.run_at ? job.run_at.slice(0, 16) : ""} onChange={(e) => onChange({ ...job, run_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none" />
          </div>
        )}
        <label className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm">
          <span className="flex items-center gap-2"><Mail size={15} /> Email me when it starts</span>
          <input type="checkbox" checked={!!job.email_on_start} onChange={(e) => onChange({ ...job, email_on_start: e.target.checked })} className="h-4 w-4" />
        </label>
        <button onClick={onSave} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink py-2.5 text-sm font-semibold text-white">
          <Check size={16} /> {job.id ? "Save changes" : "Create job"}
        </button>
      </div>
    </div>
  );
}
