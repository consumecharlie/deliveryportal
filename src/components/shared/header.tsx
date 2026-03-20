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

  const userName = session?.user?.name ?? session?.user?.email ?? "User";
  const initials = getInitials(session?.user?.name, session?.user?.email);
  const avatarUrl = session?.user?.image;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border/30 backdrop-blur-xl bg-background/80 dark:bg-[#151919]/75 z-50">
      {/* Left: Pacman logo + Delivery Portal branding */}
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <img src="/pacman-brand.svg" alt="Consume Media" className="h-9" />
        <div className="flex flex-col">
          <span className="font-eighties text-lg leading-tight">
            Delivery Portal
          </span>
          <span className="font-pixel text-[10px] leading-tight" style={{ color: "#6AC387" }}>
            CLIENT DELIVERABLES
          </span>
        </div>
      </Link>

      {/* Right: Profile + Logout */}
      <div className="flex items-center gap-6 shrink-0">
        {status === "authenticated" && session?.user && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
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
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="font-pixel text-[13px] text-foreground bg-muted-foreground/20 hover:bg-[#6AC387] hover:text-[#151919] px-4 py-2 rounded transition-colors duration-75 whitespace-nowrap cursor-pointer"
            >
              LOGOUT
            </button>
          </>
        )}
      </div>
    </header>
  );
}
