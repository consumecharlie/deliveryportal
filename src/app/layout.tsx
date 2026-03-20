import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/shared/providers";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/app-shell";

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

const smallPixel = localFont({
  src: "../fonts/small_pixel-7.woff",
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Consume Media - Delivery Portal",
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
        className={`${geistSans.variable} ${geistMono.variable} ${eightiesComeback.variable} ${smallPixel.variable} antialiased`}
      >
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
