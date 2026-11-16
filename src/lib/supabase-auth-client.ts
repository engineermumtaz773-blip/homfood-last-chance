"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let authClient: SupabaseClient | null = null;
let warnedMissingConfiguration = false;

export function getSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (!warnedMissingConfiguration) {
      console.error("Supabase Auth is unavailable. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      warnedMissingConfiguration = true;
    }
    return null;
  }
  authClient ??= createClient(url, anonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return authClient;
}
