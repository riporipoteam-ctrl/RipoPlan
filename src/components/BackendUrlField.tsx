"use client";

import { useEffect, useState } from "react";
import { Check, Server } from "lucide-react";
import { BACKEND_STORAGE } from "@/lib/backend";

export function BackendUrlField() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(localStorage.getItem(BACKEND_STORAGE) || "");
  }, []);

  function save() {
    const v = value.trim().replace(/\/+$/, "");
    if (v) localStorage.setItem(BACKEND_STORAGE, v);
    else localStorage.removeItem(BACKEND_STORAGE);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="flex items-center gap-2">
      <Server size={15} className="text-[var(--muted)]" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://ripoai-nvidia.<you>.workers.dev"
        className="flex-1 rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-nebula-500"
      />
      <button onClick={save} className="flex items-center gap-1 rounded-xl bg-nebula-600 px-3 py-2.5 text-sm font-medium text-white">
        {saved ? <Check size={15} /> : "Save"}
      </button>
    </div>
  );
}
