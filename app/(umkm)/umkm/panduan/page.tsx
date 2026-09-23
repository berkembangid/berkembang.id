import Link from "next/link";
import { ArrowRight, BarChart3, FileCheck2, Mic, Route, Sparkles } from "lucide-react";
import { DashboardPage, DashboardPanel, PageHeader } from "@/components/dashboard";

const guides = [
  { title: "Catat transaksi", description: "Gunakan suara atau tulisan, lalu periksa hasil sebelum menyimpan.", href: "/umkm/catat", icon: Mic, action: "Mulai mencatat" },
  { title: "Pahami kondisi kas", description: "Bandingkan uang masuk, biaya, dan selisih pada periode yang Anda pilih.", href: "/umkm/laporan", icon: BarChart3, action: "Buka laporan" },
  { title: "Lengkapi dokumen", description: "Lihat dokumen yang tersedia dan bagian yang masih perlu dilengkapi.", href: "/umkm/profil/dokumen", icon: FileCheck2, action: "Periksa dokumen" },
  { title: "Tentukan langkah berikutnya", description: "Ikuti rekomendasi yang dibuat dari bukti usaha yang sudah tercatat.", href: "/umkm/perjalanan", icon: Route, action: "Lihat perjalanan" },
];

export default function PanduanUsahaPage() {
  return (
    <DashboardPage>
      <PageHeader title="Panduan usaha" description="Pilih tujuan Anda. Kami akan membawa Anda langsung ke fitur yang tepat." icon={Sparkles} />
      <div className="grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => (
          <DashboardPanel key={guide.href} className="group p-5 transition-[border-color,box-shadow] hover:border-umkm-brand-line hover:shadow-[0_12px_34px_rgba(21,144,199,.08)]">
            <span className="grid size-11 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand-hover"><guide.icon size={19} /></span>
            <h2 className="mt-4 text-sm font-bold text-umkm-ink">{guide.title}</h2>
            <p className="mt-1 min-h-11 text-xs leading-relaxed text-umkm-subtle">{guide.description}</p>
            <Link href={guide.href} className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-umkm-brand">{guide.action}<ArrowRight size={14} /></Link>
          </DashboardPanel>
        ))}
      </div>
      <p className="text-center text-xs leading-relaxed text-umkm-subtle">Rekomendasi membantu Anda menavigasi data, bukan menggantikan keputusan usaha Anda.</p>
    </DashboardPage>
  );
}
