import RekeningUsahaPage from "@/modules/rekening/rekening-page";

/**
 * Rekening usaha, satu tingkat di bawah Profil.
 *
 * Tempatnya di sini, bukan di Laporan, karena yang dijawab layar ini adalah
 * "usaha saya seperti apa" — sama seperti Dokumen dan Kondisi awal. Laporan
 * menjawab "bagaimana usaha saya berjalan", dan dibaca berulang kali; catatan
 * rekening diisi sekali lalu jarang disentuh lagi.
 */
export default function Page() {
  return <RekeningUsahaPage />;
}
