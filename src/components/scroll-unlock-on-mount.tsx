"use client";

import { useEffect } from "react";
import { clearStaleScrollLock } from "@/lib/scroll-lock";

export function ScrollUnlockOnMount() {
  useEffect(() => {
    const frame = window.requestAnimationFrame(clearStaleScrollLock);
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return null;
}
