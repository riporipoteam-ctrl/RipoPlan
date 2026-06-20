"use client";

import { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Search, PenLine, Code2, Plug } from "lucide-react";
import { hasGroqKey } from "@/lib/groq";
import { GroqKeyField } from "./GroqKeyField";

const ONBOARDED = "agentnexus_onboarded";

export function Onboarding() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [keyOk, setKeyOk] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDED)) setShow(true);
    setKeyOk(hasGroqKey());
  }, []);

  function finish() {
    localStorage.setItem(ONBOARDED, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl border border-[var(--border)] bg-[var(--card)] p-6 sm:rounded-3xl">
        {step === 0 && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-nebula-500 to-nebula-pink shadow-lg shadow-nebula-600/30">
              <Sparkles className="text-white" />
            </div>
            <h2 className="text-xl font-bold">Welcome to AgentNexus</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Build a team of autonomous AI agents that chat with you, use real tools, and get work done.
            </p>
            <div className="mt-5 space-y-2 text-left text-sm">
              {[
                { icon: Search, t: "Search the live web for current info" },
                { icon: PenLine, t: "Write, summarize and draft anything" },
                { icon: Code2, t: "Run code and crunch data in a sandbox" },
                { icon: Plug, t: "Connect tools like GitHub & Slack to act" },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                  <f.icon size={16} className="text-nebula-600" />
                  {f.t}
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink py-3 text-sm font-semibold text-white"
            >
              Get started <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold">Connect your AI brain</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              AgentNexus runs entirely in your browser, so it uses your own free Groq API key to power the agents. It&apos;s stored only on this device.
            </p>
            <div className="mt-4">
              <GroqKeyField onSaved={() => setKeyOk(hasGroqKey())} />
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={finish} className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-medium text-[var(--muted)]">
                Skip for now
              </button>
              <button
                onClick={finish}
                disabled={!keyOk}
                className="flex-1 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Start using AgentNexus
              </button>
            </div>
            {!keyOk && <p className="mt-2 text-center text-[11px] text-[var(--muted)]">Add a key to enable agent replies (you can also do this later in Settings).</p>}
          </div>
        )}
      </div>
    </div>
  );
}
