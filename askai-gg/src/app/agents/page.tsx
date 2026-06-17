import { AgentsDirectory } from "@/components/agents/agents-directory";
import { getWorkspaceSnapshot } from "@/lib/mock-data";

export default function AgentsPage() {
  return <AgentsDirectory snapshot={getWorkspaceSnapshot()} />;
}
