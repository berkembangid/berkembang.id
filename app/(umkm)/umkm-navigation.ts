import {
  BarChart3, Bell, Building2, FileText, Home, Map, Mic, Receipt,
  Sparkles, Target, User, Wallet,
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
  { label: "Profil", href: "/umkm/profil", Icon: User, matches: ["/umkm/profil", "/umkm/upload"] },
  { label: "Catat", href: "/umkm/catat", Icon: Mic },
  { label: "Laporan", href: "/umkm/laporan", Icon: FileText },
  { label: "Perjalanan", href: "/umkm/roadmap", Icon: Map, matches: ["/umkm/roadmap", "/umkm/score", "/umkm/gaps", "/umkm/kesiapan"] },
  { label: "Panduan", href: "/umkm/ai-copilot", Icon: Sparkles },
];

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
  { path: "/umkm/profil/kondisi-awal", title: "Kondisi awal keuangan", hint: "Titik mulai pembukuan usaha", parentHref: "/umkm/profil", parentLabel: "Profil", Icon: Wallet },
  { path: "/umkm/profil", title: "Profil usaha", hint: "Kenali usaha Anda", Icon: Building2 },
  { path: "/umkm/catat", title: "Catat transaksi", hint: "Uang masuk dan uang keluar", Icon: Mic },
  { path: "/umkm/laporan", title: "Buku kas & laporan", hint: "Ringkasan uang usaha", Icon: BarChart3 },
  { path: "/umkm/kesiapan/metodologi", title: "Cara kami menghitung", parentHref: "/umkm/kesiapan", parentLabel: "Kesiapan", Icon: Target },
  { path: "/umkm/kesiapan", title: "Kesiapan usaha", parentHref: "/umkm/roadmap", parentLabel: "Perjalanan", Icon: Target },
  { path: "/umkm/score", title: "Nilai kesiapan", parentHref: "/umkm/roadmap", parentLabel: "Perjalanan", Icon: Target },
  { path: "/umkm/gaps", title: "Yang masih kurang", parentHref: "/umkm/roadmap", parentLabel: "Perjalanan", Icon: Target },
  { path: "/umkm/roadmap", title: "Perjalanan usaha", hint: "Langkah demi langkah", Icon: Map },
  { path: "/umkm/ai-copilot", title: "Panduan usaha", hint: "Tanya apa saja soal usaha", Icon: Sparkles },
  { path: "/umkm/notifikasi", title: "Pemberitahuan", parentHref: "/umkm", parentLabel: "Beranda", Icon: Bell },
  { path: "/umkm/aktivitas", title: "Aktivitas", parentHref: "/umkm", parentLabel: "Beranda", Icon: Receipt },
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
