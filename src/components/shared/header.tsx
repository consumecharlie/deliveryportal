"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/templates", label: "Templates" },
  { href: "/projects", label: "Project Links" },
  { href: "/analytics", label: "Analytics" },
];

export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [imgError, setImgError] = useState(false);

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
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {session.user.image && !imgError ? (
                    <img
                      src={session.user.image}
                      alt=""
                      className="h-6 w-6 rounded-full"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {session.user.name ?? session.user.email}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
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
