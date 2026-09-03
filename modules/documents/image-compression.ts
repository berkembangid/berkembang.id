/**
 * Mengecilkan foto nota di ponsel sebelum diunggah.
 *
 * Ponsel warung memotret nota pada 3–5 MB. Di sinyal 3G itu berarti unggahan
 * puluhan detik yang sering putus di tengah, dan pemilik menyerah sebelum
 * buktinya sampai. Foto nota tidak butuh resolusi kamera penuh: yang harus
 * terbaca hanya angka dan nama toko.
 *
 * Keputusan yang diambil di berkas ini dipisah dari kerja kanvasnya, supaya
 * aturan ukuran dan mutu bisa diuji tanpa peramban.
 */

/** Sisi terpanjang setelah dikecilkan. Cukup untuk membaca nota tulis tangan. */
export const maxLongEdgePx = 1600;

/** Batas ukuran berkas yang dituju. Di atas ini mutu diturunkan bertahap. */
export const targetBytes = 600 * 1024;

/** Tangga mutu JPEG. Berhenti di 0,5; di bawah itu angka nota mulai kabur. */
export const qualityLadder = [0.75, 0.62, 0.5] as const;

export type ImageDimensions = { width: number; height: number };

/**
 * Ukuran sasaran dengan rasio yang dipertahankan. Foto yang sudah kecil tidak
 * diperbesar — memperbesar hanya menambah byte tanpa menambah satu pun detail.
 */
export function scaledDimensions(
  source: ImageDimensions,
  longEdge: number = maxLongEdgePx,
): ImageDimensions {
  const { width, height } = source;
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= longEdge) return { width, height };
  const ratio = longEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * Hanya gambar raster yang dikecilkan. PDF perjanjian pinjaman dan HEIC yang
 * tidak bisa digambar kanvas diunggah apa adanya: lebih baik berkas besar
 * daripada berkas rusak.
 */
export function isCompressibleImage(type: string): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(type.toLowerCase());
}

/**
 * Hasil kompresi dipakai hanya bila benar-benar lebih kecil. Foto yang sudah
 * ringan sering justru membengkak setelah dikodekan ulang.
 */
export function shouldUseCompressed(originalBytes: number, compressedBytes: number): boolean {
  return compressedBytes > 0 && compressedBytes < originalBytes;
}

export type CompressionResult = {
  file: File;
  originalBytes: number;
  finalBytes: number;
  compressed: boolean;
};

/**
 * Mengecilkan satu foto di peramban. Gagal apa pun sebabnya mengembalikan
 * berkas aslinya: bukti yang besar tetap jauh lebih baik daripada tidak ada
 * bukti sama sekali.
 */
export async function compressImageFile(file: File): Promise<CompressionResult> {
  const unchanged: CompressionResult = {
    file,
    originalBytes: file.size,
    finalBytes: file.size,
    compressed: false,
  };
  if (typeof document === "undefined" || !isCompressibleImage(file.type)) return unchanged;

  let bitmap: ImageBitmap;
  try {
    // `from-image` memutar foto sesuai EXIF. Tanpa ini nota yang dipotret
    // tegak tersimpan miring, dan nota miring tidak terbaca siapa pun.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return unchanged;
  }

  try {
    const size = scaledDimensions({ width: bitmap.width, height: bitmap.height });
    if (size.width === 0) return unchanged;

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return unchanged;
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    let best: Blob | null = null;
    for (const quality of qualityLadder) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
      if (!blob) break;
      best = blob;
      if (blob.size <= targetBytes) break;
    }
    if (!best || !shouldUseCompressed(file.size, best.size)) return unchanged;

    const name = file.name.replace(/\.[^.]+$/, "") || "nota";
    return {
      file: new File([best], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() }),
      originalBytes: file.size,
      finalBytes: best.size,
      compressed: true,
    };
  } catch {
    return unchanged;
  } finally {
    bitmap.close();
  }
}
