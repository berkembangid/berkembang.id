import {
  BarChart2, BookOpen, Building2, FileCheck, Gauge, Handshake, History, LayoutDashboard,
  MonitorPlay, ShieldCheck, Sliders, ToggleLeft, Users,
} from "lucide-react";
import type { PortalRoute } from "@/components/shell/portal-navigation";

/**
 * Judul setiap layar portal admin.
 *
 * Tiga baris "detail" di bawah memakai awalan bergaris miring penutup
 * (`/admin/umkm/`), dan itu yang membuatnya tidak bertabrakan dengan daftarnya:
 * `/admin/umkm` tidak berawalan `/admin/umkm/`, sementara `/admin/umkm/abc`
 * berawalan keduanya -- dan yang paling panjang menang. Tanpa garis miring itu,
 * daftar dan detail akan sama-sama cocok dengan panjang yang sama.
 */
export const ADMIN_ROUTES: readonly PortalRoute[] = [
  { match: "/admin", exact: true, title: "Ringkasan", Icon: LayoutDashboard },
  { match: "/admin/analytics", title: "Analitik", Icon: BarChart2 },
  {
    match: "/admin/mesin",
    title: "Ruang Mesin",
    hint: "Kesehatan sistem, kualitas AI, dan biaya",
    Icon: Gauge,
  },

  { match: "/admin/umkm", title: "Daftar UMKM", hint: "Metadata saja, tanpa isi keuangan", Icon: Users },
  {
    match: "/admin/umkm/",
    title: "Detail UMKM",
    parent: { href: "/admin/umkm", label: "Daftar UMKM" },
    Icon: Users,
  },

  { match: "/admin/institutions", title: "Daftar lembaga", Icon: Building2 },
  {
    match: "/admin/institutions/",
    title: "Detail lembaga",
    parent: { href: "/admin/institutions", label: "Daftar lembaga" },
    Icon: Building2,
  },

  { match: "/admin/mitra", title: "Mitra komunitas", Icon: Handshake },
  {
    match: "/admin/mitra/",
    title: "Detail mitra",
    parent: { href: "/admin/mitra", label: "Mitra komunitas" },
    Icon: Handshake,
  },

  {
    match: "/admin/profile-access",
    title: "Permintaan akses profil",
    hint: "Tinjau sebelum identitas UMKM dibuka",
    Icon: FileCheck,
  },
  { match: "/admin/rules", title: "Aturan sistem", Icon: Sliders },
  {
    match: "/admin/flags",
    title: "Sakelar fitur",
    hint: "Mematikan cukup OPS, menyalakan menuntut SUPER_ADMIN",
    Icon: ToggleLeft,
  },
  {
    match: "/admin/demo",
    title: "Akun demo",
    hint: "Dikeluarkan dari seluruh angka Ruang Mesin",
    Icon: MonitorPlay,
  },
  { match: "/admin/admins", title: "Kelola admin", Icon: ShieldCheck },
  {
    match: "/admin/audit",
    title: "Riwayat audit",
    hint: "Hanya bertambah, tidak pernah berubah",
    Icon: History,
  },
  { match: "/admin/panduan", title: "Panduan Ruang Mesin", Icon: BookOpen },
];
