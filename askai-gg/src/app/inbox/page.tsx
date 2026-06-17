import { InboxPage } from "@/components/inbox/inbox-page";
import { getWorkspaceSnapshot } from "@/lib/mock-data";

export default function InboxRoute() {
  return <InboxPage snapshot={getWorkspaceSnapshot()} />;
}
