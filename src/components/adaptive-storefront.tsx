"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { StorefrontHome } from "@/components/storefront-home";
import { NativeMobileHome } from "@/components/native-mobile-home";
import { DesktopPosLayout } from "@/components/desktop-pos-layout";
import type { Dish } from "@/lib/data";

export const VIEW_MODE_CHANGE_EVENT = "hmf_view_mode_changed";
type ViewMode = "auto" | "web" | "app";

export function AdaptiveStorefront({ dishes }: { dishes: Dish[] }) {
  const [mode, setMode] = useState<ViewMode>("web");
  const [isMobile, setIsMobile] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 1023px)");
    const standalone = window.matchMedia("(display-mode: standalone)");
    const updateViewport = () => setIsMobile(viewport.matches);
    const updateStandalone = () => setIsStandalone(
      standalone.matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true,
    );
    const restoreMode = () => {
      try {
        const saved = localStorage.getItem("hmf_view_mode");
        setMode(saved === "app" || saved === "web" || saved === "auto" ? saved : "auto");
      } catch (error) {
        console.warn("Could not restore the saved view preference.", error);
        setMode("auto");
      }
      updateViewport();
      updateStandalone();
      setReady(true);
    };
    const restoreTimer = window.setTimeout(restoreMode, 0);
    const onModeChange = (event: Event) => {
      const selected = (event as CustomEvent<ViewMode>).detail;
      if (selected !== "app" && selected !== "web" && selected !== "auto") return;
      setMode(selected);
      try {
        localStorage.setItem("hmf_view_mode", selected);
      } catch (error) {
        console.warn("Could not save the view preference.", error);
      }
    };
    viewport.addEventListener("change", updateViewport);
    standalone.addEventListener("change", updateStandalone);
    window.addEventListener(VIEW_MODE_CHANGE_EVENT, onModeChange);
    return () => {
      window.clearTimeout(restoreTimer);
      viewport.removeEventListener("change", updateViewport);
      standalone.removeEventListener("change", updateStandalone);
      window.removeEventListener(VIEW_MODE_CHANGE_EVENT, onModeChange);
    };
  }, []);

  const appMode = mode === "app" || (mode === "auto" && isStandalone);
  const renderMobileApp = isMobile || (appMode && isMobile);
  const renderDesktopApp = !isMobile && appMode;
  const transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="sync" initial={false}>
        {!ready ? (
          <motion.div
            key="storefront-loading"
            className="adaptive-storefront-loading"
            aria-label="Loading storefront"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            <div className="adaptive-loading-content" aria-hidden="true">
              <span className="adaptive-loading-title" />
              <div className="adaptive-loading-categories">
                {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
              </div>
              <div className="adaptive-loading-grid">
                {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
              </div>
            </div>
          </motion.div>
        ) : renderMobileApp ? (
          <motion.div
            key="mobile-app"
            className="adaptive-mobile-app"
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={transition}
          >
            <NativeMobileHome dishes={dishes} />
          </motion.div>
        ) : renderDesktopApp ? (
          <motion.div
            key="desktop-app"
            className="adaptive-desktop-app"
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={transition}
          >
            <DesktopPosLayout dishes={dishes} />
          </motion.div>
        ) : (
          <motion.div
            key="website"
            className="adaptive-web-wrapper"
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={transition}
          >
            <StorefrontHome dishes={dishes} />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
