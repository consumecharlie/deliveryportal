import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Portal | Consume Media",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-neutral-900 font-[family-name:var(--font-montserrat)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">{children}</div>
    </div>
  );
}
