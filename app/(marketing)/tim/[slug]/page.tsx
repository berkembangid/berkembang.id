import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Globe, GraduationCap, Mail, Users } from "lucide-react";
import { BlokProduk } from "@/components/marketing/BlokProduk";
import { muatAnggota, muatTim } from "@/modules/tim/team-source";
import {
  anggotaLain,
  daftarIsi,
  inisial,
  isi,
  peranBerchip,
  tautanSosial,
  team,
} from "@/content/team";

/**
 * Profil satu anggota tim -- halaman yang dituju QR di kartu nama.
 *
 * SIAPA YANG MEMBUKANYA MENENTUKAN SELURUH TATA LETAKNYA (H8).
 *
 * Orang di lobi atau booth, di ponsel, dengan sinyal seluler, sambil berdiri
 * di depan pemilik kartunya. Empat akibatnya:
 *
 *   1. STATIS PENUH. Tanpa Supabase, tanpa auth, tanpa cookie, tanpa analytics
 *      pihak ketiga. Halaman ini tidak memanggil apa pun saat dibuka.
 *   2. SATU KOLOM, mobile-first. Referensi desainnya berbentuk poster dua
 *      kolom; tata letak itu di layar 390px menjadi teks yang harus dicubit.
 *      Yang diambil dari referensi adalah ENERGINYA (tipografi besar, chip,
 *      satu blok gelap), bukan susunan ruangnya.
 *   3. TOMBOL SIMPAN KONTAK STICKY di layar sempit (§2). vCard adalah alasan
 *      QR ini ada; ia tidak boleh hilang saat orang menggulir.
 *   4. BLOK PRODUK SELALU IKUT (H4). Yang masuk lewat profil seseorang harus
 *      tetap menemukan produknya.
 *
 * Bidang bertanda TODO-KONTEN tidak ditampilkan sama sekali -- bukan
 * ditampilkan kosong. Kartunya boleh dicetak sebelum seluruh profil lengkap.
 */

// Statis, dibangun ulang hanya ketika admin menekan simpan.
//
// `force-static` diganti `revalidate = false`: halamannya tetap disajikan
// sebagai berkas statis -- pengunjung tidak menyentuh basis data -- tetapi
// `revalidatePath` dari layar admin boleh menggantinya. Dengan `force-static`,
// permintaan bangun ulang itu diabaikan diam-diam.
export const revalidate = false;

