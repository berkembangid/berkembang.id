import {
  Bell, Bookmark, Briefcase, Clock3, FolderOpen, ScrollText, Settings2, TrendingUp,
} from "lucide-react";
import type { PortalRoute } from "@/components/shell/portal-navigation";

/**
 * Judul setiap layar portal investor / offtaker.
 *
 * Investor / Offtaker berfokus pada eksplorasi kandidat UMKM yang telah opt-in,
 * peninjauan shortlist usaha, pengajuan ketertarikan (izin akses/kemitraan),
 * dan pemantauan profil usaha yang telah diizinkan.
 */
export const INVESTOR_ROUTES: readonly PortalRoute[] = [
  {
    match: "/investor",
    exact: true,
    title: "Katalog UMKM & Kemitraan",
    hint: "Identitas tersamar sesuai izin pemilik usaha",
    Icon: TrendingUp,
  },
  {
    match: "/investor/shortlist",
    title: "Shortlist Kemitraan",
    hint: "Kandidat usaha potensial yang Anda simpan",
    Icon: Bookmark,
  },
  {
    match: "/investor/requests",
    title: "Pengajuan Minat & Akses",
    hint: "Permintaan mediasi dan izin profil ke admin platform",
    Icon: Clock3,
  },
  {
    match: "/investor/dossiers",
    title: "Profil UMKM Berizin",
    hint: "Dossier lengkap usaha yang telah disetujui",
    Icon: FolderOpen,
  },
  {
    match: "/investor/notifikasi",
    title: "Pemberitahuan",
    hint: "Update pengajuan akses dan persetujuan kemitraan",
    Icon: Bell,
  },
  {
    match: "/investor/organisasi",
    title: "Profil Entitas & Tim",
    hint: "Kelola entitas bisnis, kontak PIC, dan anggota tim",
    Icon: Settings2,
  },
  {
    match: "/investor/audit",
    title: "Log Audit Akses",
    hint: "Riwayat pemeriksaan dan unduhan berkas usaha",
    Icon: ScrollText,
  },
];
