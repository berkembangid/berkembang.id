import {
  BarChart2, Bell, Bookmark, Clock3, FolderOpen, LayoutGrid, Map, Megaphone, ScrollText, Settings2,
  TrendingUp,
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
    title: "Analitik program",
    hint: "Agregat peserta, tanpa angka rupiah per usaha",
    parent: { href: "/lembaga/program", label: "Program pembinaan" },
    Icon: BarChart2,
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
