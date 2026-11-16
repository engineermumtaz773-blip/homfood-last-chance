"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LoadingScreen } from "@/components/loading-screen";

export function NavigationLoading() {
  const pathname = usePathname();
  const [loadingFromPath, setLoadingFromPath] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.hasAttribute("download") || link.target === "_blank") return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      const sourcePath = window.location.pathname;
      timer.current = window.setTimeout(() => {
        setLoadingFromPath(sourcePath);
        timer.current = window.setTimeout(() => setLoadingFromPath(null), 12000);
      }, 120);
    };
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const frame = window.requestAnimationFrame(() => setLoadingFromPath(null));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return loadingFromPath === pathname ? <LoadingScreen /> : null;
}
