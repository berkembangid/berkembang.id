import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BlokProduk } from "@/components/marketing/BlokProduk";
import { inisial, isi, peranBerchip } from "@/content/team";
import { muatTim } from "@/modules/tim/team-source";

export const revalidate = false;

export const metadata = {
  title: "Tim P0160 — orang di balik berkembang.id | BERKEMBANG.ID",
  description:
    "Empat orang di balik BERKEMBANG.ID: pendamping pencatatan dan kesiapan data usaha mikro, dengan laporan berbasis SAK EMKM.",
  openGraph: {
    title: "Tim P0160 — orang di balik berkembang.id",
    description:
      "Empat orang di balik BERKEMBANG.ID: pendamping pencatatan dan kesiapan data usaha mikro.",
    images: [{ url: "/og/tim.png", width: 1200, height: 630 }],
  },
};

/**
 * Indeks tim (§1.1).
 *
 * BUKAN halaman yang dituju QR -- QR menuju profil satu orang, karena kartu
 * nama diberikan satu orang. Yang ini induknya: pengunjung yang penasaran bisa
 * melihat siapa lagi, dan tautan "Tim" di setiap profil punya tujuan.
 */
export default async function TimPage() {
  const team = await muatTim();

  return (
    <main className="min-h-screen bg-[#fbf8ff]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" prefetch={false}>
            <Image
              src="/logo/logo berkembang.webp"
              alt="BERKEMBANG.ID"
              width={132}
              height={32}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <Link
            href="/"
            prefetch={false}
            className="flex min-h-9 items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-[#001b85]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Beranda
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-[#dde1ff] to-[#fbf8ff]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#7fffe4] opacity-30"
        />
        <div className="relative mx-auto max-w-4xl px-5 pb-10 pt-10 sm:pb-12 sm:pt-14">
          <p className="font-mono-label text-[11px] uppercase text-[#001b85]">Tim P0160</p>
          <h1 className="mt-3 max-w-2xl font-display text-[2.2rem] leading-[1.08] text-[#001b85] sm:text-5xl">
            Orang di balik berkembang.id
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            Kami membangun pendamping pencatatan untuk usaha mikro — supaya catatan harian
            seorang pemilik warung bisa dibaca bank tanpa ia harus belajar akuntansi.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-5 px-5 py-8 sm:py-10">
        <ul className="grid gap-3 sm:grid-cols-2">
          {team.map((orang) => {
            const tagline = isi(orang.tagline);
            const foto = isi(orang.photo);

            return (
              <li key={orang.slug}>
                <Link
                  href={`/tim/${orang.slug}`}
                  prefetch={false}
            className="group flex h-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#001b85] hover:shadow-sm sm:p-5"
                >
                  {foto ? (
                    <Image
                      src={`/tim/${foto}`}
                      alt={orang.name}
                      width={72}
                      height={90}
                      className="h-[72px] w-[58px] shrink-0 rounded-xl object-cover object-top"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#001b85] text-base font-black text-[#7fffe4]"
                    >
                      {inisial(orang.name)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-headline text-base text-slate-900">{orang.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs font-bold text-[#001b85]">
                      {peranBerchip(orang.role).map((bagian, i) =>
                        bagian.chip ? (
                          <span key={i} className="rounded bg-[#7fffe4] px-1.5 py-0.5">
                            {bagian.teks}
                          </span>
                        ) : (
                          <span key={i}>{bagian.teks}</span>
                        ),
                      )}
                    </p>
                    {tagline && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {tagline}
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

        <BlokProduk />

        <p className="pt-1 text-center text-xs leading-5 text-slate-500">
          Finalis PIDI DIGDAYA Hackathon 2026 · Bank Indonesia × OJK
        </p>
      </div>
    </main>
  );
}
