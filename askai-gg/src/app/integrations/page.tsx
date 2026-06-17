import { IntegrationsPage } from "@/components/integrations/integrations-page";
import { getWorkspaceSnapshot } from "@/lib/mock-data";

export default function IntegrationsRoute() {
  return <IntegrationsPage snapshot={getWorkspaceSnapshot()} />;
}
