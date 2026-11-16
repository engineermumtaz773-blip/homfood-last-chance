"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const BANNER_DISMISSED_KEY = "hmf_pwa_banner_dismissed";

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isRunningStandalone) {
      const frame = window.requestAnimationFrame(() => setIsStandalone(true));
      return () => window.cancelAnimationFrame(frame);
    }

    // Check if previously dismissed in this session
    const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissed) return;

    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = isAppleDevice && !/crios|fxios|opios|mercury/.test(userAgent);
    if (isAppleDevice && isSafari) {
      const frame = window.requestAnimationFrame(() => {
        setIsIos(true);
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    // Listen for Chrome / Android beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsVisible(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn("PWA installation prompt error:", err);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
  };

  if (isStandalone || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "linear-gradient(90deg, #065f46 0%, #047857 50%, #059669 100%)",
          color: "#ffffff",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 16px rgba(4, 120, 87, 0.25)",
          fontSize: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              flexShrink: 0,
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            <Image src="/image_6c70d8.jpg" alt="Home Made Food logo" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px" }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "13px", lineHeight: 1.2 }}>
              Install Home Made Food App
            </div>
            <div style={{ fontSize: "11px", opacity: 0.9 }}>
              {isIos
                ? "Tap Share (⎋) then 'Add to Home Screen' (⊞)"
                : "1-Tap fast ordering & live Raast payment"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {!isIos && deferredPrompt && (
            <button
              type="button"
              onClick={handleInstallClick}
              style={{
                background: "#ffffff",
                color: "#065f46",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              }}
            >
              Install
            </button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            style={{
              background: "rgba(255,255,255,0.2)",
              color: "#ffffff",
              border: "none",
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
