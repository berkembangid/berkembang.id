"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, Wallet } from "lucide-react";

/**
 * Profil, dokumen, dan kondisi awal adalah satu pekerjaan, bukan tiga.
 *
 * Ketiganya dulu tersebar di tiga tempat berbeda -- profil di menunya sendiri,
 * dokumen di menu "Dokumen", dan kondisi awal terselip sebagai tab di dalam
 * Laporan. Pemilik usaha baru yang harus melengkapi ketiganya tidak punya satu
 * pun petunjuk bahwa mereka berhubungan, apalagi urutannya.
 *
 * Sekarang ketiganya satu menu dengan tiga tab, dalam urutan yang memang harus
 * dikerjakan: kenali usahanya, kumpulkan dokumennya, lalu catat titik mulainya.
 *
 * Tiap tab tetap halaman tersendiri, bukan keadaan di dalam satu komponen
 * raksasa: alamatnya bisa ditautkan, tombol kembali peramban bekerja, dan
 * ketiganya tidak saling memuat ketika hanya satu yang dibuka.
 */
const TABS = [
  { href: "/umkm/profil", label: "Informasi usaha", Icon: Building2 },
  { href: "/umkm/profil/dokumen", label: "Dokumen usaha", Icon: FileText },
  { href: "/umkm/profil/kondisi-awal", label: "Kondisi awal", Icon: Wallet },
] as const;

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Halaman informasi usaha sengaja lebih sempit -- itu formulir, dan baris
  // isian yang terlalu lebar melelahkan dibaca. Bilah tab mengikuti lebar
  // halaman yang sedang dibuka supaya tepinya tidak melompat saat berpindah.
  const width = pathname === "/umkm/profil" ? "max-w-4xl" : "max-w-[1440px]";

  return (
    <>
      <div className={`mx-auto w-full px-4 pt-5 md:px-7 md:pt-7 ${width}`}>
        <nav
          aria-label="Bagian profil usaha"
          className="flex gap-1 overflow-x-auto rounded-full border border-[#e3e9f0] bg-[#f5f7fb] p-1"
        >
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-bold transition-colors ${
                  active ? "bg-white text-[#001b85] shadow-sm" : "text-[#6e859e] hover:text-[#1b2a3a]"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </>
  );
}
