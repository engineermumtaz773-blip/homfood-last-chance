"use client";

import { useEffect } from "react";
import { isAppOnline, NETWORK_STATUS_EVENT } from "@/lib/offline-storage";

function isLocalhost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function PwaRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Listen to online and offline window events
    const updateNetworkStatus = () => {
      window.dispatchEvent(
        new CustomEvent(NETWORK_STATUS_EVENT, {
          detail: { isOnline: isAppOnline() },
        })
      );
    };

    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);

    if (!("serviceWorker" in navigator)) return;

    const isDev = process.env.NODE_ENV === "development" && isLocalhost(window.location.hostname);
    if (!isDev) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Check for updates periodically
          registration.onupdatefound = () => {
            const installing = registration.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  console.info("New Home Made Food PWA version available.");
                }
              };
            }
          };
        })
        .catch((error: unknown) => {
          console.warn("Home Made Food PWA service worker registration notice:", error);
        });
    }

    return () => {
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
    };
  }, []);

  return null;
}
