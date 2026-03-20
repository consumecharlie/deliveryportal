"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutDashboard, FileText, FolderOpen, BarChart3 } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/projects", label: "Project Links", icon: FolderOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-64 shrink-0 h-full bg-card/80 dark:bg-[#1E2424]/60 backdrop-blur-md border-r border-border/30 overflow-y-auto flex flex-col">
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
              <item.icon className="w-6 h-6 mr-3 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {session?.user && (
        <div className="p-4 border-t border-border/30 text-xs text-muted-foreground">
          <p className="mb-1">Logged in as:</p>
          <p className="font-medium text-foreground truncate">
            {session.user.name ?? session.user.email}
          </p>
        </div>
      )}
    </aside>
  );
}
