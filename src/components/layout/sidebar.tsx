"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "/icons/tack.svg" },
  { href: "/templates", label: "Templates", icon: "/icons/folder.svg" },
  { href: "/projects", label: "Project Links", icon: "/icons/bookmark.svg" },
  { href: "/analytics", label: "Analytics", icon: "/icons/timer.svg" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-64 shrink-0 h-full bg-background dark:bg-[#151919] border-r border-[#364040]/30 overflow-y-auto flex flex-col">
      {/* Navigation */}
      <nav className="flex-1 px-0 pt-2 space-y-0">
        {/* Section header */}
        <div className="px-4 py-2">
          <span className="font-pixel text-[11px]" style={{ color: "#6AC387" }}>
            NAVIGATION
          </span>
        </div>

        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-3 text-sm font-medium transition-colors duration-150 border-l-4 ${
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
                className="mr-3 flex-shrink-0"
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {session?.user && (
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
