"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/shared/header";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith("/auth");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <Header />
      </div>

      {/* Sidebar + Content */}
      <div className="flex h-full pt-[64px]">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto -mt-[64px] pt-[64px]">
          <div className="px-6 pb-6 pt-6 max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
