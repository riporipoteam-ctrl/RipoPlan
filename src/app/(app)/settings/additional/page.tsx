"use client";

import { TopBar } from "@/components/TopBar";
import { UnfilteredToggle } from "@/components/UnfilteredToggle";

export default function AdditionalSettingsPage() {
  return (
    <>
      <TopBar title="Additional settings" subtitle="Advanced & experimental" back="/settings" />
      <div className="flex-1 space-y-4 px-4 py-4">
        <UnfilteredToggle />

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 text-sm font-semibold">Faster replies</div>
          <p className="text-xs text-[var(--muted)]">
            Agents automatically rotate across multiple AI models and recall memory from every chat in
            your workspace. No setup needed — it just works.
          </p>
        </div>
      </div>
    </>
  );
}
