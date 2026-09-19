import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Globe, GraduationCap, Mail, MessageCircle, Users } from "lucide-react";

function IconInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function IconLinkedIn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
import { BlokProduk } from "@/components/marketing/BlokProduk";
import { muatAnggota, muatTim } from "@/modules/tim/team-source";
import {
  anggotaLain,
  daftarIsi,
  inisial,
  isi,
  peranBerchip,
  tautanSosial,
} from "@/content/team";

/**
 * Profil satu anggota tim.
 *
 * Mobile  : Linktree-style. Foto center, tombol WA / Instagram / LinkedIn.
 * Desktop : Bento dua kolom -- foto hero + konten lengkap.
 */

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
  const deskripsi = tagline ?? `${orang.name} - ${peran} di BERKEMBANG.ID, Tim P0160.`;
  const og = isi(orang.ogImage);

  return {
    title: `${orang.name} - ${peran} | BERKEMBANG.ID`,
    description: deskripsi,
    openGraph: {
      title: `${orang.name} - ${peran}`,
      description: deskripsi,
      type: "profile",
      ...(og ? { images: [{ url: `/og/${og}`, width: 1200, height: 630 }] } : {}),
    },
  };
}

const IKON_TAUTAN = {
  email: Mail,
  linkedin: Users,
  instagram: Globe,
  scholar: GraduationCap,
} as const;

