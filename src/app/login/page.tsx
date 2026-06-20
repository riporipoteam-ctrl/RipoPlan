"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split("@")[0] } },
        });
        if (error) throw error;
        if (data.session) {
          router.push("/home");
          router.refresh();
        } else {
          // Users are auto-confirmed server-side — sign in immediately.
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            setMsg("Account created. You can now log in.");
            setMode("login");
          } else {
            router.push("/home");
            router.refresh();
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/home");
        router.refresh();
      }
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: "google" | "github") {
    setErr(null);
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${base}/home/` },
    });
    if (error) setErr(`${provider} sign-in not configured: ${error.message}`);
  }

  return (
    <div className="dark flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-[var(--text)]">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-nebula-500 to-nebula-pink text-2xl shadow-lg shadow-nebula-600/30">
            <Sparkles className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AgentNexus</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Your team of autonomous AI agents, working 24/7.
          </p>
        </div>

        <div className="rounded-2xl border border-ink-border bg-ink-card p-5">
          <div className="mb-4 flex rounded-xl bg-black/30 p-1 text-sm">
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg py-1.5 ${mode === "signup" ? "bg-nebula-600 text-white" : "text-ink-muted"}`}
            >
              Sign up
            </button>
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-lg py-1.5 ${mode === "login" ? "bg-nebula-600 text-white" : "text-ink-muted"}`}
            >
              Log in
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-ink-border bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-nebula-500"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-ink-border bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-nebula-500"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              className="w-full rounded-xl border border-ink-border bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-nebula-500"
            />
            <button
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-nebula-600 to-nebula-pink py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="animate-spin" size={16} />}
              {mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>

          {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
          {msg && <p className="mt-3 text-xs text-emerald-400">{msg}</p>}

          <div className="my-4 flex items-center gap-3 text-xs text-ink-muted">
            <div className="h-px flex-1 bg-ink-border" /> or <div className="h-px flex-1 bg-ink-border" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => oauth("google")}
              className="rounded-xl border border-ink-border bg-black/20 py-2 text-sm hover:bg-black/40"
            >
              Google
            </button>
            <button
              onClick={() => oauth("github")}
              className="rounded-xl border border-ink-border bg-black/20 py-2 text-sm hover:bg-black/40"
            >
              GitHub
            </button>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">
          By continuing you agree to the demo terms.
        </p>
      </div>
    </div>
  );
}
