import type { LucideIcon } from "lucide-react";

/**
 * Tabel judul layar untuk portal Lembaga dan Admin.
 *
 * KENAPA TABEL, BUKAN LABEL MENU YANG SEDANG AKTIF.
 *
 * Header kedua portal dulu menampilkan label item menu yang cocok dengan awalan
 * alamat. Akibatnya setiap halaman dalam mewarisi nama induknya: detail sebuah
 * lembaga bernama "Lembaga", detail UMKM bernama "UMKM", dan halaman metodologi
 * bernama sama dengan halaman yang menautkannya. Orang yang membuka salah satu
 * dari tautan itu tidak punya satu pun petunjuk halaman mana yang terbuka.
 *
 * Tabel ini juga yang menyimpan INDUKNYA, dan itu yang membuat tombol kembali
 * mungkin. Menu samping hanya memuat tujuan utama; halaman dalam tidak ada di
 * sana, jadi di layar sempit -- tempat menu samping tersembunyi di balik tombol
 * hamburger -- satu-satunya jalan keluar adalah tombol kembali peramban.
 */
export type PortalRoute = {
  /** Awalan alamat. Yang paling panjang menang. */
  match: string;
  /** Cocokkan persis, bukan sebagai awalan. Untuk akar portal. */
  exact?: boolean;
  title: string;
  /** Baris kecil di bawah judul. Kosongkan bila judulnya sudah cukup. */
  hint?: string;
  parent?: { href: string; label: string };
  Icon?: LucideIcon;
};

export type PortalHeading = {
  title: string;
  hint?: string;
  parentHref?: string;
  parentLabel?: string;
  Icon?: LucideIcon;
};

/**
 * Judul untuk sebuah alamat.
 *
 * Yang paling dalam menang, dan itu satu-satunya aturan yang perlu diingat:
 * `/institusi/dossiers` dan `/institusi` sama-sama cocok sebagai awalan, dan
 * yang benar adalah yang lebih panjang. Diurutkan di sini, bukan dititipkan ke
 * urutan penulisan tabel -- tabel yang benar hanya bila barisnya kebetulan
 * berurutan adalah tabel yang akan salah pada penambahan berikutnya.
 */
export function resolvePortalHeading(
  pathname: string,
  routes: readonly PortalRoute[],
  fallback: string,
): PortalHeading {
  const matched = routes
    .filter((route) => (route.exact ? pathname === route.match : pathname.startsWith(route.match)))
    .sort((left, right) => right.match.length - left.match.length)[0];

  if (!matched) return { title: fallback };
  return {
    title: matched.title,
    ...(matched.hint ? { hint: matched.hint } : {}),
    ...(matched.parent ? { parentHref: matched.parent.href, parentLabel: matched.parent.label } : {}),
    ...(matched.Icon ? { Icon: matched.Icon } : {}),
  };
}
