import { isDemoMode } from "@/lib/env/app-mode";

/**
 * Penanda bahwa ini lingkungan demo.
 *
 * KEGAGALAN YANG DICEGAH BUKAN KEGAGALAN TEKNIS.
 *
 * Yang paling buruk dari punya demo bukan datanya bocor -- basis datanya
 * terpisah. Yang paling buruk adalah seorang pemilik warung memasukkan catatan
 * keuangan SUNGGUHAN ke dalamnya, lalu kehilangannya saat demo direset. Atau
 * seorang petugas dinas membaca angka contoh dan menyusun program dari
 * angka-angka yang tidak pernah ada.
 *
 * Keduanya terjadi karena satu hal: dua lingkungan itu terlihat sama persis.
 * Tanpa satu penanda yang selalu terlihat, tidak ada cara mengetahuinya selain
 * membaca alamat di bilah peramban -- yang di ponsel sering tersembunyi.
 *
 * KOMPONEN SERVER, DAN ITU BUKAN KEBETULAN.
 *
 * `APP_MODE` dibaca di server dan tidak berawalan `NEXT_PUBLIC_`, jadi ia tidak
 * pernah ikut ke bundel peramban. Kalau penanda ini komponen klien, nilainya
 * harus disiarkan -- dan nilai yang disiarkan bisa dipalsukan siapa pun yang
 * membuka alat pengembang. Penanda lingkungan yang bisa dimatikan pembacanya
 * bukan penanda.
 *
 * Tidak bisa ditutup. Spanduk yang bisa ditutup akan ditutup pada menit
 * pertama, lalu sisa sesinya berjalan tanpa penanda apa pun.
 *
 * NAMANYA "ENVIRONMENT", DAN ITU UNTUK MEMBEDAKANNYA.
 *
 * Sudah ada `components/DemoBanner.tsx` yang artinya lain sama sekali: "angka
 * di HALAMAN ini simulasi", dipakai di dua halaman Ruang Mesin, dan benar
 * walau lingkungannya produksi. Yang ini soal LINGKUNGAN, bukan halaman.
 *
 * Dua komponen bernama sama dengan arti berbeda adalah cacat yang menunggu:
 * yang mengimpor salah satunya tidak akan tahu sampai spanduknya muncul di
 * tempat yang salah -- atau lebih buruk, tidak muncul di tempat yang benar.
 */
export function DemoEnvironmentBanner() {
  if (!isDemoMode()) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-[#5c3700] px-3 py-1.5 text-center text-[11px] font-bold leading-snug text-[#fff4dc]"
    >
      <span>LINGKUNGAN DEMO</span>
      <span className="font-medium opacity-90">
        Datanya contoh dan bisa dihapus kapan saja. Jangan memasukkan catatan usaha yang sungguhan.
      </span>
    </div>
  );
}
