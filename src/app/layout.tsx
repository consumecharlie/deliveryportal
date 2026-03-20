import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/shared/providers";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/shared/header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const eightiesComeback = localFont({
  src: "../fonts/EightiesComeback-ExtraBold.otf",
  variable: "--font-eighties",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Consume Media - Deliverable Portal",
  description: "Preview, edit, and send client deliverables",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${eightiesComeback.variable} antialiased`}
      >
        <Providers>
          <div className="min-h-screen bg-background">
            <Header />
            <main className="container mx-auto px-4 py-6">{children}</main>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
