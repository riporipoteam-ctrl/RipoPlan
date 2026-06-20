"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound } from "lucide-react";
import { GROQ_KEY_STORAGE } from "@/lib/groq";

export function GroqKeyField({ onSaved }: { onSaved?: () => void }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(localStorage.getItem(GROQ_KEY_STORAGE) || "");
  }, []);

  function save() {
    if (value.trim()) localStorage.setItem(GROQ_KEY_STORAGE, value.trim());
    else localStorage.removeItem(GROQ_KEY_STORAGE);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved?.();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound size={15} className="text-[var(--muted)]" />
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="gsk_…"
          className="flex-1 rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-nebula-500"
        />
        <button
          onClick={save}
          className="flex items-center gap-1 rounded-xl bg-nebula-600 px-3 py-2.5 text-sm font-medium text-white"
        >
          {saved ? <Check size={15} /> : "Save"}
        </button>
      </div>
      <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-nebula-600">
        Get a free Groq API key <ExternalLink size={11} />
      </a>
    </div>
  );
}
