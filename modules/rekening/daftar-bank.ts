import type { SearchableOption } from "@/components/SearchableSelect";

/**
 * Bank umum yang beroperasi di Indonesia, untuk pilihan rekening usaha.
 *
 * `value` adalah nama yang DISIMPAN ke `business_bank_accounts.bank_name` dan
 * dijumlahkan di portal admin. Sebelas nama pertama sudah dipakai sejak daftar
 * pendek lama; ejaannya jangan diubah, atau rekening yang sudah tercatat
 * tidak lagi dikenali dan jatuh ke « Bank lain ».
 *
 * Urutannya: bank yang paling sering dipakai UMKM lebih dulu, lalu bank
 * pembangunan daerah, lalu sisanya menurut abjad. Pencarian mencocokkan nama,
 * nama lengkap, dan singkatannya.
 *
 * BPR, BPRS, dan koperasi tidak didaftar -- jumlahnya ribuan. Mereka memakai
 * « Bank lain » dan menulis namanya sendiri.
 *
 * Disusun dari daftar bank umum OJK; merger dan ganti nama terjadi beberapa
 * kali setahun, jadi periksa ulang sesekali.
 */
const bank = (value: string, hint?: string, keywords?: string): SearchableOption => ({ value, hint, keywords });

const BANK_UTAMA: SearchableOption[] = [
  bank("BRI", "Bank Rakyat Indonesia", "bbri britama simpedes"),
  bank("BNI", "Bank Negara Indonesia", "bbni taplus"),
  bank("Bank Mandiri", "Bank Mandiri (Persero)", "bmri livin"),
  bank("BCA", "Bank Central Asia", "bbca tahapan"),
  bank("BSI", "Bank Syariah Indonesia", "bris syariah"),
  bank("BTN", "Bank Tabungan Negara", "bbtn"),
  bank("Bank Jago", "Bank Jago", "gopay jago syariah"),
  bank("SeaBank", "SeaBank Indonesia", "shopee bke"),
  bank("Bank Jatim", "BPD Jawa Timur", "bpd jawa timur"),
  bank("Bank BJB", "BPD Jawa Barat dan Banten", "bpd jawa barat bjb"),
  bank("Bank DKI", "BPD DKI Jakarta", "bpd jakarta jakone"),
];

const BANK_DAERAH: SearchableOption[] = [
  bank("Bank Aceh Syariah", "BPD Aceh", "bpd aceh"),
  bank("Bank Sumut", "BPD Sumatera Utara", "bpd sumatera utara"),
  bank("Bank Nagari", "BPD Sumatera Barat", "bpd sumatera barat padang"),
  bank("Bank Riau Kepri Syariah", "BPD Riau dan Kepulauan Riau", "bpd riau kepri brk"),
  bank("Bank Jambi", "BPD Jambi", "bpd jambi"),
  bank("Bank Sumsel Babel", "BPD Sumatera Selatan dan Bangka Belitung", "bpd sumatera selatan palembang bangka"),
  bank("Bank Bengkulu", "BPD Bengkulu", "bpd bengkulu"),
  bank("Bank Lampung", "BPD Lampung", "bpd lampung"),
  bank("Bank Banten", "BPD Banten", "bpd banten"),
  bank("Bank BJB Syariah", "BPD Jawa Barat Syariah", "bpd jawa barat syariah"),
  bank("Bank Jateng", "BPD Jawa Tengah", "bpd jawa tengah"),
  bank("Bank BPD DIY", "BPD Daerah Istimewa Yogyakarta", "bpd yogyakarta jogja"),
  bank("Bank BPD Bali", "BPD Bali", "bpd bali"),
  bank("Bank NTB Syariah", "BPD Nusa Tenggara Barat", "bpd ntb nusa tenggara barat"),
  bank("Bank NTT", "BPD Nusa Tenggara Timur", "bpd ntt nusa tenggara timur"),
  bank("Bank Kalbar", "BPD Kalimantan Barat", "bpd kalimantan barat"),
  bank("Bank Kalteng", "BPD Kalimantan Tengah", "bpd kalimantan tengah"),
  bank("Bank Kalsel", "BPD Kalimantan Selatan", "bpd kalimantan selatan"),
  bank("Bank Kaltimtara", "BPD Kalimantan Timur dan Utara", "bpd kalimantan timur utara kaltim"),
  bank("Bank Sulselbar", "BPD Sulawesi Selatan dan Barat", "bpd sulawesi selatan barat makassar"),
  bank("Bank Sulteng", "BPD Sulawesi Tengah", "bpd sulawesi tengah"),
  bank("Bank SulutGo", "BPD Sulawesi Utara dan Gorontalo", "bpd sulawesi utara gorontalo"),
  bank("Bank Sultra", "BPD Sulawesi Tenggara", "bpd sulawesi tenggara"),
  bank("Bank Maluku Malut", "BPD Maluku dan Maluku Utara", "bpd maluku"),
  bank("Bank Papua", "BPD Papua", "bpd papua"),
];

