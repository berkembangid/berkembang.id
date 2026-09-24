import {
  Bell, Bookmark, Clock3, FolderOpen, LayoutDashboard, LayoutGrid, Map, Megaphone, ScrollText, Settings2,
  TrendingUp,
} from "lucide-react";
import type { PortalNavItem, PortalRoute } from "@/components/shell/portal-navigation";

/**
 * Menu samping portal lembaga. Judul layarnya di `LEMBAGA_ROUTES` di bawah.
 *
 * Kelompoknya mengikuti urutan kerja: cari usaha, minta izin membuka
 * profilnya, dampingi lewat program, lalu urusan organisasi sendiri.
 */
export const LEMBAGA_NAV: readonly PortalNavItem[] = [
  { group: "Ringkasan", href: "/lembaga/analitik", label: "Dashboard", Icon: LayoutDashboard },
  { group: "Cari UMKM", href: "/lembaga", label: "Temukan", Icon: TrendingUp },
  { group: "Cari UMKM", href: "/lembaga/wilayah", label: "Ringkasan wilayah", Icon: Map, requiresRegionWide: true },
  { group: "Cari UMKM", href: "/lembaga/tersimpan", label: "Tersimpan", Icon: Bookmark },
  { group: "Akses data", href: "/lembaga/permintaan", label: "Permintaan", Icon: Clock3 },
  { group: "Akses data", href: "/lembaga/dosir", label: "Profil berizin", Icon: FolderOpen },
  { group: "Pendampingan", href: "/lembaga/program", label: "Program", Icon: LayoutGrid },
  { group: "Pendampingan", href: "/lembaga/siaran", label: "Siaran", Icon: Megaphone, requiresRegionWide: true },
  { group: "Organisasi", href: "/lembaga/organisasi", label: "Organisasi & anggota", Icon: Settings2 },
  { group: "Organisasi", href: "/lembaga/audit", label: "Log audit", Icon: ScrollText },
];

/**
 * Judul setiap layar portal lembaga.
 *
 * Bacalah `hint`-nya sebagai jawaban atas "apa yang saya lihat di sini". Portal
 * ini bekerja dengan data orang lain yang dibuka atas izin, dan setiap layar
 * punya batasnya sendiri: Temukan tidak pernah menyebut nama, Profil berizin
 * menyebutnya. Batas itu perlu terbaca dari headernya, bukan disimpulkan dari
 * isi layarnya.
 */
export const LEMBAGA_ROUTES: readonly PortalRoute[] = [
  {
    match: "/lembaga",
    exact: true,
    title: "Temukan kandidat",
    hint: "Tanpa nama, sampai pemiliknya memberi izin",
    Icon: TrendingUp,
  },
  {
    match: "/lembaga/wilayah",
    title: "Ringkasan wilayah",
    hint: "Jumlah usaha per keadaan, tanpa nama dan tanpa rupiah",
    Icon: Map,
  },
  {
    match: "/lembaga/siaran",
    title: "Siaran pendampingan",
    hint: "Nama peserta muncul setelah mereka menekan ikut",
    Icon: Megaphone,
  },
  {
    match: "/lembaga/tersimpan",
    title: "Kandidat tersimpan",
    hint: "Kandidat yang Anda simpan untuk ditinjau kembali",
    Icon: Bookmark,
  },
  {
    match: "/lembaga/permintaan",
    title: "Permintaan akses",
    hint: "Menunggu keputusan admin platform",
    Icon: Clock3,
  },
  {
    match: "/lembaga/dosir",
    title: "Profil berizin",
    hint: "Hanya yang izinnya masih berlaku",
    Icon: FolderOpen,
  },
  { match: "/lembaga/program", title: "Program pembinaan", Icon: LayoutGrid },
  {
    match: "/lembaga/analitik",
    title: "Dashboard",
    hint: "Ringkasan permintaan, izin, dan program — tanpa angka rupiah per usaha",
    Icon: LayoutDashboard,
  },
  { match: "/lembaga/notifikasi", title: "Pemberitahuan", Icon: Bell },
  { match: "/lembaga/organisasi", title: "Organisasi & anggota", Icon: Settings2 },
  {
    match: "/lembaga/audit",
    title: "Log audit",
    hint: "Setiap pembukaan dan unduhan tercatat",
    Icon: ScrollText,
  },
];
