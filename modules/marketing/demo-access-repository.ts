import "server-only";

/**
 * Akun demo, dan catatan siapa yang memintanya.
 *
 * DAFTAR AKUNNYA PINDAH KE SINI, DAN ITU BUKAN SEKADAR RAPI-RAPI.
 *
 * Sebelumnya ketiga akun dan sandinya ditulis di dalam `bio/page.tsx`, jadi
 * mereka ikut terkirim di HTML halaman itu — terbaca siapa pun yang membuka
 * "view source", formulir atau tidak. Memasang formulir di depan teks yang
 * sudah ada di sumber halaman bukan pencatatan minat, melainkan hiasan.
 *
 * Sekarang halaman publiknya tidak lagi memuat satu pun akun. Route
 * `POST /api/v1/demo-access` yang mengirimkannya, setelah namanya tercatat.
 *
 * Sekali lagi: ini BUKAN penjaga pintu. Siapa pun boleh mengetik nama karangan
 * dan tetap mendapat akunnya, dan itu memang disengaja — lingkungan demo
 * berisi usaha karangan di basis data terpisah. Yang dikejar hanya nama orang
 * yang bersedia meninggalkannya.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import type {
  DemoAccessPayload,
  DemoAccessRequest,
} from "@/modules/marketing/demo-access-schema";

/** Satu sandi untuk seluruh persona demo — seeder memakai satu `DEMO_PASSWORD`. */
const SANDI_DEMO = "Demo-Berkembang-2026";

/**
 * Tiga akun, karena ada TIGA portal -- bukan lima, walau personanya lima.
 *
 * Seeder demo membuat lima: UMKM, koperasi, bank, CVC, dan dinas. Tapi
 * koperasi, bank, dan dinas mendarat di portal lembaga yang sama persis,
 * dengan menu yang sama persis; yang berbeda hanya keadaan datanya. Memajang
 * ketiganya berarti tiga baris yang mengantar ke layar yang sama, dan orang
 * yang mencobanya akan mengira ia salah menekan.
 *
 * NAMA PERSONANYA KARANGAN, DAN HARUS TETAP BEGITU.
 *
 * Nama lembaga yang menyerupai perusahaan sungguhan membuat halaman publik ini
 * seolah menyebut mereka sebagai pengguna. Persona investor karena itu bernama
 * umum, bukan nama satu perusahaan modal ventura mana pun.
 */
const AKUN_DEMO = [
  {
    peran: "Pemilik usaha",
    lembaga: "Dapur Bu Nita",
    lihat: "Catat lewat suara, lihat untung dan kesiapan usaha",
    email: "demo.umkm@berkembang.id",
  },
  {
    peran: "Dinas / lembaga",
    lembaga: "Dinas Koperasi & UKM Kota Depok",
    lihat: "Kandidat tersamar, program, dan analitik wilayah",
    email: "demo.dinas@berkembang.id",
  },
  {
    peran: "Investor",
    lembaga: "Ventura Mitra Usaha",
    lihat: "Katalog UMKM, kemitraan, dan pengajuan minat",
    email: "demo.cvc@berkembang.id",
  },
] as const;

export function demoAccessPayload(): DemoAccessPayload {
  return { sandi: SANDI_DEMO, akun: AKUN_DEMO.map((akun) => ({ ...akun })) };
}

/**
 * Mencatat satu peminat.
 *
 * Gagal mencatat TIDAK menahan akunnya. Orang yang sudah mengetik namanya di
 * depan poster tidak pantas dihukum karena basis data kita sedang bermasalah;
 * yang hilang dalam kasus itu cuma satu baris statistik kita sendiri. Karena
 * itu galatnya dicatat ke log lalu ditelan, dan pemanggilnya tetap menyajikan
 * akun demonya.
 */
export async function recordDemoAccessRequest(
  request: DemoAccessRequest,
  jejak: { referrer: string | null; userAgent: string | null },
): Promise<{ tercatat: boolean }> {
  try {
    const admin = createServiceRoleClient();
    // Tabelnya lahir di `0102` dan belum tentu ada di basis data yang belum
    // dimigrasi, jadi tipenya belum masuk `database.generated.ts`.
    const { error } = await admin.from("demo_access_requests" as never).insert({
      name: request.name,
      email: request.email,
      referrer: jejak.referrer,
      user_agent: jejak.userAgent,
    } as never);
    if (error) {
      console.error("[demo-access] gagal mencatat peminat:", error.message);
      return { tercatat: false };
    }
    return { tercatat: true };
  } catch (error) {
    console.error("[demo-access] gagal mencatat peminat:", error);
    return { tercatat: false };
  }
}
