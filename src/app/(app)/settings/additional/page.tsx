"use client";

import { TopBar } from "@/components/TopBar";
import { UnfilteredToggle } from "@/components/UnfilteredToggle";
import { GroqKeyField } from "@/components/GroqKeyField";
import { BackendUrlField } from "@/components/BackendUrlField";

export default function AdditionalSettingsPage() {
  return (
    <>
      <TopBar title="Additional settings" subtitle="Advanced & experimental" back="/settings" />
      <div className="flex-1 space-y-4 px-4 py-4">
        <UnfilteredToggle />

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-2 text-sm font-semibold">Faster replies</div>
          <p className="text-xs text-[var(--muted)]">
            Agents automatically rotate across multiple models and recall memory from every chat in
            your workspace. No setup needed — it just works.
          </p>
        </div>

        <details className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Advanced (API keys & backend)</summary>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Optional — only if you want to use your own keys. The app already works without these.
          </p>
          <div className="mt-3 space-y-1">
            <div className="text-xs font-medium text-[var(--muted)]">Your own Groq API key (optional)</div>
            <GroqKeyField />
          </div>
          <div className="mt-4 space-y-1">
            <div className="text-xs font-medium text-[var(--muted)]">NVIDIA worker URL (image generation)</div>
            <BackendUrlField />
          </div>
        </details>
      </div>
    </>
  );
}
