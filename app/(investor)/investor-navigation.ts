import {
  Bell, Bookmark, Clock3, FolderOpen, ScrollText, Settings2, TrendingUp,
} from "lucide-react";
import type { PortalNavItem, PortalRoute } from "@/components/shell/portal-navigation";

/**
 * Menu dan judul layar portal investor / offtaker.
 *
 * Judul di sini, label menu, dan judul halaman di bawah header harus menyebut
 * hal yang sama dengan kata yang sama. Dulu satu layar punya tiga nama --
 * "Pengajuan Minat" di menu, "Pengajuan Minat & Akses" di header, dan
 * "Permintaan akses" di halaman -- dan orang tidak yakin ketiganya satu layar.
 * Huruf kapitalnya mengikuti portal lembaga: hanya di awal kalimat.
 */
export const INVESTOR_NAV: readonly PortalNavItem[] = [
  { href: "/investor", label: "Katalog UMKM", Icon: TrendingUp },
  { href: "/investor/tersimpan", label: "Tersimpan", Icon: Bookmark },
  { href: "/investor/permintaan", label: "Pengajuan minat", Icon: Clock3 },
  { href: "/investor/dosir", label: "Profil berizin", Icon: FolderOpen },
  { href: "/investor/notifikasi", label: "Notifikasi", Icon: Bell, opensNotifications: true },
  { href: "/investor/organisasi", label: "Entitas & tim", Icon: Settings2 },
  { href: "/investor/audit", label: "Log audit", Icon: ScrollText },
];

export const INVESTOR_ROUTES: readonly PortalRoute[] = [
  {
    match: "/investor",
    exact: true,
    title: "Katalog UMKM",
    hint: "Identitas tersamar sampai pemilik usaha setuju",
    Icon: TrendingUp,
  },
  {
    match: "/investor/tersimpan",
    title: "Kandidat tersimpan",
    hint: "Usaha yang Anda simpan untuk ditinjau kembali",
    Icon: Bookmark,
  },
  {
    match: "/investor/permintaan",
    title: "Pengajuan minat",
    hint: "Menunggu tinjauan admin platform",
    Icon: Clock3,
  },
  {
    match: "/investor/dosir",
    title: "Profil berizin",
    hint: "Hanya yang izinnya masih berlaku",
    Icon: FolderOpen,
  },
  {
    match: "/investor/notifikasi",
    title: "Pemberitahuan",
    Icon: Bell,
  },
  {
    match: "/investor/organisasi",
    title: "Entitas & tim",
    hint: "Profil entitas dan anggota tim",
    Icon: Settings2,
  },
  {
    match: "/investor/audit",
    title: "Log audit",
    hint: "Setiap pembukaan dan unduhan tercatat",
    Icon: ScrollText,
  },
];
