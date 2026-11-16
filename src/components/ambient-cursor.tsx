"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function AmbientCursor() {
  const pointerX = useMotionValue(-100);
  const pointerY = useMotionValue(-100);
  const ringX = useSpring(pointerX, { stiffness: 380, damping: 32, mass: 0.3 });
  const ringY = useSpring(pointerY, { stiffness: 380, damping: 32, mass: 0.3 });
  const trailX = useSpring(pointerX, { stiffness: 150, damping: 24, mass: 0.6 });
  const trailY = useSpring(pointerY, { stiffness: 150, damping: 24, mass: 0.6 });

  useEffect(() => {
    const motionQuery = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!motionQuery.matches) return;

    const root = document.documentElement;
    root.dataset.customCursor = "on";
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerX.set(event.clientX);
      pointerY.set(event.clientY);
      const target = event.target instanceof Element
        ? event.target.closest("a, button, summary, [role='button'], input, textarea, select")
        : null;
      root.dataset.customCursorHover = target ? "true" : "false";
    };
    const onPointerLeave = () => { root.dataset.customCursorHover = "false"; };
    const onWindowBlur = () => { root.dataset.customCursorHover = "false"; };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onWindowBlur);
      delete root.dataset.customCursor;
      delete root.dataset.customCursorHover;
    };
  }, [pointerX, pointerY]);

  return (
    <>
      <motion.span className="ambient-cursor-trail" aria-hidden="true" style={{ x: trailX, y: trailY }} />
      <motion.span className="ambient-cursor-ring" aria-hidden="true" style={{ x: ringX, y: ringY }} />
      <motion.span className="ambient-cursor-dot" aria-hidden="true" style={{ x: pointerX, y: pointerY }} />
    </>
  );
}
