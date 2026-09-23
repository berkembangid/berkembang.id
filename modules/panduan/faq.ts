/**
 * Jawaban singkat untuk pertanyaan pemilik usaha.
 *
 * Halaman Panduan dulu berjanji « tanya apa saja » tetapi isinya empat
 * tautan. Chatbot lama sudah dimatikan karena menjawab soal keuangan seolah
 * nyata. Yang dibutuhkan kebanyakan pemilik sebenarnya jawaban pasti untuk
 * pertanyaan yang berulang -- ditulis di sini, dan bisa dicari.
 *
 * Setiap jawaban harus benar untuk aplikasi HARI INI. Kalau perilakunya
 * berubah, jawabannya ikut diubah di sini.
 */

export type FaqCategory = "mulai" | "mencatat" | "laporan" | "dokumen" | "data";

export type FaqEntry = {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  link?: { href: string; label: string };
  /** Kata lain yang dipakai orang untuk hal yang sama. */
  keywords?: string[];
};

export const faqCategories: Array<{ id: FaqCategory; label: string }> = [
  { id: "mulai", label: "Mulai" },
  { id: "mencatat", label: "Mencatat" },
  { id: "laporan", label: "Laporan & tutup kas" },
  { id: "dokumen", label: "Dokumen & izin" },
  { id: "data", label: "Data & keamanan" },
];

