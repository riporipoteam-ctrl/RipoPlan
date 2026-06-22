"use client";

import { useEffect, useState } from "react";
import { Boxes, Loader2, Code2, Eye, Trash2, Copy, Check, X, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import type { MiniApp } from "@/lib/types";

export default function MiniAppsPage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<MiniApp | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const load = () =>
      supabase
        .from("mini_apps")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setApps((data as MiniApp[]) || []);
          setLoading(false);
        });
    load();
    const ch = supabase
      .channel(`mini-apps-${ctx.workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mini_apps", filter: `workspace_id=eq.${ctx.workspace.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  async function remove(app: MiniApp) {
    if (!window.confirm(`Delete "${app.name}"?`)) return;
    setApps((a) => a.filter((x) => x.id !== app.id));
    if (open?.id === app.id) setOpen(null);
    await supabase.from("mini_apps").delete().eq("id", app.id);
  }

  return (
    <>
      <TopBar title="Mini Apps" subtitle="Websites & apps your agents built" back="/settings" />
      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-nebula-100 text-nebula-600">
              <Boxes size={26} />
            </div>
            <h2 className="text-lg font-bold">No mini apps found</h2>
            <p className="max-w-xs text-sm text-[var(--muted)]">
              Ask in any chat — e.g. <span className="italic">&ldquo;build me an auto repair shop website&rdquo;</span> —
              and your Coder agent will build it and publish it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {apps.map((app) => (
              <div key={app.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <button onClick={() => setOpen(app)} className="block w-full">
                  <div className="relative h-36 w-full overflow-hidden bg-white">
                    {app.status === "building" ? (
                      <div className="flex h-full items-center justify-center text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
                    ) : (
                      <iframe srcDoc={app.html || ""} title={app.name} className="pointer-events-none h-[300px] w-[200%] origin-top-left scale-50 border-0" sandbox="allow-scripts" />
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{app.name}</div>
                    {app.description && <div className="truncate text-xs text-[var(--muted)]">{app.description}</div>}
                  </div>
                  <button onClick={() => setOpen(app)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/5" title="Open"><Eye size={16} /></button>
                  <button onClick={() => remove(app)} className="rounded-lg p-1.5 text-[var(--muted)] hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && <AppViewer app={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function AppViewer({ app, onClose }: { app: MiniApp; onClose: () => void }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState(app.html || "");
  const [dirty, setDirty] = useState(false);

  async function save() {
    await supabase.from("mini_apps").update({ html, updated_at: new Date().toISOString() }).eq("id", app.id);
    setDirty(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-black/5"><X size={18} /></button>
        <span className="min-w-0 flex-1 truncate font-semibold">{app.name}</span>
        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
          <button onClick={() => setTab("preview")} className={`flex items-center gap-1 rounded px-2 py-1 ${tab === "preview" ? "bg-nebula-600 text-white" : "text-[var(--muted)]"}`}><Eye size={13} /> Preview</button>
          <button onClick={() => setTab("code")} className={`flex items-center gap-1 rounded px-2 py-1 ${tab === "code" ? "bg-nebula-600 text-white" : "text-[var(--muted)]"}`}><Code2 size={13} /> Code</button>
        </div>
      </div>

      {tab === "preview" ? (
        <iframe srcDoc={html} title={app.name} className="flex-1 border-0 bg-white" sandbox="allow-scripts allow-forms allow-modals allow-popups" />
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <button
              onClick={async () => { await navigator.clipboard.writeText(html); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-black/5"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />} {copied ? "Copied" : "Copy code"}
            </button>
            {dirty && (
              <button onClick={save} className="rounded-lg bg-nebula-600 px-2.5 py-1 text-xs font-medium text-white">Save changes</button>
            )}
            <span className="ml-auto text-xs text-[var(--muted)]">Edit code or ask for changes in chat</span>
          </div>
          <textarea
            value={html}
            onChange={(e) => { setHtml(e.target.value); setDirty(true); }}
            spellCheck={false}
            className="flex-1 resize-none bg-[var(--card)] p-3 font-mono text-xs outline-none"
          />
        </div>
      )}
    </div>
  );
}
