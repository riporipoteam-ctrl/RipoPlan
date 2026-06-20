"use client";

import { createBrowserClient } from "@supabase/ssr";

// Public fallbacks so the static build works with zero configuration.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xbwhvkzgbnyqsjplbyox.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Jcs8IXK6YnOwWe-qYAFecg_Tb6M-ohu";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
