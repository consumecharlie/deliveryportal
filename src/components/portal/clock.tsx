"use client";

import { useEffect, useState } from "react";
import { menuClock } from "./format";

/**
 * The desktop clock: "Fri Sep 11 4:21 PM" in Eastern time, re-aligned to the
 * minute boundary so the display never lags. The pixel font uppercases it.
 */
export function Clock({ className = "portal-desk-clock" }: { className?: string }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    let timer: number | undefined;
    function tick() {
      setText(menuClock());
      const ms = 60_000 - (Date.now() % 60_000) + 50;
      timer = window.setTimeout(tick, ms);
    }
    tick();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return (
    <time className={className} aria-live="off" suppressHydrationWarning>
      {text}
    </time>
  );
}
