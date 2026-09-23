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
  // `sharp` mengecilkan pindaian dokumen sebelum ditanam ke PDF dossier. Ia
  // punya binary native, jadi ia dimuat Node langsung, bukan dibundel webpack.
  serverExternalPackages: ["@react-pdf/renderer", "sharp"],
  // Increase max header size to avoid HTTP 431 with Supabase SSR cookies
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  /**
   * Alamat lama yang berbahasa Inggris atau memakai "institusi".
   *
   * Semua portal kini beralamat bahasa Indonesia, dan portal lembaga berada di
   * `/lembaga`. Alamat lama sudah tersebar sebagai penanda peramban, tautan di
   * surel, dan catatan serah terima, jadi ia dialihkan -- bukan dibiarkan 404.
   * Pengalihan ini berjalan sebelum `proxy.ts`, jadi pemeriksaan peran hanya
   * pernah melihat alamat yang baru.
   */
  redirects: async () => [
    { source: "/institusi/broadcast/:path*", destination: "/lembaga/siaran/:path*", permanent: true },
    { source: "/institusi/shortlist/:path*", destination: "/lembaga/tersimpan/:path*", permanent: true },
    { source: "/institusi/requests/:path*", destination: "/lembaga/permintaan/:path*", permanent: true },
    { source: "/institusi/dossiers/:path*", destination: "/lembaga/dosir/:path*", permanent: true },
    { source: "/institusi/analytics/:path*", destination: "/lembaga/analitik/:path*", permanent: true },
    { source: "/institusi/:path*", destination: "/lembaga/:path*", permanent: true },
    { source: "/investor/shortlist/:path*", destination: "/investor/tersimpan/:path*", permanent: true },
    { source: "/investor/requests/:path*", destination: "/investor/permintaan/:path*", permanent: true },
    { source: "/investor/dossiers/:path*", destination: "/investor/dosir/:path*", permanent: true },
    { source: "/umkm/:old(roadmap|score|gaps)", destination: "/umkm/perjalanan", permanent: true },
    // Dua alamat untuk satu halaman membuat header menampilkan tombol
    // « kembali » ke halaman yang isinya sama persis. Metodologi tetap di
    // /umkm/kesiapan/metodologi; hanya alamat induknya yang dialihkan.
    { source: "/umkm/kesiapan", destination: "/umkm/perjalanan", permanent: true },
    { source: "/umkm/aktivitas", destination: "/umkm", permanent: true },
    { source: "/umkm/ai-copilot", destination: "/umkm/panduan", permanent: true },
    { source: "/umkm/upload", destination: "/umkm/profil/dokumen", permanent: true },
  ],
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
