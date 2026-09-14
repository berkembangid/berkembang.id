/**
 * Yang harus benar sebelum server ini melayani satu permintaan pun.
 *
 * `register()` dijalankan Next sekali ketika proses server dinyalakan, dan
 * harus selesai sebelum server melayani permintaan pertama. Ia TIDAK berjalan
 * saat `next build` -- itu sebabnya pemeriksaan yang sama juga dipanggil dari
 * `next.config.ts`, yang memang berjalan saat build.
 *
 * Keduanya memeriksa pasangan yang berbeda, dan itu bukan pengulangan:
 * `NEXT_PUBLIC_SUPABASE_URL` ditanam ke bundel saat build, sementara
 * `APP_MODE` dibaca saat berjalan. Pasangan yang cocok waktu build bisa
 * menjadi tidak cocok waktu dijalankan -- misalnya `APP_MODE` diubah di
 * setelan Vercel tanpa deploy ulang. Pemeriksaan inilah yang menangkapnya.
 *
 * Kenapa bukan di `proxy.ts`: proxy berjalan pada setiap permintaan, jadi
 * pemeriksaan yang sama akan diulang ribuan kali untuk menjawab pertanyaan
 * yang jawabannya tidak pernah berubah selama proses hidup. Dan kegagalannya
 * akan muncul sebagai galat per permintaan, bukan sebagai deployment yang
 * memang tidak boleh naik.
 */
export async function register() {
  const { assertAppModeFromEnv } = await import("@/lib/env/app-mode");
  const { label, ref } = assertAppModeFromEnv();
  // Dicetak supaya log deployment menyebutkan lingkungan mana yang naik.
  // Tanpa satu baris ini, "deployment mana yang menunjuk proyek mana" hanya
  // bisa dijawab dengan membuka setelan env di dashboard.
  console.info(`[berkembang.id] lingkungan ${label}, proyek Supabase ${ref}`);
}
