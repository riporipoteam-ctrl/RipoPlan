"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Public fallbacks so the static build works with zero configuration.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xbwhvkzgbnyqsjplbyox.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Jcs8IXK6YnOwWe-qYAFecg_Tb6M-ohu";

// Single shared client. Components call createClient() on every render, so without
// this we'd spin up many GoTrueClient instances (each with its own auth listener +
// realtime socket), which made navigation lag and leak memory.
let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}
