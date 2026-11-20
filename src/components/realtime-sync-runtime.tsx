"use client";

import { useEffect } from "react";
import { getRealtimeClient, REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import { REALTIME_EVENT_DOM, type RealtimeEventPayload } from "@/lib/realtime-bus";
import { getSupabaseAuthClient } from "@/lib/supabase-auth-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const tables = ["menu_items", "daily_deals", "categories", "orders", "meal_subscriptions", "reservations", "store_settings_public", "profiles", "order_messages", "admin_notification_events"];

export function RealtimeSyncRuntime() {
  useEffect(() => {
    const client = getRealtimeClient();
    let channel: RealtimeChannel | null = null;

    const publish = (table: string, payload?: Record<string, unknown>) => {
      const syncTable = table === "store_settings_public" ? "store_settings" : table;
      window.dispatchEvent(new CustomEvent(REALTIME_SYNC_EVENT, { detail: { table: syncTable, at: Date.now() } }));
      const eventMap: Partial<Record<string, RealtimeEventPayload["type"]>> = {
        order_messages: "chat_message",
        menu_items: "menu_updated",
        daily_deals: "deal_updated",
        store_settings: "settings_updated",
        store_settings_public: "settings_updated",
        admin_notification_events: "admin_notification",
      };
      const type = table === "orders"
        ? payload?.status === "cancelled" ? "order_cancelled" : payload?.__event === "INSERT" ? "order_created" : "order_status"
        : eventMap[table];
      if (type) {
        const row = payload || {};
        window.dispatchEvent(new CustomEvent(REALTIME_EVENT_DOM, {
          detail: {
            type,
            orderNumber: typeof row.number === "string" ? row.number : typeof row.order_number === "string" ? row.order_number : undefined,
            message: typeof row.body === "string" && row.body ? row.body : typeof row.title === "string" ? row.title : type === "chat_message" ? "A new order message was received." : `Live ${syncTable} data changed.`,
            timestamp: new Date().toISOString(),
          } satisfies RealtimeEventPayload,
        }));
      }
    };

    if (client) {
      let disposed = false;
      const connect = async () => {
        const auth = getSupabaseAuthClient();
        const { data } = auth ? await auth.auth.getSession() : { data: { session: null } };
        if (data.session?.access_token) client.realtime.setAuth(data.session.access_token);
        if (disposed) return;
        channel = client.channel("hmf-platform-sync");
        for (const table of tables) {
          channel.on("postgres_changes", { event: "*", schema: "public", table }, (change) => publish(table, { ...(change.new as Record<string, unknown>), __event: change.eventType }));
        }
        channel.on("broadcast", { event: "sync" }, (message) => {
          const payload = message.payload as { table?: string; row?: Record<string, unknown> } | undefined;
          if (payload?.table) publish(payload.table, payload.row);
        });
        channel.subscribe();
      };
      void connect().catch((error: unknown) => console.error("Could not connect to Supabase Realtime.", error));
      return () => { disposed = true; if (channel) void client.removeChannel(channel); };
    }

    return undefined;
  }, []);

  return null;
}
