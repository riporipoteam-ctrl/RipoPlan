import { SettingsPage } from "@/components/settings/settings-page";
import { getWorkspaceSnapshot } from "@/lib/mock-data";

export default function SettingsRoute() {
  return <SettingsPage snapshot={getWorkspaceSnapshot()} />;
}