export const faqEntries: FaqEntry[] = [
  {
    id: "apa-ini",
    category: "mulai",
    question: "Aplikasi ini sebenarnya untuk apa?",
    answer: "Anda mencatat uang masuk dan uang keluar seperti biasa. Aplikasi menyusun pembukuannya di belakang layar dalam bentuk yang dimengerti bank dan koperasi. Aplikasi ini tidak menilai usaha Anda dan tidak memutuskan apa pun soal pinjaman.",
    keywords: ["fungsi", "kegunaan", "manfaat"],
  },
  {
    id: "kondisi-awal",
    category: "mulai",
    question: "Apa itu kondisi awal, dan kenapa perlu diisi?",
    answer: "Kondisi awal adalah titik mulai: uang di laci, saldo rekening, siapa yang berutang ke Anda, utang Anda, perkiraan stok, dan alat usaha. Diisi sekali saja. Tanpa itu, laporan tidak tahu Anda mulai dari mana. Perkiraan kasar sudah cukup.",
    link: { href: "/umkm/profil/kondisi-awal", label: "Isi kondisi awal" },
    keywords: ["saldo awal", "modal awal", "neraca awal"],
  },
  {
    id: "catat-suara",
    category: "mencatat",
    question: "Bagaimana cara mencatat dengan suara?",
    answer: "Buka Catat, tekan tombol mikrofon, lalu ceritakan transaksinya seperti ke teman — misalnya « laku 15 porsi 300 ribu, beli minyak 50 ribu ». Tekan Selesai. Hasilnya selalu Anda periksa dulu sebelum disimpan, dan setiap baris bisa diubah atau dihapus.",
    link: { href: "/umkm/catat", label: "Buka Catat" },
    keywords: ["rekam", "mikrofon", "ngomong", "bicara"],
  },
  {
    id: "tanpa-ai",
    category: "mencatat",
    question: "Bisakah mencatat tanpa suara dan tanpa AI?",
    answer: "Bisa. Di Catat pilih Tulis, lalu « Isi formulir sendiri ». Formulirnya sama dengan tombol Catat transaksi di Buku Kas: pilih untuk apa uangnya, isi nominal, tanggal, dan cara bayar.",
    link: { href: "/umkm/catat?mode=tulis", label: "Tulis transaksi" },
    keywords: ["manual", "ketik", "formulir"],
  },
  {
    id: "salah-kategori",
    category: "mencatat",
    question: "Saya salah pilih kategori atau nominal. Bisa diperbaiki?",
    answer: "Bisa, selama kas hari itu belum ditutup. Buka Buku Kas, cari transaksinya, tekan Ubah, dan tulis alasannya. Angka lama tidak dihapus — tersimpan sebagai riwayat perubahan. Kalau kas sudah ditutup, batalkan transaksinya dengan alasan lalu catat ulang.",
    link: { href: "/umkm/laporan?tab=kas", label: "Buka Buku Kas" },
    keywords: ["edit", "ubah", "koreksi", "keliru"],
  },
  {
    id: "ambil-rumah",
    category: "mencatat",
    question: "Kenapa untung saya tidak berubah padahal saya ambil uang untuk rumah?",
    answer: "Memang begitu seharusnya. Uang yang diambil untuk rumah mengurangi modal usaha, bukan untung. Pilih kategori « Ambil untuk rumah » supaya tercatat terpisah.",
    keywords: ["prive", "belanja rumah", "keperluan pribadi"],
  },
  {
    id: "ngutang",
    category: "mencatat",
    question: "Pelanggan membeli tapi belum bayar. Dicatat bagaimana?",
    answer: "Pilih kategori « Ngutangin pelanggan » dan tulis namanya. Saat dia membayar, catat dengan kategori « Piutang dibayar ». Daftar pelanggan yang belum bayar tampil di Laporan, tab Bulan ini.",
    keywords: ["piutang", "hutang pelanggan", "bon", "kasbon"],
  },
  {
    id: "tutup-kas",
    category: "laporan",
    question: "Apa itu tutup kas, dan harus setiap hari?",
    answer: "Tutup kas mencocokkan uang di laci dengan catatan hari itu. Hitung uang fisik, ketik angkanya, dan aplikasi menampilkan selisihnya. Setelah ditutup, transaksi hari itu tidak bisa diubah — ini yang membuat catatan Anda dipercaya pihak lain. Boleh dilewati kalau belum sempat.",
    link: { href: "/umkm/laporan", label: "Buka Laporan" },
    keywords: ["closing", "cocokkan kas", "selisih"],
  },
  {
    id: "hitung-stok",
    category: "laporan",
    question: "Kenapa saya diminta menghitung sisa stok akhir bulan?",
    answer: "Belanja bahan langsung dihitung sebagai biaya pada hari dibeli. Kalau di akhir bulan masih ada sisa bahan, sisa itu belum terpakai. Tanpa dihitung, untung bulan itu terlihat lebih kecil dari kenyataan. Perkiraan kasar sudah cukup.",
    keywords: ["stok", "persediaan", "sisa bahan"],
  },
  {
    id: "pdf-bank",
    category: "laporan",
    question: "Berkas PDF untuk bank bisa dipakai mengajukan pinjaman?",
    answer: "Berkas di tab Untuk bank memuat catatan Anda dalam format laporan keuangan yang dimengerti lembaga. Diterima atau tidak sepenuhnya keputusan lembaga tersebut — aplikasi ini tidak menjanjikan apa pun soal itu.",
    link: { href: "/umkm/laporan", label: "Buka Laporan" },
    keywords: ["kredit", "kur", "pinjaman", "laporan keuangan"],
  },
  {
    id: "unduh-data",
    category: "laporan",
    question: "Bagaimana mengunduh catatan saya ke Excel?",
    answer: "Buka Buku Kas, pilih rentang tanggal, lalu tekan Unduh CSV. Berkas CSV bisa dibuka di Excel atau Google Sheets.",
    link: { href: "/umkm/laporan?tab=kas", label: "Buka Buku Kas" },
    keywords: ["excel", "csv", "ekspor", "export"],
  },
  {
    id: "dokumen-apa",
    category: "dokumen",
    question: "Dokumen apa saja yang sebaiknya saya simpan?",
    answer: "Yang bertanda « Fondasi » paling dibutuhkan lembaga, misalnya KTP, NIB, dan NPWP. Izin seperti PIRT atau sertifikat halal disarankan untuk usaha pangan. NIB bisa diurus sendiri secara gratis lewat OSS.",
    link: { href: "/umkm/profil/dokumen", label: "Buka Dokumen" },
    keywords: ["nib", "npwp", "pirt", "halal", "legalitas", "izin usaha"],
  },
  {
    id: "masa-berlaku",
    category: "dokumen",
    question: "Bisakah saya diingatkan sebelum izin habis?",
    answer: "Bisa. Di kartu PIRT, sertifikat halal, atau izin edar, isi tanggal berlakunya. Pengingat muncul di Beranda 30 hari sebelum habis.",
    link: { href: "/umkm/profil/dokumen", label: "Isi masa berlaku" },
    keywords: ["kedaluwarsa", "expired", "perpanjang"],
  },
  {
    id: "lembaga-lihat",
    category: "data",
    question: "Siapa yang bisa melihat data usaha saya?",
    answer: "Tidak ada lembaga yang bisa melihat data Anda tanpa izin. Permintaan akses ditinjau admin platform, dan Anda diberi tahu setiap keputusannya. Yang dilihat lembaga adalah ringkasan, bukan catatan harian Anda. Semua izin, program, dan riwayat akses ada di layar Izin & program.",
    link: { href: "/umkm/profil/izin", label: "Buka Izin & program" },
    keywords: ["privasi", "izin", "akses", "bank lihat"],
  },
  {
    id: "cabut-izin",
    category: "data",
    question: "Bagaimana mencabut izin lembaga atau keluar dari program?",
    answer: "Buka Izin & program. Setiap lembaga yang punya akses punya tombol Cabut akses, dan setiap program punya tombol Keluar. Pencabutan berlaku seketika dan lembaganya diberi tahu.",
    link: { href: "/umkm/profil/izin", label: "Buka Izin & program" },
    keywords: ["hentikan", "stop", "tarik izin"],
  },
  {
    id: "aman",
    category: "data",
    question: "Apakah data saya aman?",
    answer: "Dokumen dan rekaman suara disimpan di penyimpanan privat, bukan tautan yang bisa dibuka siapa saja. Setiap kali lembaga membuka data Anda, tercatat di Riwayat akses. Anda juga bisa mengunduh seluruh data Anda atau menghapus akun dari halaman Profil.",
    link: { href: "/umkm/profil", label: "Buka Profil" },
    keywords: ["keamanan", "hapus akun", "unduh data"],
  },
];

function normalize(value: string) {
  return value.toLocaleLowerCase("id-ID").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Pencarian sederhana: setiap kata harus muncul di pertanyaan, jawaban, atau
 * kata kuncinya. Yang cocok di pertanyaan tampil lebih dulu.
 */
export function searchFaq(query: string, category: FaqCategory | "semua" = "semua"): FaqEntry[] {
  const words = normalize(query).split(" ").filter(Boolean);
  const pool = category === "semua" ? faqEntries : faqEntries.filter((entry) => entry.category === category);
  if (words.length === 0) return pool;
  return pool
    .map((entry) => {
      const question = normalize(entry.question);
      const rest = normalize(`${entry.answer} ${(entry.keywords ?? []).join(" ")}`);
      const matches = words.every((word) => question.includes(word) || rest.includes(word));
      const score = words.filter((word) => question.includes(word)).length;
      return { entry, matches, score };
    })
    .filter((item) => item.matches)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry);
}
