"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedCounter({ value }: { value: string }) {
  const match = /^(.*?)(\d[\d,]*)(.*?)$/.exec(value);
  const prefix = match?.[1] ?? "";
  const target = match ? Number(match[2].replace(/,/g, "")) : null;
  const suffix = match?.[3] ?? "";
  const [count, setCount] = useState(match ? 0 : null);
  const previous = useRef(0);

  useEffect(() => {
    if (target === null) {
      const frame = window.requestAnimationFrame(() => setCount(null));
      return () => window.cancelAnimationFrame(frame);
    }

    if (!Number.isFinite(target)) return;
    let startedAt = 0;
    let frame = 0;
    const from = previous.current;
    const animate = (now: number) => {
      if (!startedAt) startedAt = now;
      const progress = Math.min((now - startedAt) / 850, 1);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (target - from) * eased);
      previous.current = next;
      setCount(next);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [target]);

  if (!match || count === null) return <>{value}</>;
  return <>{prefix}{count.toLocaleString()}{suffix}</>;
}
