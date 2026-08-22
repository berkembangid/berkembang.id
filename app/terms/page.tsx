import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck, Lock, FileText, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Syarat & Ketentuan | Berkembang.id",
  description: "Syarat dan Ketentuan serta Kebijakan Perlindungan Privasi Data Pengguna Berkembang.id",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo/logo berkembang.webp"
              alt="Berkembang.id"
              width={140}
              height={36}
              className="h-8 w-auto object-contain"
            />
          </Link>
          <Link
            href="/auth/register"
            className="text-xs font-bold text-[#001b85] hover:text-[#08299f] flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Kembali ke Pendaftaran
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#001b85] text-xs font-bold mb-3">
            <ShieldCheck size={14} /> Perlindungan Privasi &amp; Data
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-[#141a34]">
            Syarat &amp; Ketentuan Layanan
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Terakhir diperbarui: Februari 2025 · Berlaku untuk seluruh pengguna platform Berkembang.id
          </p>
        </div>

        {/* Highlight Commitment Box */}
        <div className="bg-gradient-to-r from-[#001b85] to-[#02a8d0] text-white p-6 rounded-2xl shadow-md space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-cyan-200">
            <Lock size={18} /> KOMITMEN PERLINDUNGAN PRIVASI DATA PENGGUNA
          </div>
          <p className="text-sm md:text-base leading-relaxed font-medium text-white/95">
            “Data yang dikumpulkan akan digunakan semata-mata untuk mendukung operasional, pengembangan, dan peningkatan layanan website. Kami tidak menjual, menyewakan, atau memperdagangkan data pengguna kepada pihak ketiga.”
          </p>
        </div>

        {/* Terms Sections */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6 text-sm text-slate-700 leading-relaxed shadow-sm">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[#001b85]" /> 1. Pengumpulan dan Penggunaan Data
            </h2>
            <p>
              Platform Berkembang.id mengumpulkan informasi profil usaha, pencatatan transaksi keuangan, dan dokumen pendukung yang Anda berikan secara sukarela. Informasi ini semata-mata diolah untuk:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 pl-2">
              <li>Menyediakan kalkulasi skor kesiapan dan rekomendasi perkembangan usaha (AI Copilot &amp; Analisis Kesiapan).</li>
              <li>Memfasilitasi pembuatan laporan arus kas, pembukuan, serta visualisasi data keuangan.</li>
              <li>Mendukung operasional, evaluasi teknis, dan peningkatan kualitas fitur layanan website.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[#001b85]" /> 2. Larangan Komersialisasi &amp; Penjualan Data
            </h2>
            <p>
              Kami menjamin bahwa data pribadi dan data transaksi bisnis Anda tidak akan pernah dijual, disewakan, dibagikan tanpa izin, atau diperdagangkan kepada pihak ketiga manapun untuk tujuan periklanan atau komersial di luar ekosistem resmi platform.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[#001b85]" /> 3. Keamanan Informasi
            </h2>
            <p>
              Kami menerapkan standar keamanan enkripsi berlapis dan protokol otentikasi ketat untuk menjaga integritas dan kerahasiaan data Anda dari akses yang tidak sah.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[#001b85]" /> 4. Hak dan Kendali Pengguna
            </h2>
            <p>
              Pengguna berhak untuk memperbarui, mengubah, maupun menghapus data usaha dan dokumen yang tersimpan di dalam akun masing-masing melalui menu pengelolaan profil yang tersedia.
            </p>
          </section>
        </div>

        {/* Back button */}
        <div className="text-center pt-4">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#001b85] text-white font-bold text-sm hover:bg-[#08299f] transition-all shadow-md"
          >
            <ArrowLeft size={16} /> Kembali &amp; Lanjutkan Pendaftaran
          </Link>
        </div>
      </main>
    </div>
  );
}
