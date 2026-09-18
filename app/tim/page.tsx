import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { anggotaTim, inisial, terisi } from "@/modules/tim/tim";

export const dynamic = "force-static";

export const metadata = {
  title: "Tim | Berkembang.id",
  description: "Orang-orang di balik Berkembang.id.",
};

/**
 * Daftar tim.
 *
 * Halaman ini BUKAN yang dituju QR -- QR menuju profil satu orang, karena
 * kartu nama diberikan satu orang. Yang ini ada supaya profil perorangan itu
 * punya induk: pengunjung yang penasaran bisa melihat siapa lagi, dan tautan
 * "Tim" di profil punya tujuan yang benar.
 */
export default function TimPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo/logo berkembang.webp"
              alt="Berkembang.id"
              width={132}
              height={32}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-[#001b85]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Beranda
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Tim</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Orang-orang di balik Berkembang.id.
        </p>

        <ul className="mt-7 grid gap-3 sm:grid-cols-2">
          {anggotaTim.map((orang) => {
            const peran = terisi(orang.peran);
            const ringkas = terisi(orang.ringkas);
            const foto = terisi(orang.foto);

            return (
              <li key={orang.slug}>
                <Link
                  href={`/tim/${orang.slug}`}
                  className="group flex h-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#001b85] hover:shadow-sm"
                >
                  {foto ? (
                    <Image
                      src={`/tim/${foto}`}
                      alt={orang.nama}
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#dee0ff] text-base font-black text-[#001b85]"
                    >
                      {inisial(orang.nama)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{orang.nama}</p>
                    {peran && <p className="mt-0.5 text-xs font-bold text-[#001b85]">{peran}</p>}
                    {ringkas && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">
                        {ringkas}
                      </p>
                    )}
                  </div>

                  <ArrowRight
                    className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#001b85]"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
