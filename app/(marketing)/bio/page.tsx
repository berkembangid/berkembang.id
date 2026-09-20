import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FlaskConical, Globe, Mail, Users } from "lucide-react";
import { isi } from "@/content/team";
import { BarisPeran, BarisSandi } from "./akun-demo";

/**
 * Halaman tujuan QR poster (gaya linktree).
 *
 * ALAMATNYA TERCETAK DI KERTAS, JADI IA TIDAK BOLEH PINDAH.
 *
 * QR di poster menunjuk `https://www.berkembang.id/bio`. Berbeda dari halaman
 * lain, alamat ini tidak bisa diubah, dialihkan, atau dihapus tanpa membuat
 * setiap poster yang sudah tercetak menunjuk tempat kosong. Mengganti nama
 * folder ini sama dengan membuang poster itu.
 *
 * DUA TAUTAN UTAMANYA MUTLAK, BUKAN RELATIF, DAN ITU PENTING.
 *
 * Berkas yang sama ini dibangun untuk DUA lingkungan: produksi di
 * `www.berkembang.id` dan demo di `demo.berkembang.id`. Kalau tombol "live"
 * ditulis relatif sebagai `/`, maka pada `demo.berkembang.id/bio` ia akan
 * mengantar orang ke BERANDA DEMO sambil menyebutnya versi sungguhan --
 * persis kekeliruan yang seluruh spanduk lingkungan dipasang untuk mencegah.
 *
 * Alamat mutlak membuat halaman ini menunjuk hal yang sama di mana pun ia
 * disajikan.
 */

export const metadata = {
  title: "BERKEMBANG.ID — semua tautan dalam satu halaman",
  description:
    "Buka BERKEMBANG.ID, atau coba dulu lewat lingkungan demo dengan contoh usaha berisi catatan enam bulan.",
  openGraph: {
    title: "BERKEMBANG.ID",
    description: "Catat lewat suara. Semua tautan dalam satu halaman.",
    type: "website",
    locale: "id_ID",
  },
};

const ALAMAT_LIVE = "https://www.berkembang.id";
const ALAMAT_DEMO = "https://demo.berkembang.id";

/** Satu sandi untuk seluruh persona demo -- lihat `akun-demo.tsx`. */
const SANDI_DEMO = "Demo-Berkembang-2026";

/**
 * Tiga akun, karena ada TIGA portal -- bukan lima, walau personanya lima.
 *
 * Seeder demo membuat lima: UMKM, koperasi, bank, CVC, dan dinas. Tapi
 * koperasi, bank, dan dinas mendarat di portal lembaga yang sama persis,
 * dengan menu yang sama persis; yang berbeda hanya keadaan datanya. Memajang
 * ketiganya di halaman poster berarti tiga baris yang mengantar ke layar yang
 * sama, dan orang yang mencobanya akan mengira ia salah menekan.
 *
 * Jadi yang ditampilkan satu akun per portal: pemilik usaha, lembaga, dan
 * investor. Koperasi (`demo.institusi@`) dan bank (`demo.bank@`) tetap hidup
 * untuk peragaan yang butuh keadaan izin yang berbeda.
 */
const AKUN_DEMO = [
  {
    peran: "Pemilik usaha",
    lembaga: "Dapur Bu Nita",
    lihat: "Catat lewat suara, lihat untung dan kesiapan usaha",
    email: "demo.umkm@berkembang.id",
  },
  {
    peran: "Dinas / lembaga",
    lembaga: "Dinas Koperasi & UKM Kota Depok",
    lihat: "Kandidat tersamar, program, dan analitik wilayah",
    email: "demo.dinas@berkembang.id",
  },
  {
    peran: "Investor",
    lembaga: "BNI Ventures",
    lihat: "Katalog UMKM, kemitraan, dan pengajuan minat",
    email: "demo.cvc@berkembang.id",
  },
];

/**
 * Sosial media produk.
 *
 * ATURANNYA SAMA DENGAN `content/team.ts`: yang belum diisi TIDAK
 * DITAMPILKAN, bukan ditampilkan kosong. `isi()` yang memutuskan, jadi arti
 * "belum diisi" hanya ditulis di satu tempat di seluruh repo.
 *
 * Halaman ini dipajang di poster. Satu tautan mati di sini dibuka orang yang
 * sedang berdiri di depan poster itu -- lebih buruk daripada tidak ada bagian
 * sosial media sama sekali.
 *
 * IKONNYA UMUM, BUKAN LAMBANG MEREK. lucide-react di repo ini tidak memuat
 * ikon merek, dan `/tim` sudah menyelesaikannya dengan cara yang sama: ikon
 * netral, nama platformnya ditulis jelas sebagai label.
 */
const SOSIAL: Array<{ platform: string; label: string; href: string; ikon: typeof Globe }> = [
  // Tinggal diisi -- hapus tanda komentar dan ganti alamatnya:
  // { platform: "Instagram", label: "@berkembang.id", href: "https://www.instagram.com/berkembang.id", ikon: Globe },
  // { platform: "LinkedIn", label: "BERKEMBANG.ID", href: "https://www.linkedin.com/company/berkembangid", ikon: Users },
];

const SURAT = "support@berkembang.id";

