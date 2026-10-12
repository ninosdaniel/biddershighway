import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabase() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env, then restart Next.js.",
    );
  }

  if (!key.startsWith("sb_publishable_")) {
    throw new Error("Use a Supabase publishable key for this browser application.");
  }

  client = createClient(url, key);
  return client;
}
