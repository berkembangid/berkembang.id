import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PRODUCT_ANCHORS, PRODUCT_POSITION } from "@/content/team";

/**
 * Blok produk yang muncul di SETIAP profil (keputusan H4).
 *
 * Kartu nama dibagikan dalam konteks berkembang.id, tetapi yang memindai QR
 * masuk lewat halaman seseorang -- bukan lewat beranda. Tanpa blok ini ia bisa
 * selesai membaca profil tanpa pernah tahu produk apa yang sedang ditawarkan.
 *
 * Angkanya konstanta bersama, bukan disalin ke empat halaman: ini pernyataan
 * faktual tentang produk yang dibaca juri dan bank, dan empat salinan berarti
 * empat kesempatan untuk berbeda.
 *
 * Satu CTA saja. Spek menyebut "Lihat demo" boleh menyusul bila ada video
 * publik; belum ada, dan dua tombol yang satunya menuju tempat yang belum siap
 * lebih buruk daripada satu tombol yang pasti.
 */
export function BlokProduk() {
  return (
    <section className="overflow-hidden rounded-2xl bg-[#001b85] text-white">
      <div className="p-6 sm:p-8">
        <Image
          src="/logo/logo berkembang.webp"
          alt="Berkembang.id"
          width={148}
          height={36}
          className="h-8 w-auto brightness-0 invert"
        />

        <p className="mt-4 max-w-md text-sm leading-6 text-[#dee0ff] sm:text-base">
          {PRODUCT_POSITION}
        </p>

        <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
          {PRODUCT_ANCHORS.map((angka) => (
            <li
              key={angka}
              className="rounded-xl bg-white/10 px-3.5 py-3 text-xs font-bold leading-5 text-[#7fffe4]"
            >
              {angka}
            </li>
          ))}
        </ul>

        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#7fffe4] px-5 text-xs font-bold text-[#001b85] transition hover:bg-white"
        >
          Kenali berkembang.id
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
