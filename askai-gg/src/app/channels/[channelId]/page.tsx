import { ChannelWorkspace } from "@/components/channels/channel-workspace";
import { getWorkspaceSnapshot } from "@/lib/mock-data";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;

  return <ChannelWorkspace snapshot={getWorkspaceSnapshot()} channelId={channelId} />;
}
