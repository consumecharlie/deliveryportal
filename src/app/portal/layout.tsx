import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Portal | Consume Media",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="portal-ground">{children}</div>;
}
