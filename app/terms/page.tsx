import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import TermsDocumentView from "./terms-document";
import {
  TERMS_EFFECTIVE_DATE,
  TERMS_VERSION,
  termsDocumentFor,
} from "@/modules/legal/terms";

export const metadata = {
  title: "Syarat & Ketentuan | Berkembang.id",
  description:
    "Syarat dan Ketentuan penggunaan Berkembang.id untuk pengguna UMKM serta untuk lembaga dan investor, beserta kebijakan perlindungan data pribadi.",
};

/**
 * `?pihak=lembaga` membuka langsung dokumen lembaga.
 *
 * Dibaca di sini, bukan di komponen kliennya, supaya dokumen yang benar sudah
 * ada di HTML pertama: sebuah halaman hukum yang menampilkan perjanjian keliru
 * selama sesaat lebih buruk daripada memuat sedikit lebih lambat.
 */
export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const party = (await searchParams).pihak;
  const audience = termsDocumentFor(typeof party === "string" ? party : null).id;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
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
            className="flex items-center gap-1 text-xs font-bold text-[#001b85] hover:text-[#08299f]"
          >
            <ArrowLeft size={14} /> Kembali ke Pendaftaran
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-[#001b85]">
            <ShieldCheck size={14} /> Perlindungan Privasi &amp; Data
          </div>
          <h1 className="text-2xl font-black text-[#141a34] md:text-3xl">
            Syarat &amp; Ketentuan Layanan
          </h1>
          <p className="mt-1 text-xs text-slate-500 md:text-sm">
            Versi {TERMS_VERSION} · Berlaku sejak {TERMS_EFFECTIVE_DATE} · Diatur oleh hukum
            Negara Republik Indonesia
          </p>
        </div>

        <TermsDocumentView audience={audience} />

        <div className="pt-4 text-center">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 rounded-full bg-[#001b85] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#08299f]"
          >
            <ArrowLeft size={16} /> Kembali &amp; Lanjutkan Pendaftaran
          </Link>
        </div>
      </main>
    </div>
  );
}
