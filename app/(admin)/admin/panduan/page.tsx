import Link from "next/link";
import {
  ArrowRight, BookOpen, FileCheck, Gauge, History, MonitorPlay, ShieldCheck, ToggleLeft,
} from "lucide-react";
import { DashboardPanel, PageHeader } from "@/components/dashboard";

/**
 * Panduan Ruang Mesin — pasangan dari "Panduan usaha" di sisi UMKM.
 *
 * Bentuknya sengaja sama persis: pilih tujuan, langsung dibawa ke layarnya.
 * Yang berbeda hanya wadahnya. `DashboardPage` tidak dipakai di sini karena
 * cangkang admin sudah membungkus isinya dengan `<main>`-nya sendiri, dan
 * `<main>` di dalam `<main>` bukan hanya markah yang salah -- paddingnya
 * berlipat dan halamannya terlihat menyempit tanpa sebab.
 *
 * Bagian kedua halaman ini bukan tautan, melainkan ATURAN MAIN. Empat hal di
 * bawah itu tertulis panjang lebar di kepala migrasi `0069`-`0073`, dan tidak
 * ada satu pun admin baru yang akan membacanya di sana. Aturan yang hanya
 * hidup di komentar SQL adalah aturan yang akan dilanggar dengan itikad baik.
 */
const goals = [
  {
    title: "Periksa mesin pagi ini",
    description: "Enam lampu dalam satu baris: kegagalan AI, antrean, dan nominal dari model yang harus nol.",
    href: "/admin/mesin",
    icon: Gauge,
    action: "Buka Ruang Mesin",
  },
  {
    title: "Matikan fitur yang bermasalah",
    description: "Pemutus arus per fitur. Layar pemilik usaha berpindah sendiri ke cara lain, tanpa pesan galat.",
    href: "/admin/flags",
    icon: ToggleLeft,
    action: "Buka sakelar",
  },
  {
    title: "Siapkan akun peraga",
    description: "Tandai usaha yang dipakai untuk pertunjukan supaya angkanya tidak ikut terhitung.",
    href: "/admin/demo",
    icon: MonitorPlay,
    action: "Kelola akun demo",
  },
  {
    title: "Atur siapa boleh apa",
    description: "Undang admin, cabut akses, dan tentukan perannya. Selalu butuh SUPER_ADMIN kedua.",
    href: "/admin/admins",
    icon: ShieldCheck,
    action: "Kelola admin",
  },
  {
    title: "Tinjau permintaan lembaga",
    description: "Putuskan pembukaan identitas dan kontak UMKM sebelum lembaga bisa melihatnya.",
    href: "/admin/profile-access",
    icon: FileCheck,
    action: "Lihat permintaan",
  },
  {
    title: "Telusuri yang pernah dilakukan",
    description: "Setiap tindakan tulis beserta alasannya, urut waktu, tidak bisa dihapus siapa pun.",
    href: "/admin/audit",
    icon: History,
    action: "Buka riwayat",
  },
];

const rules = [
  {
    title: "Setiap tindakan tulis wajib beralasan",
    body: "Alasannya tersimpan bersama tindakannya dalam satu transaksi. Kalau catatannya gagal ditulis, tindakannya tidak jadi terjadi — dan catatan yang sudah ada tidak bisa diubah maupun dihapus oleh siapa pun, termasuk peran layanan.",
  },
  {
    title: "Menghentikan lebih mudah daripada memulihkan",
    body: "Mematikan sakelar dan membekukan akun cukup peran OPS; menyalakan kembali dan membuka bekuan menuntut SUPER_ADMIN. Sesuatu yang mencurigakan harus bisa dihentikan cepat oleh siapa pun yang sedang berjaga; mengembalikannya adalah keputusan yang bisa ditunggu.",
  },
  {
    title: "Menandai akun demo mengeluarkannya dari semua angka",
    body: "Berguna untuk pertunjukan, berbahaya kalau tersalah pasang: usaha sungguhan yang tertandai akan lenyap dari dasbor tanpa ada yang mencarinya. Karena itu penandaannya menuntut SUPER_ADMIN.",
  },
  {
    title: "Admin tidak pernah mengubah catatan keuangan UMKM",
    body: "Tidak ada satu pun tombol di portal ini yang menyentuh catatan transaksi. Perbaikan data hanya lewat jalur resmi yang dipakai pemiliknya sendiri, dan isi keuangannya hanya terbuka lewat tiket dukungan 30 menit yang tercatat dan terlihat oleh pemilik usahanya.",
  },
];

export default function PanduanRuangMesinPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Panduan Ruang Mesin"
        description="Pilih tujuan Anda. Kami akan membawa Anda langsung ke layar yang tepat."
        icon={BookOpen}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => (
          <DashboardPanel
            key={goal.href}
            className="group p-5 transition-[border-color,box-shadow] hover:border-[#addcf4] hover:shadow-[0_12px_34px_rgba(21,144,199,.08)]"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]">
              <goal.icon size={19} />
            </span>
            <h2 className="mt-4 text-sm font-bold text-[#1b2a3a]">{goal.title}</h2>
            <p className="mt-1 min-h-10 text-xs leading-relaxed text-[#6e859e]">{goal.description}</p>
            <Link href={goal.href} className="mt-5 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-[#0b5f86]">
              {goal.action}
              <ArrowRight size={14} />
            </Link>
          </DashboardPanel>
        ))}
      </div>

      <section aria-labelledby="aturan-main" className="space-y-3">
        <div>
          <h2 id="aturan-main" className="text-sm font-bold text-[#1b2a3a]">Aturan main</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6e859e]">
            Empat hal yang tidak terlihat dari tombolnya, dan sebaiknya dibaca sebelum menekan yang pertama.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {rules.map((rule) => (
            <DashboardPanel key={rule.title} className="p-5">
              <h3 className="text-xs font-bold text-[#1b2a3a]">{rule.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#6e859e]">{rule.body}</p>
            </DashboardPanel>
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] leading-relaxed text-[#6e859e]">
        Ruang Mesin memperlihatkan keadaan sistem, bukan isi catatan siapa pun.
      </p>
    </div>
  );
}
