/**
 * Bentuk satu baris bukti legalitas yang ikut tercetak di dossier lembaga.
 *
 * Tipe ini tinggal di berkas tersendiri, bukan di `dossier-evidence.ts` yang
 * memproduksinya, karena `statement-document.ts` memakainya — dan berkas itu
 * ikut termuat di sisi klien, sementara `dossier-evidence.ts` adalah
 * `server-only`.
 */
export type LegalitasItem = {
  /** Nama jenis dokumen, mis. "KTP Pemilik Usaha", "NIB", "NPWP", "PIRT" */
  label: string;
  /** Status ketersediaan/verifikasi */
  status: "verified" | "available" | "unavailable";
  /** Detail tambahan: nomor dokumen, penerbit, atau masa berlaku */
  detail?: string;
  /**
   * Pindaian yang diunggah pemilik, sebagai data URI ("data:image/jpeg;base64,...")
   * siap dipasang ke <Image> React-PDF. null bila tidak ada gambar yang bisa
   * ditampilkan -- sebabnya ada di imageNote.
   */
  image?: string | null;
  /** Sebab gambar kosong: "Belum diunggah", "Berkas PDF", "Gambar tidak terbaca". */
  imageNote?: string | null;
};
