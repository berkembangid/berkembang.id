"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, Landmark, ShieldCheck, Wallet } from "lucide-react";

/**
 * Profil, dokumen, dan kondisi awal adalah satu pekerjaan, bukan tiga.
 *
 * Ketiganya dulu tersebar di tiga tempat berbeda -- profil di menunya sendiri,
 * dokumen di menu "Dokumen", dan kondisi awal terselip sebagai tab di dalam
 * Laporan. Pemilik usaha baru yang harus melengkapi ketiganya tidak punya satu
 * pun petunjuk bahwa mereka berhubungan, apalagi urutannya.
 *
 * Sekarang ketiganya satu menu, dalam urutan yang memang harus dikerjakan:
 * kenali usahanya, kumpulkan dokumennya, lalu catat titik mulainya. Rekening
 * usaha dan izin data menyusul di belakangnya -- keduanya juga « usaha saya
 * seperti apa », dan dulu hanya bisa ditemukan lewat tautan di tempat lain.
 *
 * Tiap tab tetap halaman tersendiri, bukan keadaan di dalam satu komponen
 * raksasa: alamatnya bisa ditautkan, tombol kembali peramban bekerja, dan
 * ketiganya tidak saling memuat ketika hanya satu yang dibuka.
 */
const TABS = [
  { href: "/umkm/profil", label: "Informasi usaha", short: "Usaha", Icon: Building2 },
  { href: "/umkm/profil/dokumen", label: "Dokumen usaha", short: "Dokumen", Icon: FileText },
  { href: "/umkm/profil/kondisi-awal", label: "Kondisi awal", short: "Awal", Icon: Wallet },
  { href: "/umkm/profil/rekening", label: "Rekening usaha", short: "Rekening", Icon: Landmark },
  { href: "/umkm/profil/izin", label: "Izin & program", short: "Izin", Icon: ShieldCheck },
] as const;

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Halaman informasi usaha sengaja lebih sempit -- itu formulir, dan baris
  // isian yang terlalu lebar melelahkan dibaca. Bilah tab mengikuti lebar
  // halaman yang sedang dibuka supaya tepinya tidak melompat saat berpindah.
  const compact = ["/umkm/profil", "/umkm/profil/rekening", "/umkm/profil/izin"].includes(pathname);
  const width = compact ? "max-w-4xl" : "max-w-[1440px]";

  return (
    <>
      <div className={`mx-auto w-full px-4 pt-5 md:px-7 md:pt-7 ${width}`}>
        <nav
          aria-label="Bagian profil usaha"
          className="flex gap-1 overflow-x-auto rounded-full border border-umkm-line bg-umkm-surface p-1"
        >
          {TABS.map(({ href, label, short, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                /*
                  IKONNYA DISEMBUNYIKAN DI PONSEL, BUKAN LABELNYA.

                  Tiga tab dengan ikon tidak muat di 390px: yang ketiga
                  terdorong sampai 429px dan tersembunyi separuh di balik
                  `overflow-x-auto`, tanpa satu pun penanda bahwa ia ada di
                  sana. Yang belum pernah membuka "Kondisi awal" tidak akan
                  menemukannya.

                  Label yang menjelaskan lebih berharga daripada ikon yang
                  menghias, jadi ikonnya yang mengalah di layar sempit.
                */
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-bold transition-colors sm:gap-2 sm:px-3 ${
                  active ? "bg-white text-umkm-brand shadow-sm" : "text-umkm-subtle hover:text-umkm-ink"
                }`}
              >
                <Icon size={14} className="hidden shrink-0 sm:block" />
                {/* Lima tab tidak muat di 390px dengan nama lengkap; di ponsel
                    tampil nama pendek, nama lengkapnya tetap dibaca pembaca layar. */}
                <span className="sm:hidden" aria-hidden>{short}</span>
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </>
  );
}
