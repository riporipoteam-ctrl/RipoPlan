import { groq, GROQ_MODEL, VISION_MODEL, isReasoningModel, isVisionModel, type ChatMessage } from "./groq";
import { executeTool, schemasForTools, connectorSchemas, toolLabel } from "./tools";
import type { Activity, Agent } from "./types";

const MAX_TOOL_ROUNDS = 3;

/** Strip reasoning/tool-call artifacts and tool-schema echoes some models leak. */
function sanitize(text: string): string {
  let out = (text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<\|?function[\s\S]*?>[\s\S]*?<\/?\|?function[^>]*>/gi, "")
    .replace(/<function=[\s\S]*$/i, "");
  // Some models echo the raw tool schema/JSON as text — drop that.
  if (/"parameters"\s*:|"name"\s*:\s*"(web_search|create_agent|delegate|browse|code)"/.test(out)) {
    out = out.replace(/\[?\s*\{\s*"name"[\s\S]*$/m, "").trim();
  }
  return out.trim();
}

export interface CreatedAgentCard {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  role?: string;
}

export interface RunInput {
  agent: Agent;
  history: ChatMessage[];
  workspaceName?: string;
  memories?: string[];
  connectors?: Record<string, string>;
  onActivity?: (activities: Activity[]) => Promise<void> | void;
  onCreateAgent?: (spec: any) => Promise<CreatedAgentCard | null>;
  onDelegate?: (handle: string, task: string) => Promise<string>;
}

export interface RunOutput {
  content: string;
  activities: Activity[];
  steps: any[];
  createdAgents: CreatedAgentCard[];
  tokensIn: number;
  tokensOut: number;
}

function systemPrompt(agent: Agent, workspaceName?: string, memories?: string[], connectors?: Record<string, string>) {
  const now = new Date();
  const date = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const connected = Object.keys(connectors || {});
  const tools = [...(agent.tools || []), ...connected].join(", ") || "none";
  const conn =
    connected.length > 0
      ? `\n\nConnected integrations you can act on via tools: ${connected.join(", ")}. Use them to take real actions when asked (e.g. create a GitHub issue, post to Slack).`
      : "";
  const mem =
    memories && memories.length
      ? `\n\nRelevant long-term memory from past work:\n${memories.map((m) => `- ${m}`).join("\n")}`
      : "";
  return [
    agent.system_prompt ||
      `You are ${agent.name}, ${agent.role || "an AI agent"}.`,
    `\nYou work inside "${workspaceName || "the workspace"}", a collaborative platform where humans and AI agents work together in channels and threads.`,
    `Current date & time: ${date}.`,
    `Available tools: ${tools}. Use them whenever they would improve accuracy or freshness — never guess at facts you can look up.`,
    `SEARCH RULES: After web_search, extract the actual results — give specific items with their real URLs as Markdown links (e.g. [Pod 51 Hotel — $89/night](https://...)). Do NOT just name websites like "check Booking.com or Kayak". If the user wants concrete items (hotels, products, listings, prices), pick the most relevant result URL and call browse on it to pull out the real details (names, prices, links), then present 3-6 concrete options in a Markdown table with a clickable link for each.`,
    `When you present structured data (matches, prices, comparisons, schedules), use clean GitHub-flavored Markdown tables.`,
    `Be concise, helpful, and proactive. Sign off naturally as ${agent.name}.`,
    conn,
    mem,
  ].join("\n");
}

export async function runAgent(input: RunInput): Promise<RunOutput> {
  const { agent } = input;
  const activities: Activity[] = [];
  const steps: any[] = [];
  const createdAgents: CreatedAgentCard[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

  const messages: any[] = [
    { role: "system", content: systemPrompt(agent, input.workspaceName, input.memories, input.connectors) },
    ...input.history,
  ];

  const connectors = input.connectors || {};
  const tools = [...schemasForTools(agent.tools || []), ...connectorSchemas(connectors)];
  const client = groq();
  // Auto-upgrade to a vision model if the conversation contains image attachments.
  const hasImage = input.history.some((m) => Array.isArray((m as any).content));
  let model = agent.model || GROQ_MODEL;
  if (hasImage && !isVisionModel(model)) model = VISION_MODEL;
  const reasoning = isReasoningModel(model);

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const useTools = tools.length > 0 && round < MAX_TOOL_ROUNDS;
    let completion: any;
    try {
      completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.6,
        max_completion_tokens: 4096,
        top_p: 0.95,
        ...(reasoning ? { reasoning_format: "hidden" } : {}),
        ...(useTools ? { tools, tool_choice: "auto" } : {}),
      } as any);
    } catch (err: any) {
      // Some models occasionally emit a malformed tool call which the API
      // rejects (tool_use_failed). Recover by answering without tools.
      const failed = err?.error?.error?.failed_generation || err?.failed_generation;
      const recovered = sanitize(typeof failed === "string" ? failed : "");
      if (recovered) return { content: recovered, activities, steps, createdAgents, tokensIn, tokensOut };
      const plain = await client.chat.completions.create({
        model,
        messages: [...messages, { role: "user", content: "Answer now in plain text without calling any tools." }],
        temperature: 0.6,
        max_completion_tokens: 2048,
        ...(reasoning ? { reasoning_format: "hidden" } : {}),
      } as any);
      return { content: sanitize(plain.choices[0].message.content || ""), activities, steps, createdAgents, tokensIn, tokensOut };
    }

    const usage: any = (completion as any).usage;
    if (usage) {
      tokensIn += usage.prompt_tokens || 0;
      tokensOut += usage.completion_tokens || 0;
    }

    const choice = completion.choices[0];
    const msg = choice.message as any;
    const toolCalls = msg.tool_calls || [];

    if (toolCalls.length === 0) {
      return {
        content: sanitize(msg.content || ""),
        activities,
        steps,
        createdAgents,
        tokensIn,
        tokensOut,
      };
    }

    // Record the assistant turn that requested tools
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

    for (const call of toolCalls) {
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const name = call.function.name;
      const label = toolLabel(name, args);
      const activity: Activity = { label, tool: name, status: "running" };
      activities.push(activity);
      if (input.onActivity) await input.onActivity([...activities]);

      let result: { ok: boolean; output: string };
      if (name === "create_agent") {
        const card = input.onCreateAgent ? await input.onCreateAgent(args) : null;
        if (card) {
          createdAgents.push(card);
          result = { ok: true, output: `Created agent "${card.name}" (${card.role || ""}). It is now on the team and can be @mentioned as needed.` };
        } else {
          result = { ok: false, output: "Could not create the agent." };
        }
      } else if (name === "delegate") {
        const reply = input.onDelegate ? await input.onDelegate(String(args.handle || ""), String(args.task || "")) : "";
        result = reply
          ? { ok: true, output: `Delegated to @${args.handle}. They replied: ${reply.slice(0, 500)}` }
          : { ok: false, output: `Could not delegate to @${args.handle}.` };
      } else {
        result = await executeTool(name, args, connectors);
      }
      activity.status = result.ok ? "done" : "error";
      activity.detail = result.output.slice(0, 200);
      steps.push({ tool: call.function.name, args, ok: result.ok });
      if (input.onActivity) await input.onActivity([...activities]);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: result.output.slice(0, 6000),
      });
    }
  }

  // Fell out of the loop — ask for a final synthesis without tools
  const final = await client.chat.completions.create({
    model,
    messages: [
      ...messages,
      { role: "user", content: "Summarize your findings and give the final answer now." },
    ],
    temperature: 0.6,
    max_completion_tokens: 2048,
    ...(reasoning ? { reasoning_format: "hidden" } : {}),
  } as any);
  return {
    content: sanitize(final.choices[0].message.content || ""),
    activities,
    steps,
    createdAgents,
    tokensIn,
    tokensOut,
  };
}
