import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a custom build dir locally so Turbopack/webpack caches don't collide.
  // Vercel sets NODE_ENV=production and uses the default ".next".
  ...(process.env.NODE_ENV === "development" ? { distDir: ".next-dev" } : {}),
};

export default nextConfig;
