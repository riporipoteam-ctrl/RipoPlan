import { describe, expect, it } from "vitest";

import {
  createAgentFromDraft,
  createMessageResponse,
  generateAgentDraft,
} from "@/lib/mock-data";

describe("mock-data helpers", () => {
  it("builds a research-focused agent draft from natural language", () => {
    const draft = generateAgentDraft(
      "Create a Research Agent that daily searches AI news and posts to #news.",
    );

    expect(draft.name).toBe("Signal Scout");
    expect(draft.schedule).toBe("0 9 * * *");
    expect(draft.tools).toContain("web-search");
  });

  it("creates a concrete agent from a validated draft", () => {
    const agent = createAgentFromDraft({
      name: "Ops Agent",
      handle: "ops-agent",
      description: "Keeps the workspace moving.",
      goals: ["Track blockers"],
      tools: ["planner"],
      schedule: null,
      visibility: "workspace",
    });

    expect(agent.id).toBeTruthy();
    expect(agent.handle).toBe("ops-agent");
    expect(agent.status).toBe("online");
  });

  it("produces a user message plus agent responses when mentions are present", () => {
    const result = createMessageResponse(
      "channel-general",
      "@builder please ship the app shell and @researcher gather public references.",
    );

    expect(result.userMessage.mentions).toEqual(["builder", "researcher"]);
    expect(result.agentMessages).toHaveLength(2);
    expect(result.newRuns).toHaveLength(2);
    expect(result.updatedAgents.map((agent) => agent.handle)).toEqual(
      expect.arrayContaining(["builder", "researcher"]),
    );
  });
});
