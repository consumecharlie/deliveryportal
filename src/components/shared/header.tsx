"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/templates", label: "Templates" },
  { href: "/projects", label: "Project Links" },
  { href: "/analytics", label: "Analytics" },
];

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  if (email) return email.substring(0, 2).toUpperCase();
  return "??";
}

export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [imgError, setImgError] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const userName = session?.user?.name ?? session?.user?.email ?? "User";
  const initials = getInitials(session?.user?.name, session?.user?.email);
  const avatarUrl = session?.user?.image;

  // Don't render nav on auth pages
  const isAuthPage = pathname.startsWith("/auth");

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link href="/" className="mr-8 font-semibold text-lg">
          Deliverable Portal
        </Link>

        {!isAuthPage && (
          <nav className="flex flex-1 items-center gap-6">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm transition-colors hover:text-foreground/80",
                    isActive
                      ? "text-foreground font-medium"
                      : "text-foreground/60"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        {!isAuthPage && (
          <div className="ml-auto flex items-center gap-3">
            {status === "authenticated" && session?.user && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {avatarUrl && !imgError ? (
                    <img
                      src={avatarUrl}
                      alt={userName}
                      className="h-7 w-7 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium bg-muted text-muted-foreground">
                      {initials}
                    </div>
                  )}
                  <span className="hidden sm:inline text-sm text-muted-foreground">
                    {userName}
                  </span>
                  <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 rounded-md shadow-lg py-1 min-w-40 bg-popover border">
                      {session.user.email && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b">
                          {session.user.email}
                        </div>
                      )}
                      <button
                        onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                        className="w-full text-left px-3 py-2 text-xs text-destructive hover:opacity-80 transition-opacity cursor-pointer"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {status === "unauthenticated" && (
              <Link href="/auth/signin">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
