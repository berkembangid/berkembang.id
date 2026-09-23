import {
  BarChart3, Bell, BookOpen, Building2, Calculator, CalendarDays, FileText, Home, Landmark, Map, Mic, Repeat,
  ShieldCheck, Sparkles, Target, User, Users, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; Icon: LucideIcon; matches?: string[] };

/**
 * Profil naik ke urutan kedua, dan Dokumen tidak lagi berdiri sendiri.
 *
 * Hal pertama yang harus dikerjakan pemilik usaha baru adalah melengkapi
 * profil, dokumen legalitas, dan kondisi awal. Sebelumnya ketiganya tersebar:
 * profil di urutan keenam, dokumen di menu terpisah, dan kondisi awal
 * terselip sebagai tab di dalam Laporan. Sekarang ketiganya satu menu dengan
 * tiga tab, dan menu itu berada tepat setelah Beranda.
 */
export const NAVIGATION: NavItem[] = [
  { label: "Beranda", href: "/umkm", Icon: Home },
  { label: "Profil", href: "/umkm/profil", Icon: User, matches: ["/umkm/profil"] },
  { label: "Catat", href: "/umkm/catat", Icon: Mic },
  { label: "Laporan", href: "/umkm/laporan", Icon: FileText, matches: ["/umkm/laporan", "/umkm/akuntan"] },
  { label: "Perjalanan", href: "/umkm/perjalanan", Icon: Map, matches: ["/umkm/perjalanan", "/umkm/kesiapan"] },
  { label: "Panduan", href: "/umkm/panduan", Icon: Sparkles },
];

/**
 * Menekan « Catat » saat sudah berada di layar Catat.
 *
 * Tautan ke alamat yang sama tidak memasang ulang halamannya, jadi pemilik
 * yang baru menyimpan tetap tertahan di layar « berhasil » padahal jelas
 * ingin mencatat lagi. Menu mengirim peristiwa ini; halaman Catat yang
 * memutuskan apakah aman kembali ke awal (draf yang belum disimpan tidak
 * pernah dibuang diam-diam).
 */
export const CATAT_RESTART_EVENT = "berkembang:catat-baru";

/**
 * Isi menu Laporan.
 *
 * Laporan dulu satu halaman dengan empat tab di atasnya -- deretan kepala
 * yang harus dilewati setiap kali, padahal pemilik biasanya datang untuk satu
 * hal saja. Sekarang menu « Laporan » membuka pilihan ini lebih dulu, dan
 * halamannya hanya menampilkan yang dipilih (`?tab=`).
 *
 * `tab` null berarti tujuan di luar halaman Laporan (`href` dipakai apa adanya).
 */
export type LaporanTab = "bulan-ini" | "utang-piutang" | "kas" | "bank";

export type LaporanSection = {
  tab: LaporanTab | null;
  href: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  tone: "brand" | "success" | "warning" | "neutral";
};

export const LAPORAN_SECTIONS: LaporanSection[] = [
  { tab: "bulan-ini", href: "/umkm/laporan?tab=bulan-ini", label: "Bulan ini", description: "Untung rugi, pengingat, dan ringkasan bulan berjalan", Icon: CalendarDays, tone: "success" },
  { tab: "kas", href: "/umkm/laporan?tab=kas", label: "Buku kas", description: "Setiap uang masuk dan keluar, tutup kas harian", Icon: BookOpen, tone: "brand" },
  { tab: "utang-piutang", href: "/umkm/laporan?tab=utang-piutang", label: "Utang piutang", description: "Siapa yang belum bayar, dan ke siapa Anda berutang", Icon: Users, tone: "warning" },
  { tab: "bank", href: "/umkm/laporan?tab=bank", label: "Untuk bank", description: "Laporan untuk pengajuan pinjaman", Icon: Landmark, tone: "brand" },
  { tab: null, href: "/umkm/akuntan", label: "Mode akuntan", description: "Laporan lengkap untuk dibaca akuntan Anda", Icon: Calculator, tone: "neutral" },
];

export function laporanSectionFor(tab: string | null): LaporanSection {
  return LAPORAN_SECTIONS.find((section) => section.tab !== null && section.tab === tab) ?? LAPORAN_SECTIONS[0];
}

