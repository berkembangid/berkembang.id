import { pilotSector, type AccountingSector } from "@/modules/accounting/coa";

/**
 * Jembatan antara sektor yang dipilih pemilik dan sektor yang punya template.
 *
 * Dua daftar ini tidak sama dan tidak akan pernah sama. Pemilik memilih dari
 * tujuh pilihan yang dia kenali ("Kuliner", "Kerajinan"); mesin akuntansi hanya
 * punya dua kelompok template yang benar-benar sudah di-seed. Sebelumnya
 * jembatannya berupa satu baris tersembunyi — `"jasa" || "teknologi" ? JASA :
 * PERDAGANGAN_KULINER` — sehingga sektor apa pun yang tidak dikenali diam-diam
 * mendarat di template pangan olahan. Pemilik kerajinan mendapat kategori
 * "bahan baku pangan" tanpa satu pun peringatan.
 *
 * Sekarang pemetaannya sebuah tabel yang bisa dibaca, diuji, dan ditambah
 * ketika template sektor baru muncul. Yang belum punya template tetap jatuh ke
 * template dasar — tetapi jatuhnya disengaja dan tercatat, bukan diam-diam.
 */
export const profileSectorOptions = [
  "Kuliner",
  "Fashion",
  "Pertanian",
  "Jasa",
  "Kerajinan",
  "Teknologi",
  "Lainnya",
] as const;

export type ProfileSector = (typeof profileSectorOptions)[number];

/**
 * Pemetaan eksplisit. `null` berarti "belum punya template sendiri", dan itu
 * berbeda maknanya dari "dipetakan ke template dasar" — yang pertama adalah
 * pekerjaan yang belum dilakukan, yang kedua sebuah keputusan.
 */
export const sectorTemplateMap: Record<ProfileSector, AccountingSector | null> = {
  // Warung makan, katering, kue: template pangan olahan memang untuk mereka.
  Kuliner: "PERDAGANGAN_KULINER",
  // Menjual barang jadi. Pola belanja-jual-stoknya sama dengan pedagang.
  Fashion: "PERDAGANGAN_KULINER",
  // Menjual hasil panen; sama-sama berdagang barang dengan persediaan.
  Pertanian: "PERDAGANGAN_KULINER",
  // Tidak punya persediaan barang dagangan; template jasa dibuat untuk ini.
  Jasa: "JASA",
  // Membeli bahan lalu menjual barang jadi -- lebih dekat ke pedagang.
  Kerajinan: "PERDAGANGAN_KULINER",
  // Jasa pengembangan, desain, perbaikan perangkat.
  Teknologi: "JASA",
  // Sengaja belum dipetakan: kita benar-benar tidak tahu apa usahanya.
  Lainnya: null,
};

/** Dicatat sekali per sektor supaya log tidak dipenuhi baris yang sama. */
const warnedSectors = new Set<string>();

/**
 * Sektor akuntansi untuk sebuah jawaban profil.
 *
 * Jawaban yang tidak dikenali maupun yang belum punya template jatuh ke
 * template dasar dan **mencatat peringatan**. Kegagalan diam adalah yang
 * paling mahal di sini: tidak ada satu pun layar yang akan terlihat rusak,
 * hanya kategori yang perlahan tidak masuk akal bagi pemiliknya.
 */
export function resolveAccountingSector(
  answer: string | null | undefined,
  warn: (message: string) => void = (message) => console.warn(message),
): AccountingSector {
  const trimmed = (answer ?? "").trim();
  const matched = profileSectorOptions.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  );

  if (matched) {
    const mapped = sectorTemplateMap[matched];
    if (mapped) return mapped;
    if (!warnedSectors.has(matched)) {
      warnedSectors.add(matched);
      warn(
        `SECTOR_TEMPLATE_FALLBACK: sektor "${matched}" belum punya template sendiri; ` +
          `memakai ${pilotSector}.`,
      );
    }
    return pilotSector;
  }

  if (trimmed && !warnedSectors.has(trimmed)) {
    warnedSectors.add(trimmed);
    warn(
      `SECTOR_UNKNOWN: sektor "${trimmed}" tidak ada dalam pilihan profil; ` +
        `memakai ${pilotSector}.`,
    );
  }
  return pilotSector;
}

/** Hanya untuk uji: peringatan dicatat sekali per sektor per proses. */
export function clearSectorWarnings() {
  warnedSectors.clear();
}
