"use client";

export type RealtimeEventPayload = {
  type: "order_created" | "order_cancelled" | "order_status" | "chat_message" | "menu_updated" | "settings_updated" | "deal_updated" | "admin_notification";
  orderNumber?: string;
  customerName?: string;
  message?: string;
  timestamp: string;
};

export const REALTIME_BUS_CHANNEL = "hmf_realtime_bus";
export const REALTIME_EVENT_DOM = "hmf_realtime_event";

// Play pleasant web audio chime
export function playAlertChime(tone: "success" | "alert" | "pop" = "pop") {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (tone === "alert") {
      // High-priority dual chime for order cancellation or new order
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2); // A4
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (tone === "success") {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15); // G5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch {
    /* AudioContext is optional */
  }
}

// Broadcast event to other tabs and same-page listeners
export function broadcastRealtimeEvent(payload: Omit<RealtimeEventPayload, "timestamp">) {
  if (typeof window === "undefined") return;
  const fullPayload: RealtimeEventPayload = {
    ...payload,
    timestamp: new Date().toISOString(),
  };

  // 1. Dispatch local DOM event
  window.dispatchEvent(new CustomEvent(REALTIME_EVENT_DOM, { detail: fullPayload }));

  // 2. Broadcast across browser tabs
  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(REALTIME_BUS_CHANNEL);
      channel.postMessage(fullPayload);
      channel.close();
    }
  } catch {
    /* BroadcastChannel optional */
  }
}

// Subscribe to realtime bus events
export function subscribeRealtimeEvents(callback: (payload: RealtimeEventPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onDomEvent = (e: Event) => {
    const ce = e as CustomEvent<RealtimeEventPayload>;
    if (ce.detail) callback(ce.detail);
  };

  window.addEventListener(REALTIME_EVENT_DOM, onDomEvent);

  let channel: BroadcastChannel | null = null;
  try {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(REALTIME_BUS_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data) callback(event.data as RealtimeEventPayload);
      };
    }
  } catch {
    /* BroadcastChannel optional */
  }

  return () => {
    window.removeEventListener(REALTIME_EVENT_DOM, onDomEvent);
    if (channel) {
      channel.close();
    }
  };
}
