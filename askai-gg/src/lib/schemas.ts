import { z } from "zod";

export const messageRequestSchema = z.object({
  channelId: z.string().min(1),
  body: z.string().min(1),
});

export const generateAgentRequestSchema = z.object({
  prompt: z.string().min(1),
  workspaceId: z.string().min(1),
});

export const agentDraftSchema = z.object({
  name: z.string().min(1),
  handle: z.string().min(1),
  description: z.string().min(1),
  goals: z.array(z.string()).min(1),
  tools: z.array(z.string()).min(1),
  schedule: z.string().nullable(),
  visibility: z.enum(["workspace", "private"]),
});
