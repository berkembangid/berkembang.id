// Jalur RELATIF, bukan alias `@/`.
//
// Berkas ini juga diimpor `next.config.ts`, dan pemuat konfigurasi Next
// menerjemahkan `@/` menjadi `./` relatif terhadap berkasnya -- bukan terhadap
// akar proyek. Aliasnya bekerja di aplikasi dan gagal saat build, dengan galat
// `Cannot find module './config/supabase-projects.json'` yang tidak menyebut
// aliasnya sama sekali.
import projects from "../../config/supabase-projects.json";

/**
 * Menolak aplikasi berjalan bila `APP_MODE` dan proyek Supabase-nya tidak
 * cocok.
 *
 * KENAPA INI PENJAGA PALING BERNILAI DARI SELURUH PEMISAHAN DEMO/PRODUKSI.
 *
 * Demo dan produksi adalah dua deployment dari repo yang sama, yang bedanya
 * HANYA nilai env. Artinya satu kali salin-tempel membuat `demo.berkembang.id`
 * menulis ke basis data sungguhan -- dan tidak ada satu pun galat yang muncul.
 * Layarnya bekerja, datanya tersimpan, dan yang tersimpan adalah data orang
 * sungguhan di lingkungan yang ditunjukkan ke orang luar.
 *
 * Tanpa penjaga ini, `APP_MODE` hanya catatan: tidak ada kode yang membacanya,
 * jadi salah mengisinya tidak berakibat apa pun sampai akibatnya sudah terjadi.
 *
 * GAGAL SAAT DINYALAKAN, BUKAN SAAT DIPAKAI.
 *
 * Dipanggil dari `instrumentation.ts`, yang berjalan sekali ketika server
 * dinyalakan -- termasuk saat `next build`. Deployment yang env-nya salah
 * berhenti sebelum melayani satu permintaan pun, dan build yang tidak
 * menyebutkan lingkungannya berhenti sebelum menjadi deployment.
 */

type Target = { ref: string; label: string };

const TARGETS = projects.targets as Record<string, Target>;

export type AppMode = keyof typeof projects.targets;

/** Ref proyek dari sebuah alamat Supabase: `https://<ref>.supabase.co`. */
function refFromUrl(url: string): string | null {
  return /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url.trim())?.[1] ?? null;
}

function daftarModeSah() {
  return Object.keys(TARGETS).join(" atau ");
}

/**
 * Memeriksa pasangan mode dan proyek. Melempar bila tidak cocok.
 *
 * Menerima nilainya sebagai argumen alih-alih membaca `process.env` sendiri,
 * supaya ia bisa diuji tanpa mengubah lingkungan proses -- uji yang menyetel
 * env global akan bocor ke uji lain yang berjalan setelahnya.
 */
export function assertAppModeMatchesProject(
  mode: string | undefined,
  supabaseUrl: string | undefined,
): { mode: AppMode; ref: string; label: string } {
  const trimmedMode = (mode ?? "").trim();
  if (!trimmedMode) {
    throw new Error(
      `APP_MODE belum diisi. Setel ${daftarModeSah()} di berkas lingkungan ini ` +
        "supaya aplikasi bisa menyebutkan lingkungan mana yang sedang berjalan.",
    );
  }

  const target = TARGETS[trimmedMode];
  if (!target) {
    throw new Error(`APP_MODE="${trimmedMode}" tidak dikenali. Yang sah: ${daftarModeSah()}.`);
  }

  const url = (supabaseUrl ?? "").trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL belum diisi, jadi lingkungannya tidak bisa dipastikan.");
  }

  const ref = refFromUrl(url);
  if (!ref) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL tidak berbentuk https://<ref>.supabase.co, " +
        "jadi proyek mana yang dituju tidak bisa dibaca.",
    );
  }

  if (ref !== target.ref) {
    // Pesannya menyebutkan KEDUANYA dan menamai lingkungan yang sebenarnya
    // dituju, karena kesalahan ini hampir selalu salin-tempel: orang menyalin
    // satu nilai dan lupa yang lain, lalu membaca "tidak cocok" tanpa tahu
    // mana yang salah.
    const sebenarnya = Object.entries(TARGETS).find(([, item]) => item.ref === ref);
    throw new Error(
      `APP_MODE="${trimmedMode}" (${target.label}) tetapi NEXT_PUBLIC_SUPABASE_URL menunjuk proyek ` +
        `${ref}` +
        (sebenarnya ? `, yaitu ${sebenarnya[1].label}` : " yang tidak ada di config/supabase-projects.json") +
        ". Menolak berjalan: salah satu dari keduanya harus dibetulkan lebih dulu.",
    );
  }

  return { mode: trimmedMode as AppMode, ref, label: target.label };
}

/** Bentuk yang dipakai saat dijalankan: membaca lingkungan proses. */
export function assertAppModeFromEnv() {
  return assertAppModeMatchesProject(process.env.APP_MODE, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Apakah deployment ini demo. Dipakai layar untuk menandainya. */
export function isDemoMode() {
  return (process.env.APP_MODE ?? "").trim() === "demo";
}
