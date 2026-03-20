"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

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
  const { data: session, status } = useSession();
  const [imgError, setImgError] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const userName = session?.user?.name ?? session?.user?.email ?? "User";
  const initials = getInitials(session?.user?.name, session?.user?.email);
  const avatarUrl = session?.user?.image;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border/30 backdrop-blur-xl bg-background/80 dark:bg-[#151919]/75 z-50">
      {/* Left: Pacman logo + Delivery Portal branding */}
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <img src="/pacman-brand.svg" alt="Consume Media" className="h-9" />
        <span className="font-eighties text-lg leading-tight">
          Delivery Portal
        </span>
      </Link>

      {/* Right: Profile + Sign out */}
      <div className="flex items-center gap-6 shrink-0">
        {status === "authenticated" && session?.user && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <span className="hidden sm:inline text-sm text-muted-foreground">
                {userName}
              </span>
              {avatarUrl && !imgError ? (
                <img
                  src={avatarUrl}
                  alt={userName}
                  className="w-8 h-8 rounded-full border border-border/30 object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium bg-muted text-muted-foreground border border-border/30">
                  {initials}
                </div>
              )}
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 rounded-xl shadow-xl py-1 min-w-40 bg-popover border border-border/30">
                  {session.user.email && (
                    <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/30">
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
      </div>
    </header>
  );
}
