import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";
import { groq, GROQ_MODEL } from "@/lib/groq";
import { AGENT_COLORS } from "@/lib/emoji";

export const maxDuration = 30;

const VALID_TOOLS = ["web_search", "browse", "code"];
const VALID_EMOJI = [
  "sparkles", "pencil", "magnifier", "wrench", "globe", "robot",
  "rocket", "brain", "chart", "mail", "code", "camera", "calendar", "bell", "bolt",
];

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { description } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  let spec: any = {};
  try {
    const completion = await groq().chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: `You design AI agents. From the user's description, output ONLY JSON with this exact shape:
{
  "name": "short proper name (1-2 words)",
  "handle": "lowercase-kebab-handle",
  "role": "short role title",
  "description": "one sentence describing what it does",
  "goals": "1-3 sentence goal statement",
  "emoji": one of ${JSON.stringify(VALID_EMOJI)},
  "tools": array subset of ${JSON.stringify(VALID_TOOLS)},
  "schedule": "cron string if the user wants it recurring (e.g. '0 9 * * *' for daily 9am), else null",
  "system_prompt": "a detailed system prompt instructing the agent how to behave"
}`,
        },
        { role: "user", content: description },
      ],
      temperature: 0.5,
      max_completion_tokens: 1000,
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
    } as any);
    spec = JSON.parse(completion.choices[0].message.content || "{}");
  } catch (e: any) {
    return NextResponse.json({ error: "ai_failed", detail: e.message }, { status: 500 });
  }

  const tools = Array.isArray(spec.tools)
    ? spec.tools.filter((t: string) => VALID_TOOLS.includes(t))
    : ["web_search"];
  const emoji = VALID_EMOJI.includes(spec.emoji) ? spec.emoji : "robot";
  const color = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)];

  const supabase = await createClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      workspace_id: ctx.workspace.id,
      name: spec.name || "New Agent",
      handle: (spec.handle || spec.name || "agent").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      role: spec.role || "AI Agent",
      description: spec.description || description.slice(0, 140),
      goals: spec.goals || null,
      emoji,
      avatar_color: color,
      tools,
      schedule: spec.schedule || null,
      system_prompt: spec.system_prompt || null,
      created_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If a schedule was requested, create a job too
  if (spec.schedule) {
    await supabase.from("jobs").insert({
      workspace_id: ctx.workspace.id,
      agent_id: agent.id,
      name: `${agent.name} scheduled run`,
      schedule: spec.schedule,
      prompt: spec.goals || description,
      enabled: true,
    });
  }

  return NextResponse.json({ agentId: agent.id, agent });
}
