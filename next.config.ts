import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase max header size to avoid HTTP 431 with Supabase SSR cookies
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Allow larger headers for Supabase auth tokens
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "x-middleware-cache",
          value: "no-cache",
        },
      ],
    },
  ],
};

export default nextConfig;