export async function generateStaticParams() {
  return (await muatTim()).map((orang) => ({ slug: orang.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const orang = await muatAnggota(slug);
  if (!orang) return { title: "Profil tidak ditemukan | BERKEMBANG.ID" };

  const peran = orang.role.replace(/\*\*/g, "");
  const tagline = isi(orang.tagline);
  const deskripsi = tagline ?? `${orang.name} — ${peran} di BERKEMBANG.ID, Tim P0160.`;
  const og = isi(orang.ogImage);

  return {
    title: `${orang.name} — ${peran} | BERKEMBANG.ID`,
    description: deskripsi,
    openGraph: {
      title: `${orang.name} — ${peran}`,
      description: deskripsi,
      type: "profile",
      // Gambarnya menyusul dari Yosua; path-nya sudah dipatok supaya berkasnya
      // tinggal ditaruh tanpa menyentuh kode.
      ...(og ? { images: [{ url: `/og/${og}`, width: 1200, height: 630 }] } : {}),
    },
  };
}

// Ikon merek tidak dipakai untuk LinkedIn dan Scholar: versi `lucide-react` di
// repo ini sudah membuang ikon merek karena lisensi, dan menyalin SVG merek ke
// sini berarti membawa aset milik pihak lain. Labelnya yang menyebut namanya.
const IKON_TAUTAN = {
  email: Mail,
  linkedin: Users,
  instagram: Globe,
  scholar: GraduationCap,
} as const;

function Judul({ children }: { children: React.ReactNode }) {
  return <h2 className="font-mono-label text-[11px] uppercase text-[#001b85]">{children}</h2>;
}

export default async function ProfilAnggotaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const orang = await muatAnggota(slug);
  if (!orang) notFound();

  const tagline = isi(orang.tagline);
  const about = isi(orang.about);
  const productRole = isi(orang.productRole);
  const foto = isi(orang.photo);
  const skills = daftarIsi(orang.skills);
  const tools = daftarIsi(orang.tools);
  const highlights = (orang.highlights ?? []).filter((b) => isi(b.text) !== null);
  const sosial = tautanSosial(orang);
  const lain = anggotaLain(orang.slug, await muatTim());

  return (
    <main className="min-h-screen bg-[#fbf8ff] pb-24 sm:pb-0">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
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
            href="/tim"
            prefetch={false}
            className="flex min-h-9 items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-[#001b85]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Tim
          </Link>
        </div>
      </header>

      {/* ── 1. Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#dde1ff] to-[#fbf8ff]">
        {/* Kurva halus di sudut, opasitas rendah, tidak menyentuh teks (§2). */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#7fffe4] opacity-30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-white opacity-50"
        />

        <div className="relative mx-auto max-w-3xl px-5 pb-10 pt-8 sm:pb-12 sm:pt-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-7">
            {foto ? (
              <Image
                src={`/tim/${foto}`}
                alt={orang.name}
                width={176}
                height={220}
                className="h-40 w-32 shrink-0 self-start rounded-2xl object-cover object-top sm:h-56 sm:w-44"
                priority
              />
            ) : (
              <div
                aria-hidden
                className="flex h-28 w-28 shrink-0 items-center justify-center self-start rounded-2xl bg-[#001b85] text-3xl font-black text-[#7fffe4] sm:h-36 sm:w-36 sm:text-4xl"
              >
                {inisial(orang.name)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[2.6rem] leading-[1.05] text-[#001b85] sm:text-6xl">
                {orang.name}
              </h1>

              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-base font-bold text-[#141a34] sm:text-lg">
                {peranBerchip(orang.role).map((bagian, i) =>
                  bagian.chip ? (
                    <span
                      key={i}
                      className="rounded-md bg-[#7fffe4] px-2 py-0.5 text-[#001b85]"
                    >
                      {bagian.teks}
                    </span>
                  ) : (
                    <span key={i}>{bagian.teks}</span>
                  ),
                )}
              </p>

              {tagline && (
                <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600 sm:text-base">
                  {tagline}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-5 px-5 py-8 sm:py-10">
        {/* ── 2. Tentang ────────────────────────────────────────────── */}
        {about && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <Judul>Tentang</Judul>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700 sm:text-base">
              {about}
            </p>
          </section>
        )}

        {/* ── 3. Sorotan — satu-satunya blok gelap (§2) ─────────────── */}
        {highlights.length > 0 && (
          <section className="rounded-2xl bg-[#141a34] p-5 text-white sm:p-7">
            <h2 className="font-mono-label text-[11px] uppercase text-[#7fffe4]">Sorotan</h2>
            <ul className="mt-4">
              {highlights.map((baris, i) => (
                <li key={`${baris.year}-${i}`} className="flex gap-4 border-t border-white/10 py-3 first:border-t-0 first:pt-0">
                  <span className="font-mono-label w-20 shrink-0 text-[10px] leading-6 text-white/50">
                    {isi(baris.year) ?? ""}
                  </span>
                  <span className="text-sm leading-6 text-white/90">{isi(baris.text)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 4. Keahlian & tools — chip polos, tanpa bar persen (§2) ─ */}
        {(skills.length > 0 || tools.length > 0) && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <Judul>Keahlian &amp; tools</Judul>
            <div className="mt-4 space-y-4">
              {skills.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400">Keahlian</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {skills.map((butir) => (
                      <span
                        key={butir}
                        className="rounded-lg bg-[#dde1ff] px-2.5 py-1.5 text-xs font-bold text-[#001b85]"
                      >
                        {butir}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {tools.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400">Tools</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tools.map((butir) => (
                      <span
                        key={butir}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700"
                      >
                        {butir}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── 5. Peran di produk ────────────────────────────────────── */}
        {productRole && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <Judul>Peran di berkembang.id</Judul>
            <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-base">{productRole}</p>
          </section>
        )}

        {/* ── 6. Kontak ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <Judul>Kontak</Judul>

          {/* Tombol utama, selalu ada: vCard adalah alasan QR ini dipasang. */}
          <a
            href={`/tim/${orang.slug}/vcard`}
            className="mt-4 hidden min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#001b85] px-6 text-sm font-bold text-white transition hover:bg-[#002bbd] sm:inline-flex sm:w-auto"
          >
            <Download className="h-4 w-4" aria-hidden />
            Simpan kontak
          </a>

          {sosial.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-3">
              {sosial.map((tautan) => {
                const Ikon = IKON_TAUTAN[tautan.jenis as keyof typeof IKON_TAUTAN] ?? Globe;
                const luar = tautan.href.startsWith("http");
                return (
                  <a
                    key={tautan.jenis}
                    href={tautan.href}
                    {...(luar ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="flex min-h-11 items-center gap-2 rounded-full border border-slate-200 px-4 text-xs font-bold text-slate-700 transition hover:border-[#001b85] hover:text-[#001b85]"
                  >
                    <Ikon className="h-4 w-4" aria-hidden />
                    {tautan.label}
                  </a>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 7. Blok produk, sama di semua profil ──────────────────── */}
        <BlokProduk />

        {/* ── 8. Navigasi antar-anggota ─────────────────────────────── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <Judul>Anggota lain</Judul>
          <ul className="mt-4 flex flex-wrap gap-2">
            {lain.map((teman) => (
              <li key={teman.slug}>
                <Link
                  href={`/tim/${teman.slug}`}
                  prefetch={false}
            className="flex min-h-11 items-center gap-2.5 rounded-full border border-slate-200 py-1.5 pl-1.5 pr-4 transition hover:border-[#001b85]"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dde1ff] text-[11px] font-black text-[#001b85]"
                  >
                    {inisial(teman.name)}
                  </span>
                  <span className="text-xs font-bold text-slate-700">{teman.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/*
        Tombol sticky, hanya di layar sempit (§2).
        Di desktop tombolnya sudah terlihat di bagian Kontak tanpa menggulir,
        jadi bilah melayang di sana hanya menutupi isi.
      */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:hidden">
        <a
          href={`/tim/${orang.slug}/vcard`}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#001b85] px-6 text-sm font-bold text-white"
        >
          <Download className="h-4 w-4" aria-hidden />
          Simpan kontak
        </a>
      </div>
    </main>
  );
}
