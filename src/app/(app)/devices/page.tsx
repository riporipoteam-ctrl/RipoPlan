"use client";

import { Monitor, Cloud, Cpu, HardDrive } from "lucide-react";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";

export default function DevicesPage() {
  const { ctx } = useSession();
  return (
    <>
      <TopBar title="Devices" subtitle="Virtual computers for your agents" back="/settings" />
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-nebula-50 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-nebula-500 to-nebula-pink text-white">
              <Cloud size={22} />
            </div>
            <div className="flex-1">
              <div className="font-bold">Cloud Device</div>
              <div className="text-xs text-[var(--muted)]">{ctx?.workspace.name} · in-browser</div>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Ready</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
            <div className="flex items-center gap-1.5"><Cpu size={13} /> Sandboxed runtime (web search, code, browse)</div>
            <div className="flex items-center gap-1.5"><HardDrive size={13} /> Per-agent memory store</div>
          </div>
        </div>
        <p className="px-1 text-xs text-[var(--muted)]">
          Agents run their tools directly in your browser session. For long-running or stateful
          workloads, provision a dedicated container and register it here.
        </p>
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
          <Monitor size={18} /> Local device — pair a machine to let agents act on your computer (coming soon).
        </div>
      </div>
    </>
  );
}
