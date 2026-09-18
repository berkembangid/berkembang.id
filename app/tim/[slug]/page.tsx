import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Check,
  Code,
  Globe,
  GraduationCap,
  Image as IkonGambar,
  Mail,
  MapPin,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import {
  alamatProfil,
  anggotaDenganSlug,
  anggotaTim,
  daftarTerisi,
  inisial,
  keahlianTerisi,
  pendidikanTerisi,
  pengalamanTerisi,
  rentang,
  tautanKontak,
  terisi,
} from "@/modules/tim/tim";

/**
 * Halaman yang dituju QR di kartu nama.
 *
 * SIAPA YANG MEMBUKANYA, DAN ITU MENENTUKAN SELURUH TATA LETAKNYA.
 *
 * Hampir selalu orang yang baru menerima kartunya, memindai di tempat, di
 * ponsel, sambil berdiri di depan pemiliknya. Empat akibatnya:
 *
 *   1. SATU KOLOM. Referensi desainnya berbentuk poster -- padat, dua kolom,
 *      dibaca di layar besar. Tata letak seperti itu di layar 390px menjadi
 *      teks kecil yang harus dicubit. Yang diambil dari referensi itu susunan
 *      INFORMASINYA, bukan susunan ruangnya.
 *
 *   2. KONTAK DI ATAS. Yang dicarinya satu hal: cara menghubungi. Tombolnya
 *      setinggi 44px supaya bisa ditekan sambil berdiri.
 *
 *   3. KONTRIBUSI SEBELUM RIWAYAT. Yang membedakan seseorang di tim ini bukan
 *      sekolahnya, melainkan bagian mana dari produk ini yang ia kerjakan.
 *
 *   4. STATIS. Tidak memanggil basis data, tidak memuat klien Supabase. Ia
 *      dibuka di ruang pameran dengan sinyal buruk.
 */

export const dynamic = "force-static";

