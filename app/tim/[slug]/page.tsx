import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Code, Globe, Mail, MessageCircle } from "lucide-react";
import {
  alamatProfil,
  anggotaDenganSlug,
  anggotaTim,
  inisial,
  tautanKontak,
  terisi,
} from "@/modules/tim/tim";

/**
 * Halaman yang dituju QR di kartu nama.
 *
 * SIAPA YANG MEMBUKANYA, DAN DALAM KEADAAN APA.
 *
 * Hampir selalu orang yang baru saja menerima kartunya, memindai di tempat,
 * sambil berdiri di depan pemiliknya. Itu menentukan tiga hal:
 *
 *   1. Yang dicarinya satu hal: cara menghubungi. Jadi kontak diletakkan
 *      paling atas yang bisa ditekan, bukan di bawah paragraf tentang diri.
 *
 *   2. Ia memindai di ponsel, kadang di ruangan dengan sinyal buruk. Jadi
 *      halaman ini statis: tidak memanggil basis data, tidak memuat klien
 *      Supabase, tidak menunggu apa pun.
 *
 *   3. Ia sedang menilai apakah ini sungguhan. Jadi halaman ini terlihat
 *      menjadi bagian dari berkembang.id -- logo, warna, dan tautan kembali
 *      ke situsnya -- bukan halaman melayang tanpa asal.
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

// Ikon merek tidak dipakai: versi `lucide-react` di repo ini sudah membuang
// `Github` dan `Linkedin` -- ikon merek dihapus dari pustakanya karena alasan
// lisensi. Menambahkan SVG merek sendiri berarti menyalin aset milik pihak
// lain ke repositori ini, jadi yang dipakai ikon umum, dan labelnya yang
// menyebut namanya.
const IKON = {
  surel: Mail,
  telepon: MessageCircle,
  linkedin: Briefcase,
  github: Code,
  situs: Globe,
} as const;

export default async function ProfilTimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const orang = anggotaDenganSlug(slug);
  if (!orang) notFound();

  const peran = terisi(orang.peran);
  const ringkas = terisi(orang.ringkas);
  const tentang = terisi(orang.tentang);
  const foto = terisi(orang.foto);
  const kontak = tautanKontak(orang);
  const pangkalan = terisi(process.env.APP_URL) ?? "https://www.berkembang.id";

  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
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
            href="/tim"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-[#001b85]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Tim
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
        <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* Bidang warna di atas: tanda bahwa ini halaman resmi, bukan
              halaman pribadi yang kebetulan menyebut nama perusahaan. */}
          <div className="h-20 bg-[#001b85] sm:h-24" />

          <div className="px-6 pb-8 sm:px-8">
            <div className="-mt-10 flex items-end gap-4 sm:-mt-12">
              {foto ? (
                <Image
                  src={`/tim/${foto}`}
                  alt={orang.nama}
                  width={96}
                  height={96}
                  className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-sm sm:h-24 sm:w-24"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-[#dee0ff] text-2xl font-black text-[#001b85] shadow-sm sm:h-24 sm:w-24 sm:text-3xl"
                >
                  {inisial(orang.nama)}
                </div>
              )}
            </div>

            <div className="mt-4">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {orang.nama}
              </h1>
              {peran && (
                <p className="mt-1 text-sm font-bold text-[#001b85] sm:text-base">{peran}</p>
              )}
              {ringkas && (
                <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{ringkas}</p>
              )}
            </div>

            {/* Kontak lebih dulu daripada paragraf tentang diri: yang memindai
                kartu nama sedang mencari cara menghubungi, bukan bacaan. */}
            {kontak.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {kontak.map((tautan) => {
                  const Ikon = IKON[tautan.jenis as keyof typeof IKON] ?? Globe;
                  const luar = tautan.href.startsWith("http");
                  return (
                    <a
                      key={tautan.jenis}
                      href={tautan.href}
                      {...(luar ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-[#001b85] hover:text-[#001b85]"
                    >
                      <Ikon className="h-4 w-4" aria-hidden />
                      {tautan.label}
                    </a>
                  );
                })}
              </div>
            )}

            {tentang && (
              <div className="mt-7 border-t border-slate-100 pt-6">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Tentang
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">
                  {tentang}
                </p>
              </div>
            )}

            <div className="mt-7 border-t border-slate-100 pt-6">
              <p className="text-xs leading-5 text-slate-500">
                Bagian dari tim{" "}
                <Link href="/" className="font-bold text-[#001b85] hover:underline">
                  Berkembang.id
                </Link>{" "}
                — platform pendamping UMKM: catat transaksi lewat suara, pahami kondisi usaha,
                bangun kesiapan untuk tumbuh.
              </p>
            </div>
          </div>
        </article>

        <p className="mt-5 text-center text-[11px] text-slate-400">
          {alamatProfil(orang.slug, pangkalan).replace(/^https?:\/\//, "")}
        </p>
      </div>
    </main>
  );
}
