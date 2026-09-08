import {
  BarChart2, Bell, Bookmark, Clock3, FolderOpen, LayoutGrid, ScrollText, Settings2, TrendingUp,
} from "lucide-react";
import type { PortalRoute } from "@/components/shell/portal-navigation";

/**
 * Judul setiap layar portal lembaga.
 *
 * Bacalah `hint`-nya sebagai jawaban atas "apa yang saya lihat di sini". Portal
 * ini bekerja dengan data orang lain yang dibuka atas izin, dan setiap layar
 * punya batasnya sendiri: Temukan tidak pernah menyebut nama, Profil berizin
 * menyebutnya. Batas itu perlu terbaca dari headernya, bukan disimpulkan dari
 * isi layarnya.
 */
export const INSTITUSI_ROUTES: readonly PortalRoute[] = [
  {
    match: "/institusi",
    exact: true,
    title: "Temukan kandidat",
    hint: "Tanpa nama, sampai pemiliknya memberi izin",
    Icon: TrendingUp,
  },
  {
    match: "/institusi/shortlist",
    title: "Shortlist saya",
    hint: "Kandidat yang Anda simpan untuk ditinjau kembali",
    Icon: Bookmark,
  },
  {
    match: "/institusi/requests",
    title: "Permintaan akses",
    hint: "Menunggu keputusan admin platform",
    Icon: Clock3,
  },
  {
    match: "/institusi/dossiers",
    title: "Profil berizin",
    hint: "Hanya yang izinnya masih berlaku",
    Icon: FolderOpen,
  },
  { match: "/institusi/program", title: "Program pembinaan", Icon: LayoutGrid },
  {
    match: "/institusi/analytics",
    title: "Analitik program",
    hint: "Agregat peserta, tanpa angka rupiah per usaha",
    parent: { href: "/institusi/program", label: "Program pembinaan" },
    Icon: BarChart2,
  },
  { match: "/institusi/notifikasi", title: "Pemberitahuan", Icon: Bell },
  { match: "/institusi/organisasi", title: "Organisasi & anggota", Icon: Settings2 },
  {
    match: "/institusi/audit",
    title: "Log audit",
    hint: "Setiap pembukaan dan unduhan tercatat",
    Icon: ScrollText,
  },
];