export function generateStaticParams() {
  return anggotaTim.map((orang) => ({ slug: orang.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const orang = anggotaDenganSlug(slug);
  if (!orang) return { title: "Profil tidak ditemukan | Berkembang.id" };

  const peran = terisi(orang.peran);
  const ringkas = terisi(orang.ringkas);

  return {
    title: `${orang.nama}${peran ? ` — ${peran}` : ""} | Berkembang.id`,
    description: ringkas ?? `Profil ${orang.nama} di Berkembang.id.`,
    openGraph: {
      title: `${orang.nama}${peran ? ` — ${peran}` : ""}`,
      description: ringkas ?? `Profil ${orang.nama} di Berkembang.id.`,
      type: "profile",
    },
  };
}

// Ikon merek tidak dipakai untuk LinkedIn dan GitHub: versi `lucide-react` di
// repo ini sudah membuangnya karena alasan lisensi, dan menyalin SVG merek ke
// repositori ini berarti membawa aset milik pihak lain. Labelnya yang menyebut
// namanya.
const IKON = {
  surel: Mail,
  telepon: MessageCircle,
  linkedin: Briefcase,
  github: Code,
  instagram: IkonGambar,
  portofolio: Sparkles,
  situs: Globe,
} as const;

function JudulBagian({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono-label text-[11px] uppercase text-[#001b85]">{children}</h2>
  );
}

/**
 * Satu baris riwayat, dipakai Pengalaman dan Pendidikan.
 *
 * Tahunnya di kolom kiri yang lebarnya tetap: mata menyusuri satu garis lurus
 * ke bawah alih-alih mencari tahun di tempat yang berpindah-pindah tiap baris.
 */
function BarisRiwayat({
  waktu,
  judul,
  tempat,
  keterangan,
}: {
  waktu: string | null;
  judul: string;
  tempat: string | null;
  keterangan?: string | null;
}) {
  return (
    <li className="flex gap-3 sm:gap-4">
      <div className="w-20 shrink-0 pt-0.5 sm:w-24">
        {waktu && (
          <span className="font-mono-label text-[10px] leading-4 text-slate-400">{waktu}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 border-l border-slate-200 pb-5 pl-4 last:pb-0">
        <p className="text-sm font-bold leading-5 text-slate-900">{judul}</p>
        {tempat && <p className="mt-0.5 text-xs leading-5 text-slate-500">{tempat}</p>}
        {keterangan && (
          <p className="mt-1.5 text-xs leading-5 text-slate-600">{keterangan}</p>
        )}
      </div>
    </li>
  );
}

export default async function ProfilTimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const orang = anggotaDenganSlug(slug);
  if (!orang) notFound();

  const peran = terisi(orang.peran);
  const lokasi = terisi(orang.lokasi);
  const ringkas = terisi(orang.ringkas);
  const tentang = terisi(orang.tentang);
  const foto = terisi(orang.foto);
  const kontribusi = daftarTerisi(orang.kontribusi);
  const keahlian = keahlianTerisi(orang);
  const pengalaman = pengalamanTerisi(orang);
  const pendidikan = pendidikanTerisi(orang);
  const kontak = tautanKontak(orang);
  const pangkalan = terisi(process.env.APP_URL) ?? "https://www.berkembang.id";

  return (
    <main className="min-h-screen bg-[#fbf8ff]">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
          <Link href="/">
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
            href="/tim"
            className="flex min-h-9 items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-[#001b85]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Tim
          </Link>
        </div>
      </header>

      {/* ── Kepala ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#001b85]">
        {/* Lengkung tipis: mengutip bentuk melingkar di referensi tanpa ikut
            membawa kepadatannya. Murni dekoratif, jadi disembunyikan dari
            pembaca layar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[28px] border-[#002bbd] opacity-60"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-[#002bbd] opacity-40"
        />

        <div className="relative mx-auto max-w-2xl px-5 pb-8 pt-8 sm:pb-10 sm:pt-10">
          <div className="flex items-center gap-4 sm:gap-5">
            {foto ? (
              <Image
                src={`/tim/${foto}`}
                alt={orang.nama}
                width={104}
                height={104}
                className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-4 ring-white/15 sm:h-26 sm:w-26"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#7fffe4] text-2xl font-black text-[#001b85] ring-4 ring-white/15 sm:h-24 sm:w-24 sm:text-3xl"
              >
                {inisial(orang.nama)}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="font-display text-2xl leading-tight text-white sm:text-4xl">
                {orang.nama}
              </h1>
              {peran && (
                <p className="mt-1 text-sm font-bold text-[#7fffe4] sm:text-base">{peran}</p>
              )}
              {lokasi && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-[#bac3ff]">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {lokasi}
                </p>
              )}
            </div>
          </div>

          {ringkas && (
            <p className="mt-5 max-w-lg text-sm leading-6 text-[#dee0ff] sm:text-base">
              {ringkas}
            </p>
          )}

          {/* Kontak di kepala, bukan di kaki: inilah yang dicari orang yang
              baru memindai kartunya. */}
          {kontak.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {kontak.map((tautan) => {
                const Ikon = IKON[tautan.jenis as keyof typeof IKON] ?? Globe;
                const luar = tautan.href.startsWith("http");
                const utama = tautan.jenis === "surel" || tautan.jenis === "telepon";
                return (
                  <a
                    key={tautan.jenis}
                    href={tautan.href}
                    {...(luar ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={
                      utama
                        ? "flex min-h-11 items-center gap-2 rounded-full bg-[#7fffe4] px-4 text-xs font-bold text-[#001b85] transition hover:bg-white"
                        : "flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-xs font-bold text-white transition hover:bg-white/10"
                    }
                  >
                    <Ikon className="h-4 w-4" aria-hidden />
                    {tautan.label}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
        <div className="space-y-6">
          {/* ── Kontribusi ──────────────────────────────────────────────
              Bagian terpenting, dan yang paling tidak ada di referensi
              posternya: apa yang orang ini benar-benar kerjakan di produk
              ini. "Teliti" tidak bisa dibantah siapa pun dan semua orang
              menuliskannya; "membangun mesin laporan SAK EMKM" bisa diperiksa. */}
          {kontribusi.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <JudulBagian>Di Berkembang.id</JudulBagian>
              <ul className="mt-4 space-y-3">
                {kontribusi.map((butir) => (
                  <li key={butir} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dee0ff]"
                    >
                      <Check className="h-3 w-3 text-[#001b85]" />
                    </span>
                    <span className="text-sm leading-6 text-slate-700">{butir}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Keahlian ───────────────────────────────────────────────── */}
          {keahlian.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <JudulBagian>Keahlian</JudulBagian>
              <div className="mt-4 space-y-4">
                {keahlian.map((kelompok) => (
                  <div key={kelompok.kelompok}>
                    <p className="text-xs font-bold text-slate-400">{kelompok.kelompok}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {kelompok.butir.map((butir) => (
                        <span
                          key={butir}
                          className="rounded-lg bg-[#f3f2ff] px-2.5 py-1.5 text-xs font-bold text-[#001b85]"
                        >
                          {butir}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Pengalaman ─────────────────────────────────────────────── */}
          {pengalaman.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <JudulBagian>
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" aria-hidden />
                  Pengalaman
                </span>
              </JudulBagian>
              <ul className="mt-4">
                {pengalaman.map((baris, i) => (
                  <BarisRiwayat
                    key={`${terisi(baris.judul)}-${i}`}
                    waktu={rentang(baris.mulai, baris.selesai)}
                    judul={terisi(baris.judul) ?? ""}
                    tempat={terisi(baris.tempat)}
                    keterangan={terisi(baris.keterangan)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* ── Pendidikan ─────────────────────────────────────────────── */}
          {pendidikan.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <JudulBagian>
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap className="h-3 w-3" aria-hidden />
                  Pendidikan
                </span>
              </JudulBagian>
              <ul className="mt-4">
                {pendidikan.map((baris, i) => (
                  <BarisRiwayat
                    key={`${terisi(baris.jenjang)}-${i}`}
                    waktu={rentang(baris.mulai, baris.selesai)}
                    judul={terisi(baris.jenjang) ?? ""}
                    tempat={terisi(baris.tempat)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* ── Tentang ────────────────────────────────────────────────
              Paling bawah dengan sengaja: paragraf panjang adalah yang
              paling jarang dibaca orang yang sedang berdiri. */}
          {tentang && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <JudulBagian>Tentang</JudulBagian>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
                {tentang}
              </p>
            </section>
          )}

          <section className="rounded-2xl border border-[#dee0ff] bg-[#f3f2ff] p-5 sm:p-6">
            <p className="text-sm leading-6 text-slate-700">
              Bagian dari tim{" "}
              <Link href="/" className="font-bold text-[#001b85] hover:underline">
                Berkembang.id
              </Link>{" "}
              — platform pendamping UMKM: catat transaksi lewat suara, pahami kondisi usaha,
              bangun kesiapan untuk tumbuh.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#001b85] px-5 text-xs font-bold text-white transition hover:bg-[#002bbd]"
            >
              Lihat produknya
            </Link>
          </section>
        </div>

        <p className="mt-6 text-center font-mono-label text-[10px] text-slate-400">
          {alamatProfil(orang.slug, pangkalan).replace(/^https?:\/\//, "")}
        </p>
      </div>
    </main>
  );
}
