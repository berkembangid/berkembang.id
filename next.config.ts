import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer memuat metrik font bawaan dari berkas di dalam paketnya.
  // Membundelnya lewat webpack merusak resolusi berkas itu, jadi paketnya
  // dibiarkan dimuat langsung oleh Node di sisi server.
  serverExternalPackages: ["@react-pdf/renderer"],
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
