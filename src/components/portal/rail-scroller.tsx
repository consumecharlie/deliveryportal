"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps the roadmap rail so the right-edge fade only shows while there is
 * more rail to the right: columns compress first (CSS), and only when they
 * hit their minimum width does the rail overflow into a horizontal scroll.
 * On mount an overflowing rail is scrolled (instantly, so reduced-motion
 * users get no animation) so the milestone the client is on sits about a
 * third of the way in: up next, else in review, else the last delivered.
 */
function focusItem(rail: HTMLElement): HTMLElement | null {
  return (
    rail.querySelector<HTMLElement>(".portal-rail-item-up-next") ??
    rail.querySelector<HTMLElement>(".portal-rail-item-in-review") ??
    Array.from(rail.querySelectorAll<HTMLElement>(".portal-rail-item-delivered")).at(-1) ??
    null
  );
}
export function RailScroller({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const rail = wrap?.querySelector<HTMLElement>(".portal-rail");
    if (!wrap || !rail) return;

    function update() {
      if (!wrap || !rail) return;
      const more = rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 4;
      wrap.dataset.fade = more ? "1" : "0";
    }
    if (rail.scrollWidth > rail.clientWidth) {
      const item = focusItem(rail);
      if (item) {
        const offset = item.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
        rail.scrollLeft = Math.max(0, Math.round(offset - rail.clientWidth / 3));
      }
    }
    update();
    rail.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(rail);
    window.addEventListener("resize", update);
    return () => {
      rail.removeEventListener("scroll", update);
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div ref={wrapRef} className="portal-rail-wrap">
      {children}
    </div>
  );
}
