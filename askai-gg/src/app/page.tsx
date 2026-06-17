import { HomeDashboard } from "@/components/home/home-dashboard";
import { getWorkspaceSnapshot } from "@/lib/mock-data";

export default function Home() {
  return <HomeDashboard snapshot={getWorkspaceSnapshot()} />;
}
