"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

let client: SupabaseClient | null = null;
let warnedMissingConfiguration = false;

export function getRealtimeClient() {
  if (!url || !anonKey) {
    if (!warnedMissingConfiguration) {
      console.error("Supabase Realtime is unavailable. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      warnedMissingConfiguration = true;
    }
    return null;
  }
  client ??= createClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

export const REALTIME_SYNC_EVENT = "hmf_realtime_sync";