export function isActivePath(pathname: string, item: NavItem) {
  if (item.href === "/umkm") return pathname === "/umkm";
  return (item.matches ?? [item.href]).some((path) => pathname.startsWith(path));
}

/**
 * Nama setiap layar, dan induknya bila ia layar dalam.
 *
 * KENAPA TABEL, BUKAN JUDUL YANG DIAMBIL DARI MENU.
 *
 * Header lama menampilkan label menu yang sedang aktif, dan itu berarti tujuh
 * halaman berbeda semuanya bernama « Perjalanan » atau « Profil ». Pemilik yang
 * membuka Kondisi Awal dari tautan atau dari tombol kembali peramban melihat
 * kata « Profil » dan tidak ada satu pun petunjuk halaman mana yang terbuka.
 *
 * Induknya dicatat karena bilah menu bawah hanya memuat lima tujuan; halaman
 * seperti Dokumen, Kondisi Awal, dan Metodologi tidak ada di sana, jadi tanpa
 * jalan kembali yang disediakan header, satu-satunya jalan keluar dari
 * halaman itu adalah tombol kembali peramban.
 */
export type ScreenHeading = {
  title: string;
  /** Kalimat pendek: apa yang dikerjakan di layar ini. Kosong untuk layar utama. */
  hint?: string;
  parentHref?: string;
  parentLabel?: string;
  Icon: LucideIcon;
};

const SCREENS: Array<{ path: string; exact?: boolean } & ScreenHeading> = [
  { path: "/umkm", exact: true, title: "Beranda", Icon: Home },
  { path: "/umkm/profil/dokumen", title: "Dokumen usaha", hint: "Simpan berkas legalitas usaha", parentHref: "/umkm/profil", parentLabel: "Profil", Icon: FileText },
  { path: "/umkm/profil/kondisi-awal", title: "Kondisi keuangan usaha", hint: "Titik mulai dan posisi hari ini", parentHref: "/umkm/profil", parentLabel: "Profil", Icon: Wallet },
  { path: "/umkm/profil/rekening", title: "Rekening usaha", hint: "Pisahkan uang usaha dari uang rumah", parentHref: "/umkm/profil", parentLabel: "Profil", Icon: Landmark },
  { path: "/umkm/profil/izin", title: "Izin & program", hint: "Siapa yang bisa melihat data usaha", parentHref: "/umkm/profil", parentLabel: "Profil", Icon: ShieldCheck },
  { path: "/umkm/profil", title: "Profil usaha", hint: "Kenali usaha Anda", Icon: Building2 },
  { path: "/umkm/catat/rutin", title: "Catatan rutin", hint: "Sewa, gaji, listrik, cicilan", parentHref: "/umkm/catat", parentLabel: "Catat", Icon: Repeat },
  { path: "/umkm/catat", title: "Catat transaksi", hint: "Uang masuk dan uang keluar", Icon: Mic },
  { path: "/umkm/laporan", title: "Laporan", hint: "Ringkasan uang usaha", Icon: BarChart3 },
  { path: "/umkm/kesiapan/metodologi", title: "Cara kami menghitung", parentHref: "/umkm/perjalanan", parentLabel: "Perjalanan", Icon: Target },
  { path: "/umkm/perjalanan", title: "Perjalanan usaha", hint: "Langkah demi langkah", Icon: Map },
  { path: "/umkm/panduan", title: "Panduan usaha", hint: "Cara memakai dan jawaban singkat", Icon: Sparkles },
  { path: "/umkm/notifikasi", title: "Pemberitahuan", parentHref: "/umkm", parentLabel: "Beranda", Icon: Bell },
  { path: "/umkm/akuntan", title: "Mode akuntan", parentHref: "/umkm/laporan", parentLabel: "Laporan", Icon: BarChart3 },
];

/**
 * Yang lebih dalam menang: `/umkm/profil/dokumen` harus cocok dengan barisnya
 * sendiri, bukan dengan `/umkm/profil` yang juga awalannya. Urutan tabel di
 * atas sudah menaruh yang dalam lebih dulu, dan pencarian berhenti di yang
 * pertama cocok.
 */
export function resolveHeading(pathname: string): ScreenHeading {
  const found = SCREENS.find((screen) =>
    screen.exact ? pathname === screen.path : pathname === screen.path || pathname.startsWith(`${screen.path}/`),
  );
  return found ?? { title: "Ruang usaha", Icon: Home };
}
