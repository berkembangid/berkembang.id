import ReadinessLevelPage from "@/modules/readiness/level-page";

/**
 * Perjalanan usaha: satu halaman untuk tingkat kesiapan.
 *
 * Dulu `/umkm/score`, `/umkm/gaps`, dan `/umkm/roadmap` menampilkan konsep
 * yang sama dengan tiga angka berbeda. Ketiganya kini dialihkan ke sini oleh
 * `redirects` di `next.config.ts`, supaya penanda lama tetap sampai.
 */
export default function PerjalananPage() {
  return <ReadinessLevelPage />;
}
