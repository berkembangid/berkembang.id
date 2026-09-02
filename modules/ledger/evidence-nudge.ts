/**
 * Kapan pemilik ditawari memotret nota, dan seberapa keras (spek Bagian 9).
 *
 * Ajakan yang muncul di setiap catatan akan berhenti dibaca dalam sehari.
 * Warung mencatat belanja Rp5.000 belasan kali sehari, dan tidak ada bank yang
 * pernah menanyakan notanya. Yang benar-benar perlu berbukti adalah angka
 * besar dan barang yang jadi milik usaha untuk waktu lama.
 *
 * Karena itu ajakannya bertingkat, dan tingkatnya diputuskan di sini — bukan
 * di dalam layar — supaya aturannya bisa diuji dan hanya ada satu.
 */

/** Di bawah ini pemilik tidak diganggu sama sekali. */
export const quietBelowIdr = 100_000;

/** Kategori yang selalu diajak berbukti: beli alat, dan pinjaman cair. */
const alwaysAskCategories = new Set([8]);

export type NudgeLevel = "none" | "gentle" | "clear";

export type NudgeInput = {
  amountIdr: number;
  categoryCode?: number | null;
  /** Pinjaman cair (kategori 4b) tidak punya kode angka tersendiri. */
  isLoanDisbursement?: boolean;
};

/**
 * Tingkat ajakan untuk satu catatan.
 *
 * Barang yang masuk daftar alat dan pinjaman yang cair selalu diajak, berapa
 * pun nilainya: keduanya melahirkan baris yang hidup bertahun-tahun di
 * pembukuan — alat yang disusutkan tiap bulan, pinjaman yang dicicil — dan
 * baris seperti itu tanpa bukti akan sulit dijelaskan jauh di kemudian hari.
 */
export function nudgeLevelFor(input: NudgeInput): NudgeLevel {
  if (input.isLoanDisbursement) return "clear";
  if (input.categoryCode != null && alwaysAskCategories.has(input.categoryCode)) return "clear";
  if (input.amountIdr < quietBelowIdr) return "none";
  return "gentle";
}

/** Tingkat untuk sekumpulan catatan sekali simpan: yang paling mendesak menang. */
export function nudgeLevelForBatch(items: readonly NudgeInput[]): NudgeLevel {
  let level: NudgeLevel = "none";
  for (const item of items) {
    const current = nudgeLevelFor(item);
    if (current === "clear") return "clear";
    if (current === "gentle") level = "gentle";
  }
  return level;
}

export type NudgeCopy = { title: string; hint: string; buttonLabel: string };

/**
 * Kalimat ajakannya. Yang ditulis adalah gunanya bagi pemilik, bukan
 * kewajibannya: tidak ada aturan yang mengharuskan warung memfoto nota, dan
 * berpura-pura ada akan merusak kepercayaan pada seluruh aplikasi.
 */
export function nudgeCopy(level: NudgeLevel, forAsset = false): NudgeCopy | null {
  if (level === "none") return null;
  if (level === "clear") {
    return forAsset
      ? {
          title: "Fotokan notanya, ya",
          hint: "Barang ini masuk daftar alat usaha dan ikut dihitung tiap bulan. Notanya yang nanti menjelaskan dari mana barang itu datang.",
          buttonLabel: "Foto nota",
        }
      : {
          title: "Fotokan perjanjiannya, ya",
          hint: "Pinjaman ini akan dicicil berbulan-bulan. Perjanjiannya yang nanti menjelaskan angka cicilannya.",
          buttonLabel: "Foto perjanjian",
        };
  }
  return {
    title: "Foto notanya?",
    hint: "Boleh dilewati. Foto notanya biar catatanmu makin kuat.",
    buttonLabel: "Foto nota",
  };
}

/** "0,3 MB — hemat kuota", supaya pemilik tahu kompresi bekerja untuknya. */
export function savedSizeText(originalBytes: number, finalBytes: number): string {
  const mb = (finalBytes / (1024 * 1024)).toFixed(1).replace(".", ",");
  if (finalBytes >= originalBytes) return `${mb} MB terkirim`;
  return `${mb} MB — hemat kuota`;
}