const BANK_LAIN: SearchableOption[] = [
  bank("Allo Bank", "Allo Bank Indonesia"),
  bank("Bank Aladin Syariah", "Bank Aladin Syariah", "alami"),
  bank("Bank Amar", "Bank Amar Indonesia", "tunaiku"),
  bank("Bank Artha Graha", "Bank Artha Graha Internasional"),
  bank("Bank BCA Syariah", "BCA Syariah"),
  bank("Bank BTPN Syariah", "BTPN Syariah", "tepat"),
  bank("Bank Bumi Arta", "Bank Bumi Arta"),
  bank("Bank Capital", "Bank Capital Indonesia"),
  bank("Bank China Construction", "China Construction Bank Indonesia", "ccb"),
  bank("Bank CTBC", "CTBC Indonesia"),
  bank("Bank Danamon", "Bank Danamon Indonesia", "adira"),
  bank("Bank DBS", "Bank DBS Indonesia", "digibank"),
  bank("Bank Ganesha", "Bank Ganesha"),
  bank("Bank IBK", "Bank IBK Indonesia"),
  bank("Bank ICBC", "Bank ICBC Indonesia"),
  bank("Bank Ina Perdana", "Bank Ina Perdana"),
  bank("Bank Index Selindo", "Bank Index Selindo"),
  bank("Bank JTrust", "Bank JTrust Indonesia"),
  bank("Bank KB", "KB Bank (dulu Bukopin)", "bukopin kb bukopin"),
  bank("Bank KB Syariah", "KB Bank Syariah (dulu Bukopin Syariah)", "bukopin syariah"),
  bank("Bank KEB Hana", "Bank KEB Hana Indonesia", "line bank hana"),
  bank("Bank Mandiri Taspen", "Bank Mandiri Taspen", "mantap"),
  bank("Bank Maspion", "Bank Maspion Indonesia"),
  bank("Bank Mayapada", "Bank Mayapada Internasional"),
  bank("Bank Maybank", "Maybank Indonesia", "bii"),
  bank("Bank Mega", "Bank Mega"),
  bank("Bank Mega Syariah", "Bank Mega Syariah"),
  bank("Bank Mestika", "Bank Mestika Dharma"),
  bank("Bank MNC", "Bank MNC Internasional", "motion"),
  bank("Bank Muamalat", "Bank Muamalat Indonesia", "syariah"),
  bank("Bank Multiarta Sentosa", "Bank Multiarta Sentosa", "mas"),
  bank("Bank Nano Syariah", "Bank Nano Syariah"),
  bank("Bank Neo Commerce", "Bank Neo Commerce", "bnc neobank"),
  bank("Bank Nobu", "Bank Nationalnobu", "nationalnobu"),
  bank("Bank OCBC", "Bank OCBC Indonesia (dulu OCBC NISP)", "nisp commonwealth"),
  bank("Bank Oke", "Bank Oke Indonesia"),
  bank("Bank Panin", "Panin Bank", "pan indonesia"),
  bank("Bank Panin Dubai Syariah", "Panin Dubai Syariah"),
  bank("Bank Permata", "PermataBank"),
  bank("Bank Raya", "Bank Raya Indonesia", "bri agro"),
  bank("Bank Resona Perdania", "Bank Resona Perdania"),
  bank("Bank Sahabat Sampoerna", "Bank Sahabat Sampoerna"),
  bank("Bank Saqu", "Bank Jasa Jakarta", "jasa jakarta astra"),
  bank("Bank Shinhan", "Bank Shinhan Indonesia"),
  bank("Bank Sinarmas", "Bank Sinarmas", "simobi"),
  bank("Bank Syariah Nasional", "BTN Syariah", "btn syariah bsn"),
  bank("Bank UOB", "Bank UOB Indonesia", "tmrw"),
  bank("Bank Victoria", "Bank Victoria International"),
  bank("Bank Woori Saudara", "Bank Woori Saudara Indonesia", "bws"),
  bank("blu by BCA Digital", "BCA Digital", "blu bca digital"),
  bank("CIMB Niaga", "Bank CIMB Niaga", "octo niaga"),
  bank("Citibank", "Citibank Indonesia", "citi"),
  bank("HSBC", "HSBC Indonesia"),
  bank("Hibank", "Bank Hibank Indonesia", "mayora"),
  bank("Krom Bank", "Krom Bank Indonesia", "kroma"),
  bank("Bank Mizuho", "Bank Mizuho Indonesia"),
  bank("SMBC Indonesia", "SMBC Indonesia (dulu BTPN)", "btpn jenius"),
  bank("Standard Chartered", "Standard Chartered Indonesia", "stanchart"),
  bank("Superbank", "Super Bank Indonesia", "grab emtek"),
].sort((a, b) => a.value.localeCompare(b.value, "id"));

export const DAFTAR_BANK: readonly SearchableOption[] = [...BANK_UTAMA, ...BANK_DAERAH, ...BANK_LAIN];
