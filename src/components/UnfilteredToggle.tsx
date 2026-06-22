"use client";

import { useEffect, useState } from "react";
import { UNFILTERED_STORAGE } from "@/lib/prefs";

export function UnfilteredToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(localStorage.getItem(UNFILTERED_STORAGE) === "1");
  }, []);

  function toggle() {
    if (!on) {
      const ok = confirm(
        "Enable 18+ Unfiltered mode?\n\nAgents will speak without content filtering (explicit language, mature/adult themes and roleplay). By enabling, you confirm you are 18 or older. (Illegal content is still never produced.)"
      );
      if (!ok) return;
      localStorage.setItem(UNFILTERED_STORAGE, "1");
      setOn(true);
    } else {
      localStorage.removeItem(UNFILTERED_STORAGE);
      setOn(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <div className="pr-3">
          <div className="text-sm font-semibold">18+ Unfiltered mode</div>
          <div className="text-xs text-[var(--muted)]">
            Agents speak freely — explicit language and mature (18+) themes. Stored on this device.
          </div>
        </div>
        <button
          onClick={toggle}
          aria-label="Toggle 18+ mode"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-nebula-600" : "bg-[var(--border)]"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
    </div>
  );
}
