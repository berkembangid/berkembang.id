import type { NextConfig } from "next";
import { assertAppModeFromEnv } from "./lib/env/app-mode";

/**
 * Lingkungannya dipastikan SAAT BUILD, bukan hanya saat server dinyalakan.
 *
 * Dan keduanya memang perlu, bukan berlebihan:
 *
 *   `NEXT_PUBLIC_SUPABASE_URL` DITANAM ke dalam bundel saat build.
 *   `APP_MODE` dibaca dari lingkungan SAAT BERJALAN.
 *
 * Jadi pasangan yang cocok pada saat build bisa menjadi tidak cocok saat
 * dijalankan -- misalnya `APP_MODE` diubah di setelan Vercel tanpa deploy
 * ulang. Pemeriksaan di sini menghentikan build yang salah sebelum ia menjadi
 * deployment; pemeriksaan di `instrumentation.ts` menghentikan deployment yang
 * env-nya bergeser sesudah build.
 */
assertAppModeFromEnv();

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
