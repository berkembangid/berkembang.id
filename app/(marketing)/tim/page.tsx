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
 * Indeks tim (SS1.1).
 *
 * BUKAN halaman yang dituju QR -- QR menuju profil satu orang, karena kartu
 * nama diberikan satu orang. Yang ini induknya: pengunjung yang penasaran bisa
 * melihat siapa lagi, dan tautan "Tim" di setiap profil punya tujuan.
 */
export default async function TimPage() {
  const team = await muatTim();

  return (
    <main className="min-h-screen bg-[#fbf8ff]">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
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

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#dde1ff] to-[#fbf8ff]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#7fffe4] opacity-30"
        />
        <div className="relative mx-auto max-w-5xl px-5 pb-10 pt-10 sm:pb-12 sm:pt-14">
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#001b85]">Tim P0160</p>
          <h1 className="mt-3 max-w-2xl font-display text-[2.2rem] leading-[1.08] text-[#001b85] sm:text-5xl">
            Orang di balik berkembang.id
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            Kami membangun pendamping pencatatan untuk usaha mikro — supaya catatan harian
            seorang pemilik warung bisa dibaca bank tanpa ia harus belajar akuntansi.
          </p>
        </div>
      </section>

      {/* ── Bento 2x2 Grid ──────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
        {/*
          Mobile  : 1 kolom, kartu full-width berurutan
          Desktop : 2x2 grid, setiap kartu sama besar
        */}
        <ul className="grid gap-4 sm:grid-cols-2">
          {team.map((orang) => {
            const tagline = isi(orang.tagline);
            const foto = isi(orang.photo);

            return (
              <li key={orang.slug} className="group">
                <Link
                  href={`/tim/${orang.slug}`}
                  prefetch={false}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#001b85]/40 hover:shadow-md"
                >
                  {/* Foto / Avatar block -- header kartu */}
                  <div className="relative flex min-h-[200px] items-end justify-between overflow-hidden bg-gradient-to-br from-[#dde1ff] to-[#eef0fb] p-5 sm:min-h-[240px]">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[#7fffe4] opacity-20"
                    />

                    {/* Nama & role di kiri bawah */}
                    <div className="relative z-10">
                      <p className="font-display text-xl font-black leading-tight text-[#001b85] sm:text-2xl">
                        {orang.name}
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs font-bold text-[#141a34]">
                        {peranBerchip(orang.role).map((bagian, i) =>
                          bagian.chip ? (
                            <span key={i} className="rounded bg-[#7fffe4] px-1.5 py-0.5 text-[#001b85]">
                              {bagian.teks}
                            </span>
                          ) : (
                            <span key={i}>{bagian.teks}</span>
                          ),
                        )}
                      </p>
                    </div>

                    {/* Foto / Inisial di kanan bawah */}
                    {foto ? (
                      <Image
                        src={`/images/${foto}`}
                        alt={orang.name}
                        width={100}
                        height={130}
                        className="relative z-10 h-28 w-20 shrink-0 self-end rounded-xl object-cover object-top drop-shadow-sm transition duration-300 group-hover:scale-105 sm:h-32 sm:w-24"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="relative z-10 flex h-20 w-20 shrink-0 items-center justify-center self-end rounded-xl bg-[#001b85] text-xl font-black text-[#7fffe4] transition duration-300 group-hover:scale-105"
                      >
                        {inisial(orang.name)}
                      </div>
                    )}
                  </div>

                  {/* Tagline + action row */}
                  <div className="flex flex-1 flex-col justify-between gap-3 p-5">
                    {tagline ? (
                      <p className="text-xs leading-5 text-slate-500 line-clamp-2">{tagline}</p>
                    ) : (
                      <div />
                    )}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-xs font-bold text-[#001b85]">Lihat profil</span>
                      <ArrowRight
                        className="h-4 w-4 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-[#001b85]"
                        aria-hidden
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <BlokProduk />
        </div>
      </div>
    </main>
  );
}