function Judul({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#001b85]">
      {children}
    </h2>
  );
}

export default function BioPage() {
  const sosial = SOSIAL.filter((s) => isi(s.href));

  return (
    /*
      Satu kolom sempit, rata tengah, di semua lebar.

      Yang membuka halaman ini hampir selalu baru memindai QR dengan ponsel,
      jadi ponselnya tata letak utama -- bukan versi kecil dari tata letak
      layar lebar. Di layar lebar kolomnya tidak melebar; ia hanya berdiri di
      tengah, karena daftar tautan yang direntangkan selebar layar justru
      lebih sulit dibaca.
    */
    <main className="min-h-screen bg-[#fbf8ff] px-5 pb-12 pt-10 sm:pt-14">
      <div className="mx-auto w-full max-w-md">
        {/* -- Kepala -------------------------------------------------- */}
        <header className="flex flex-col items-center text-center">
          {/*
            `py-1.5` bukan hiasan: logonya setinggi 36px, dan tautan setinggi
            36px adalah sasaran sentuh yang meleset di ponsel. Jaraknya
            menaikkan area sentuhnya ke 48px tanpa mengubah tampilan logonya.
          */}
          <Link
            href="/"
            prefetch={false}
            aria-label="Beranda BERKEMBANG.ID"
            className="inline-block py-1.5"
          >
            <Image
              src="/logo/logo berkembang.webp"
              alt="BERKEMBANG.ID"
              width={176}
              height={43}
              className="h-9 w-auto"
              priority
            />
          </Link>

          <h1 className="mt-6 font-display text-[1.9rem] leading-[1.12] text-[#001b85] sm:text-4xl">
            Bicara sebentar.
            <br />
            Usaha lebih tertata.
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-600">
            Pendamping pencatatan untuk usaha mikro. Ceritakan transaksinya lewat suara,
            dan catatan harian Anda tersusun sendiri jadi laporan yang bisa dibaca bank —
            tanpa perlu memahami istilah akuntansi.
          </p>
        </header>

        {/* -- Dua tautan utama ---------------------------------------- */}
        <div className="mt-8 space-y-3">
          <a
            href={ALAMAT_LIVE}
            className="group flex min-h-[68px] items-center gap-4 rounded-2xl bg-[#001b85] px-5 py-4 text-white shadow-sm transition hover:shadow-md active:scale-[.99]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15" aria-hidden>
              <Globe className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-tight">Buka BERKEMBANG.ID</span>
              <span className="block text-xs leading-snug text-white/70">
                Daftar gratis, mulai mencatat hari ini
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-white/60 transition group-hover:translate-x-0.5"
              aria-hidden
            />
          </a>

          <a
            href={ALAMAT_DEMO}
            className="group flex min-h-[68px] items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xs transition hover:border-[#001b85]/40 hover:shadow-md active:scale-[.99]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#dde1ff] text-[#001b85]" aria-hidden>
              <FlaskConical className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-tight text-[#141a34]">
                Coba demo dulu
              </span>
              <span className="block text-xs leading-snug text-slate-500">
                Contoh usaha dengan catatan enam bulan
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#001b85]"
              aria-hidden
            />
          </a>
        </div>

        {/* -- Akun demo ----------------------------------------------- */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <Judul>Akun untuk mencoba</Judul>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Tiga sisi yang bisa dicoba di lingkungan demo. Dipakai bersama-sama, datanya
            contoh, boleh diubah, dan direset kapan saja.
          </p>
          <div className="mt-4">
            <BarisSandi nilai={SANDI_DEMO} />
          </div>
          <div className="mt-3 space-y-2">
            {AKUN_DEMO.map((akun) => (
              <BarisPeran key={akun.email} {...akun} />
            ))}
          </div>
        </section>

        {/* -- Sosial media -------------------------------------------- */}
        {sosial.length > 0 && (
          <section className="mt-6">
            <Judul>Ikuti kami</Judul>
            <ul className="mt-3 space-y-2">
              {sosial.map((s) => {
                const Ikon = s.ikon;
                return (
                  <li key={s.platform}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[52px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs transition hover:border-[#001b85]/40"
                    >
                      <Ikon className="h-4 w-4 shrink-0 text-[#001b85]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold leading-tight text-[#141a34]">
                          {s.platform}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{s.label}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* -- Tim & kontak -------------------------------------------- */}
        <div className="mt-6 space-y-2">
          <Link
            href="/tim"
            prefetch={false}
            className="flex min-h-[52px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs transition hover:border-[#001b85]/40"
          >
            <Users className="h-4 w-4 shrink-0 text-[#001b85]" aria-hidden />
            <span className="flex-1 text-[13px] font-bold text-[#141a34]">
              Tim di balik BERKEMBANG.ID
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
          </Link>

          <a
            href={"mailto:" + SURAT}
            className="flex min-h-[52px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs transition hover:border-[#001b85]/40"
          >
            <Mail className="h-4 w-4 shrink-0 text-[#001b85]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#141a34]">
              {SURAT}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
          </a>
        </div>

        <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-widest text-slate-400">
          BERKEMBANG.ID — Tim P0160
        </p>
      </div>
    </main>
  );
}
