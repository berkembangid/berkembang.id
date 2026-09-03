import ReadinessLevelPage from "@/modules/readiness/level-page";

/**
 * Rute lama diarahkan ke halaman yang sama.
 *
 * Dulu `/umkm/score`, `/umkm/gaps`, dan `/umkm/roadmap` menampilkan konsep
 * yang sama dengan tiga angka berbeda. Ketiganya dipertahankan sebagai jalan
 * masuk karena sudah tertaut dari banyak tempat, tetapi isinya kini satu.
 */
export default function GapsPage() {
  return <ReadinessLevelPage />;
}
