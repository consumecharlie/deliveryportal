"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "/icons/tack.svg" },
  { href: "/drafts", label: "Drafts", icon: "/icons/pencil.svg" },
  { href: "/scheduled", label: "Scheduled", icon: "/icons/on-button.svg" },
  { href: "/sent", label: "Sent", icon: "/icons/sent.svg" },
  { href: "/templates", label: "Templates", icon: "/icons/folder.svg" },
  { href: "/projects", label: "Project Links", icon: "/icons/bookmark.svg" },
  { href: "/analytics", label: "Analytics", icon: "/icons/timer.svg" },
  { href: "/settings", label: "Settings", icon: "/icons/rules.svg" },
];

const STORAGE_KEY = "deliverable-portal:sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted state once on mount; render expanded on first paint
  // until hydration finishes so SSR markup matches the client.
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved === "1") setCollapsed(true);
      }
    } catch {
      /* localStorage unavailable — ignore */
    }
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        }
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const isCollapsed = hydrated && collapsed;

  return (
    <aside
      className={`shrink-0 h-full bg-background dark:bg-[#151919] border-r border-[#364040]/30 overflow-y-auto flex flex-col transition-[width] duration-200 ease-out ${
        isCollapsed ? "w-14" : "w-64"
      }`}
    >
      {/* Toggle row */}
      <div
        className={`flex h-10 items-center ${
          isCollapsed ? "justify-center px-2" : "justify-end px-2"
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-[#DBEF00] hover:bg-[#DBEF00]/10 transition-colors"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-0 space-y-0">
        {/* Section header */}
        {!isCollapsed && (
          <div className="px-4 py-2">
            <span className="font-pixel text-[11px]" style={{ color: "#6AC387" }}>
              NAVIGATION
            </span>
          </div>
        )}

        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center text-sm font-medium transition-colors duration-150 border-l-4 ${
                isCollapsed ? "justify-center px-0 py-3" : "px-4 py-3"
              } ${
                isActive
                  ? "text-[#508E61] dark:text-[#6AC387] border-[#6AC387] bg-[#C5FFD8]/30 dark:bg-[#6AC387]/10"
                  : "text-muted-foreground border-transparent hover:bg-[#DBEF00]/10 hover:text-foreground dark:hover:text-[#DBEF00]"
              }`}
            >
              <Image
                src={item.icon}
                alt=""
                width={24}
                height={24}
                className={isCollapsed ? "flex-shrink-0" : "mr-3 flex-shrink-0"}
              />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {session?.user && !isCollapsed && (
        <div className="p-4 border-t border-[#364040]/30 text-xs text-muted-foreground">
          <p className="mb-1">Logged in as:</p>
          <p className="font-medium text-foreground truncate">
            {session.user.name ?? session.user.email}
          </p>
        </div>
      )}
    </aside>
  );
}
