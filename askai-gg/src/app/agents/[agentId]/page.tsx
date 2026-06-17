import { AgentProfile } from "@/components/agents/agent-profile";
import { getWorkspaceSnapshot } from "@/lib/mock-data";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  return <AgentProfile snapshot={getWorkspaceSnapshot()} agentId={agentId} />;
}
