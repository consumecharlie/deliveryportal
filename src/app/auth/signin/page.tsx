"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArcadeBackground } from "@/components/arcade-background";
import PacmanLoader from "@/components/ui/pacman-loader";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error");

  return (
    <div className="fixed inset-0 z-50 bg-[#151919] overflow-hidden">
      {/* Arcade interactive background */}
      <ArcadeBackground />

      {/* Content — centered above background */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen pointer-events-none">
        {/* CharlieOS Logo */}
        <div className="mb-10 pointer-events-auto">
          <svg width="98" height="30" viewBox="0 0 195 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.9793 17.9287C18.8935 17.9287 22.9582 19.66 25.5927 22.3698L21.7162 26.9615C19.9849 24.8538 17.4256 23.5365 15.0922 23.5365C10.9145 23.5365 7.75309 26.8485 7.75309 31.1767C7.75309 35.5802 10.9145 38.9298 15.0922 38.9298C17.3127 38.9298 19.872 37.7255 21.7162 35.8436L25.6304 39.9836C22.8076 42.8816 18.63 44.8011 14.7535 44.8011C6.81218 44.8011 0.903273 38.9675 0.903273 31.252C0.903273 23.6495 6.96273 17.9287 14.9793 17.9287ZM42.1671 23.9129C46.6459 23.9129 49.5815 26.9615 49.5815 31.7036V44.5H43.0704V33.5102C43.0704 31.1391 41.7155 29.6713 39.495 29.6713C36.9357 29.6713 35.355 31.7036 35.355 34.4887V44.5H28.8439V16.5738H35.355V27.5636C36.7851 25.1549 39.1562 23.9505 42.1671 23.9129ZM63.2711 23.9129C68.8413 23.9129 72.078 26.6604 72.1157 31.252V44.5H65.7551V42.1665C64.4379 43.8978 62.2926 44.8011 59.5451 44.8011C55.217 44.8011 52.5824 42.1665 52.5824 38.4405C52.5824 34.6016 55.3299 32.3435 60.3731 32.3058H65.7175V32.0047C65.7175 30.01 64.4002 28.8056 61.7657 28.8056C60.072 28.8056 57.8515 29.4078 55.7062 30.4993L53.862 26.2087C57.0235 24.7409 59.8839 23.9129 63.2711 23.9129ZM61.5399 40.3976C63.5722 40.3976 65.3035 39.2685 65.7175 37.6125V35.806H61.6151C59.658 35.806 58.6795 36.4835 58.6795 37.9889C58.6795 39.4567 59.7333 40.3976 61.5399 40.3976ZM83.2413 24.214V27.6389C84.6339 25.2678 86.9297 23.9505 89.8277 23.9129V29.7842C86.0641 29.4455 83.5801 31.2144 83.2413 34.0747V44.5H76.7302V24.214H83.2413ZM99.4911 44.5H92.98V16.5738H99.4911V44.5ZM108.158 14.9555C110.153 14.9555 111.583 16.3856 111.583 18.3804C111.583 20.4127 110.153 21.8429 108.158 21.8429C106.164 21.8429 104.733 20.4127 104.733 18.3804C104.733 16.3856 106.164 14.9555 108.158 14.9555ZM111.357 44.5H104.884V24.214H111.357V44.5ZM125.454 23.9882C132.605 23.9882 136.143 28.6927 135.691 36.1071H121.427C122.067 38.5158 123.798 39.8707 126.207 39.8707C127.976 39.8707 129.707 39.1556 131.062 37.8007L134.487 41.1504C132.417 43.4085 129.368 44.7258 125.642 44.7258C119.018 44.7258 114.878 40.5858 114.878 34.4135C114.878 28.1282 119.169 23.9882 125.454 23.9882ZM121.314 32.6069H129.443C129.443 30.1229 127.863 28.5045 125.529 28.5045C123.271 28.5045 121.728 30.1605 121.314 32.6069Z" fill="white"/>
            <path d="M141 18.018H143.998V15.0201H161.986V18.018H164.984V42.002H161.986V45H143.998V42.002H141V18.018ZM146.996 39.004H158.988V21.016H146.996V39.004ZM167.994 18.018H170.992V15.0201H188.98V18.018H191.978V24.014H185.982V21.016H173.99V27.012H188.98V30.01H191.978V42.002H188.98V45H170.992V42.002H167.994V36.006H173.99V39.004H185.982V33.008H170.992V30.01H167.994V18.018Z" fill="#6AC387"/>
          </svg>
        </div>

        {/* Heading */}
        <h1 className="font-eighties text-3xl text-[#E5EEEB] mb-2 text-center">
          Deliverable Portal
        </h1>
        <p className="text-sm text-[#6F7F7F] mb-8 text-center">
          Sign in with your Google account to access the portal.
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-center text-sm text-red-400 max-w-sm pointer-events-auto">
            {error === "AccessDenied"
              ? "Access denied. Only @consume-media.com accounts are allowed."
              : "An error occurred during sign-in. Please try again."}
          </div>
        )}

        {/* Button — stroke style, fills green on hover */}
        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="pointer-events-auto inline-flex items-center justify-center gap-3 px-16 py-3 rounded-lg
                     bg-transparent border border-[#4D5B59] hover:border-[#DBEF00]
                     text-[#E5EEEB] text-sm font-medium
                     transition-all duration-150 cursor-pointer"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#151919]">
          <PacmanLoader size={24} />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