function Judul({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#001b85]">
      {children}
    </h2>
  );
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

  // WhatsApp dari vcardPhone (strip non-digit karakter di depan)
  const waNumber = orang.vcardPhone ? orang.vcardPhone.replace(/\D/g, "") : null;
  const waUrl = waNumber ? `https://wa.me/${waNumber}` : null;
  const linkedinUrl = isi(orang.links.linkedin);
  const instagramUrl = isi(orang.links.instagram);

  const rawIg = instagramUrl ? instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "") : "";
  const igUsername = rawIg.startsWith("@") ? rawIg : `@${rawIg}`;
  const instagramHref = instagramUrl
    ? instagramUrl.startsWith("http")
      ? instagramUrl
      : `https://instagram.com/${rawIg.replace(/^@/, "")}`
    : "";

  const liUsername = linkedinUrl
    ? linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "")
    : "";

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
            href="/tim"
            prefetch={false}
            className="flex min-h-9 items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-[#001b85]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Tim
          </Link>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════
          MOBILE: Linktree-style (sm:hidden)
          Foto center, nama, role, tombol-tombol sosial besar
      ════════════════════════════════════════════════════════ */}
      <div className="sm:hidden">
        {/* Gradient backdrop */}
        <div className="relative overflow-hidden bg-gradient-to-b from-[#dde1ff] via-[#eef0fb] to-[#fbf8ff] px-6 pb-10 pt-10">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#7fffe4] opacity-25" />

          {/* Foto / Inisial -- centered */}
          <div className="relative z-10 flex flex-col items-center text-center">
            {foto ? (
              <div className="overflow-hidden rounded-full border-4 border-white shadow-lg">
                <Image
                  src={`/images/${foto}`}
                  alt={orang.name}
                  width={112}
                  height={112}
                  className="h-28 w-28 object-cover object-top"
                  priority
                />
              </div>
            ) : (
              <div
                aria-hidden
                className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-[#001b85] text-3xl font-black text-[#7fffe4] shadow-lg"
              >
                {inisial(orang.name)}
              </div>
            )}

            <h1 className="mt-4 font-display text-3xl font-black leading-tight text-[#001b85]">
              {orang.name}
            </h1>

            <p className="mt-2 flex flex-wrap items-center justify-center gap-1 text-sm font-bold text-[#141a34]">
              {peranBerchip(orang.role).map((bagian, i) =>
                bagian.chip ? (
                  <span key={i} className="rounded-md bg-[#7fffe4] px-2 py-0.5 text-[#001b85]">
                    {bagian.teks}
                  </span>
                ) : (
                  <span key={i}>{bagian.teks}</span>
                ),
              )}
            </p>

            {tagline && (
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">{tagline}</p>
            )}
          </div>
        </div>

        {/* Link Buttons -- Linktree style */}
        <div className="px-6 pb-10 pt-4 space-y-3">
          {/* WhatsApp */}
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl bg-[#25D366] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
            >
              <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
              <span>WhatsApp</span>
            </a>
          )}

          {/* Instagram */}
          {instagramUrl && (
            <a
              href={instagramHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
            >
              <IconInstagram className="h-5 w-5 shrink-0" />
              <span>Instagram</span>
            </a>
          )}

          {/* LinkedIn */}
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl bg-[#0A66C2] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
            >
              <IconLinkedIn className="h-5 w-5 shrink-0" />
              <span>LinkedIn</span>
            </a>
          )}

          {/* Anggota lain */}
          {lain.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Anggota Tim Lain
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {lain.map((teman) => (
                  <Link
                    key={teman.slug}
                    href={`/tim/${teman.slug}`}
                    prefetch={false}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-xs font-bold text-slate-700 transition hover:border-[#001b85]"
                  >
                    <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dde1ff] text-[10px] font-black text-[#001b85]">
                      {inisial(teman.name)}
                    </span>
                    {teman.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <BlokProduk />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          DESKTOP: Bento layout (hidden sm:block)
      ════════════════════════════════════════════════════════ */}
      <div className="hidden sm:block">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#dde1ff] to-[#fbf8ff]">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#7fffe4] opacity-30" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-white opacity-50" />
          <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-10">
            <div className="flex items-start gap-8">
              {foto ? (
                <Image
                  src={`/images/${foto}`}
                  alt={orang.name}
                  width={192}
                  height={240}
                  className="h-64 w-52 shrink-0 rounded-2xl object-cover object-top shadow-sm"
                  priority
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-52 w-52 shrink-0 items-center justify-center rounded-2xl bg-[#001b85] text-4xl font-black text-[#7fffe4] shadow-sm"
                >
                  {inisial(orang.name)}
                </div>
              )}
              <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
                <div>
                  <h1 className="font-display text-5xl leading-[1.08] text-[#001b85] lg:text-6xl">
                    {orang.name}
                  </h1>
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-lg font-bold text-[#141a34]">
                    {peranBerchip(orang.role).map((bagian, i) =>
                      bagian.chip ? (
                        <span key={i} className="rounded-md bg-[#7fffe4] px-2 py-0.5 text-[#001b85]">
                          {bagian.teks}
                        </span>
                      ) : (
                        <span key={i}>{bagian.teks}</span>
                      ),
                    )}
                  </p>
                  {tagline && (
                    <p className="mt-3 max-w-xl text-base leading-6 text-slate-600">{tagline}</p>
                  )}
                </div>

                {/* Card Hubungi -- sejajar langsung di bawah info profil */}
                <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-xs backdrop-blur-xs">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#001b85]">Hubungi</p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#25D366] hover:bg-[#25D366]/5 hover:text-[#128C7E]"
                      >
                        <MessageCircle className="h-4 w-4 text-[#25D366] transition group-hover:scale-110" aria-hidden />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {instagramUrl && (
                      <a
                        href={instagramHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#e1306c] hover:bg-[#e1306c]/5 hover:text-[#c13584]"
                      >
                        <IconInstagram className="h-4 w-4 text-[#e1306c] transition group-hover:scale-110" />
                        <span>Instagram</span>
                      </a>
                    )}
                    {linkedinUrl && (
                      <a
                        href={linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0A66C2] hover:bg-[#0A66C2]/5 hover:text-[#0A66C2]"
                      >
                        <IconLinkedIn className="h-4 w-4 text-[#0A66C2] transition group-hover:scale-110" />
                        <span>LinkedIn</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bento grid content */}
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="grid gap-5 grid-cols-[2fr_3fr]">
            {/* Kolom kiri */}
            <div className="flex flex-col gap-5">
              {about && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <Judul>Tentang</Judul>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{about}</p>
                </section>
              )}
              {(skills.length > 0 || tools.length > 0) && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <Judul>Keahlian &amp; Tools</Judul>
                  <div className="mt-4 space-y-4">
                    {skills.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-400">Keahlian</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {skills.map((butir) => (
                            <span key={butir} className="rounded-lg bg-[#dde1ff] px-2.5 py-1.5 text-xs font-bold text-[#001b85]">
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
                            <span key={butir} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">
                              {butir}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Kolom kanan */}
            <div className="flex flex-col gap-5">
              {highlights.length > 0 && (
                <section className="rounded-2xl bg-[#141a34] p-6 text-white">
                  <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#7fffe4]">Sorotan</h2>
                  <ul className="mt-4">
                    {highlights.map((baris, i) => (
                      <li key={`${baris.year}-${i}`} className="flex gap-4 border-t border-white/10 py-3 first:border-t-0 first:pt-0">
                        <span className="font-mono w-20 shrink-0 text-[10px] leading-6 text-white/50">
                          {isi(baris.year) ?? ""}
                        </span>
                        <span className="text-sm leading-6 text-white/90">{isi(baris.text)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {productRole && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <Judul>Peran di berkembang.id</Judul>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{productRole}</p>
                </section>
              )}
            </div>
          </div>

          {/* Full width: Anggota lain di atas, BlokProduk di bawah */}
          <div className="mt-5 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <Judul>Anggota lain</Judul>
              <ul className="mt-4 flex flex-wrap gap-2">
                {lain.map((teman) => (
                  <li key={teman.slug}>
                    <Link
                      href={`/tim/${teman.slug}`}
                      prefetch={false}
                      className="flex min-h-11 items-center gap-2.5 rounded-full border border-slate-200 py-1.5 pl-1.5 pr-4 transition hover:border-[#001b85]"
                    >
                      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dde1ff] text-[11px] font-black text-[#001b85]">
                        {inisial(teman.name)}
                      </span>
                      <span className="text-xs font-bold text-slate-700">{teman.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <BlokProduk />
          </div>
        </div>
      </div>
    </main>
  );
}