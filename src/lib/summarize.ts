import { groq, GROQ_MODEL } from "./groq";

/** Generate a short thread title + one-sentence summary from the conversation. */
export async function summarizeThread(
  userMsg: string,
  agentReply: string
): Promise<{ title: string; summary: string }> {
  try {
    const completion = await groq().chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            'You write concise thread metadata. Reply ONLY with JSON: {"title": "3-6 word title in Title Case", "summary": "one neutral sentence describing the state of the thread"}.',
        },
        { role: "user", content: `User: ${userMsg}\n\nAgent: ${agentReply}`.slice(0, 2000) },
      ],
      temperature: 0.3,
      max_completion_tokens: 200,
      response_format: { type: "json_object" },
    } as any);
    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    return {
      title: (parsed.title || userMsg.slice(0, 40)).slice(0, 80),
      summary: (parsed.summary || "").slice(0, 240),
    };
  } catch {
    return {
      title: userMsg.split(/\s+/).slice(0, 6).join(" ").slice(0, 80),
      summary: agentReply.slice(0, 140),
    };
  }
}
