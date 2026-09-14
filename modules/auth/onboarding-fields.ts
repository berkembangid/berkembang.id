/**
 * Pertanyaan onboarding, pilihan jawabannya, dan kunci metadata pendaftaran --
 * satu tempat untuk kedua jalur masuk.
 *
 * KENAPA DISATUKAN, DAN INI BUKAN SOAL KERAPIAN.
 *
 * Ada dua jalur mendaftar: surel + kata sandi (`app/auth/register`) dan Google
 * (`app/auth/lengkapi`). Keduanya harus menghasilkan akun yang SAMA, karena
 * keduanya dibaca `lib/auth/bootstrap.ts` yang tidak tahu dari mana orangnya
 * datang.
 *
 * Ketika keduanya menulis metadatanya sendiri-sendiri, mereka berselisih -- dan
 * sudah terjadi: `/auth/lengkapi` menulis `jenis_institusi` untuk investor,
 * sementara `bootstrap.ts` membaca `jenis_investor`. Akibatnya setiap investor
 * yang mendaftar lewat Google kehilangan jenis yang ia pilih dan jatuh ke
 * "Investor / Offtaker" apa adanya. Tidak ada galat, tidak ada yang tahu.
 *
 * Kunci-kunci di bawah adalah KONTRAK dengan `bootstrap.ts`. Salah menuliskan
 * satu kunci tidak menggagalkan apa pun -- ia hanya membuat jawaban pemilik
 * hilang diam-diam. Karena itu ia ditulis sekali di sini, dan kedua layar
 * memanggilnya.
 */

export const SECTORS = [
  "Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya",
] as const;

export const BUSINESS_FORMS = [
  { value: "perorangan", label: "Usaha perorangan" },
  { value: "badan_usaha", label: "Badan usaha (PT/CV/Koperasi)" },
] as const;

export const HEADCOUNTS = [
  { value: "sendiri", label: "Saya sendiri" },
  { value: "1-4", label: "1–4 orang" },
  { value: "5-19", label: "5–19 orang" },
] as const;

export const CHANNELS = [
  { value: "warung", label: "Warung / kios" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "marketplace", label: "Marketplace" },
  { value: "media_sosial", label: "Media sosial" },
] as const;

export const INVESTOR_TYPES = [
  "Modal Ventura (VC)", "Angel Investor", "Perusahaan Offtaker / Buyer",
  "Korporasi", "Koperasi / Agregator", "Lainnya",
] as const;

export const CURRENT_YEAR = new Date().getFullYear();

/** Jawaban tentang usahanya: dua langkah pertanyaan, satu bentuk data. */
export type UmkmOnboardingAnswers = {
  ownerName: string;
  businessName: string;
  sector: string;
  city: string;
  /** Langkah kedua. Kosong berarti belum ditanya, bukan dijawab kosong. */
  address: string;
  phone: string;
  businessForm: string;
  /** Teks, karena itu yang keluar dari kotak isian. Diubah ke angka di bawah. */
  startYear: string;
  headcount: string;
  channels: string[];
};

export type InvestorOnboardingAnswers = {
  contactName: string;
  companyName: string;
  type: string;
  city: string;
};

/** Nilai awal, supaya kedua layar mulai dari keadaan yang sama. */
export const EMPTY_UMKM_DETAIL = {
  businessForm: "perorangan",
  startYear: "",
  headcount: "",
  address: "",
  phone: "",
  channels: [] as string[],
};

/**
 * Pesan galat langkah "kenalkan usaha Anda".
 *
 * Mengembalikan `null` bila tidak ada masalah. Dipakai kedua layar supaya
 * pemilik tidak menerima dua kalimat berbeda untuk kesalahan yang sama.
 */
export function umkmIdentityError(answers: Pick<UmkmOnboardingAnswers, "businessName" | "city">): string | null {
  if (!answers.businessName.trim() || !answers.city.trim()) {
    return "Isi nama usaha dan kota atau kabupaten usaha.";
  }
  return null;
}

/** Pesan galat langkah "cara usaha Anda berjalan". */
export function umkmDetailError(
  answers: Pick<UmkmOnboardingAnswers, "startYear" | "phone" | "address" | "channels">,
): string | null {
  const year = Number(answers.startYear);
  if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR) {
    return `Isi tahun mulai usaha antara 1900 dan ${CURRENT_YEAR}.`;
  }
  if (!answers.phone.trim()) return "Isi nomor WhatsApp yang bisa dihubungi.";
  if (!answers.address.trim()) return "Isi alamat tempat usaha.";
  if (answers.channels.length === 0) return "Pilih minimal satu tempat pembeli menemukan usaha Anda.";
  return null;
}

export function investorError(answers: Pick<InvestorOnboardingAnswers, "companyName" | "city">): string | null {
  if (!answers.companyName.trim() || !answers.city.trim()) {
    return "Isi nama perusahaan / entitas dan kota atau kabupaten.";
  }
  return null;
}

/**
 * Metadata pendaftaran pemilik usaha, dalam bentuk yang dibaca
 * `lib/auth/bootstrap.ts`.
 *
 * Jangan menambahkan kunci di sini tanpa menambahkannya juga di `bootstrap.ts`:
 * kunci yang tidak dibaca siapa pun terlihat seperti jawaban yang tersimpan,
 * padahal ia hilang begitu pendaftaran selesai.
 */
export function umkmSignupMetadata(answers: UmkmOnboardingAnswers) {
  return {
    nama_pemilik: answers.ownerName.trim(),
    nama_usaha: answers.businessName.trim(),
    sektor_usaha: answers.sector,
    lokasi: answers.city,
    alamat: answers.address.trim(),
    phone: answers.phone.trim(),
    bentuk_usaha: answers.businessForm,
    tahun_mulai_usaha: Number(answers.startYear),
    // Kosong dikirim sebagai null, bukan sebagai "" -- kolomnya bertipe enum
    // dan string kosong bukan salah satu nilainya.
    jumlah_karyawan: answers.headcount || null,
    kanal_penjualan: answers.channels,
    signup_account_type: "umkm" as const,
  };
}

export function investorSignupMetadata(answers: InvestorOnboardingAnswers) {
  return {
    nama_contact: answers.contactName.trim(),
    nama_perusahaan: answers.companyName.trim(),
    nama_institusi: answers.companyName.trim(),
    // `jenis_investor`, BUKAN `jenis_institusi`. `bootstrap.ts` membaca kunci
    // ini; `/auth/lengkapi` dulu menulis nama yang salah, dan jenis yang
    // dipilih setiap investor Google terbuang tanpa jejak.
    jenis_investor: answers.type,
    lokasi: answers.city,
    signup_account_type: "investor" as const,
  };
}
