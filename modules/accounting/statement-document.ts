/**
 * Dokumen laporan keuangan SAK EMKM yang siap dicetak.
 *
 * Isinya berurutan: Laporan Posisi Keuangan, Laporan Laba Rugi, Laporan Arus
 * Kas, Catatan atas Laporan Keuangan, lampiran indikator, dan lampiran
 * metodologi. Setiap halaman memuat nama usaha, periode, tanggal cetak, ID
 * dokumen, dan pernyataan batas penggunaan.
 *
 * Berkas ini menyimpan teks tetap dan bentuk datanya. Perenderan menjadi byte
 * PDF ada di `statement-pdf.tsx`; keduanya dipisah supaya teks kebijakan
 * akuntansi bisa ditinjau bahasanya tanpa menyentuh kode tata letak, dan
 * supaya route `reports/notes` bisa memakai teksnya tanpa memuat mesin PDF.
 */

import type { BalanceSheetView, CashFlowView } from "@/modules/accounting/balance-sheet";
import type { IncomeStatementView } from "@/modules/accounting/reports";
import type { NotesPayload } from "@/modules/accounting/period";
import type { IndicatorMonthlyRow } from "@/modules/accounting/period";

/** Catatan 2: ikhtisar kebijakan akuntansi. Teks tetap, ditinjau manusia. */
export const accountingPolicyNotes = [
  {
    title: "Pernyataan kepatuhan",
    body: "Laporan keuangan disusun sesuai Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM).",
  },
  {
    title: "Dasar penyusunan",
    body: "Dasar pengukuran adalah biaya historis. Laporan disusun dengan dasar akrual, kecuali informasi arus kas.",
  },
  {
    title: "Kas dan setara kas",
    body: "Kas meliputi uang tunai di tempat usaha dan saldo pada rekening bank serta dompet digital yang dapat dicairkan sewaktu-waktu.",
  },
  {
    title: "Piutang usaha",
    body: "Piutang usaha dicatat sebesar nilai yang tertagih dari pelanggan. Entitas tidak membentuk penyisihan piutang tak tertagih.",
  },
  {
    title: "Persediaan",
    body: "Persediaan diukur pada biaya perolehan dengan sistem periodik. Nilai akhir periode ditetapkan berdasarkan hitungan fisik yang dilakukan pemilik.",
  },
  {
    title: "Aset tetap",
    body: "Aset tetap dicatat sebesar biaya perolehan dan disusutkan dengan metode garis lurus sepanjang umur manfaatnya: peralatan 48 bulan, mesin dan kendaraan 96 bulan, bangunan 240 bulan.",
  },
  {
    title: "Pengakuan pendapatan",
    body: "Pendapatan diakui pada saat barang diserahkan kepada pelanggan, baik pembayarannya diterima saat itu maupun menjadi piutang.",
  },
  {
    title: "Pajak penghasilan",
    body: "Beban pajak penghasilan dihitung mengikuti PP 55/2022 dan disajikan sebagai estimasi.",
  },
] as const;

/**
 * Kebijakan bukti transaksi (spek Bagian 8).
 *
 * Dipisahkan dari daftar tetap di atas karena kalimat ini hanya boleh muncul
 * bila usahanya memang punya bukti yang tertaut. Menuliskannya pada laporan
 * yang tidak punya satu pun lampiran adalah klaim yang tidak benar, dan
 * catatan atas laporan keuangan adalah tempat terakhir yang boleh berisi
 * kalimat yang tidak bisa ditunjukkan buktinya.
 */
export const evidencePolicyNote = {
  title: "Bukti transaksi",
  body: "Transaksi didukung bukti digital yang tertaut pada jurnal. Bukti disimpan pada penyimpanan privat entitas dan dapat ditelusuri dari setiap catatan jurnal yang bersangkutan.",
} as const;

/**
 * Ikhtisar kebijakan yang benar-benar dicetak untuk satu laporan.
 *
 * Delapan kebijakan tetap selalu ada; yang kesembilan menyusul hanya bila ada
 * buktinya.
 */
export function accountingPolicyNotesFor(options: { hasEvidence: boolean }) {
  return options.hasEvidence
    ? [...accountingPolicyNotes, evidencePolicyNote]
    : [...accountingPolicyNotes];
}


/**
 * Versi rumus indikator. Harus sama persis dengan
 * `private.indicator_formula_version()` di migrasi 0036; test kontrak migrasi
 * yang menjaganya. Basis data tetap pemegang keputusannya — konstanta ini ada
 * supaya lampiran PDF bisa mencetak versinya tanpa satu kueri tambahan.
 */
export const indicatorFormulaVersion = "indikator-v1";

/**
 * Rumus setiap indikator, dicetak apa adanya di lampiran metodologi.
 *
 * Alasannya bukan kelengkapan dokumen. Pembaca berkas ini — pendamping,
 * koperasi, petugas bank — berhak memeriksa apakah angkanya berarti seperti
 * yang mereka kira, tanpa harus mempercayai aplikasinya. Indikator yang tidak
 * bisa diperiksa rumusnya tidak lebih baik daripada skor tertutup, dan itu
 * persis yang tidak boleh dihasilkan produk ini.
 */
export const indicatorFormulas = [
  {
    name: "Pendapatan",
    formula: "jumlah kredit akun 4100 dan 4200, dikurangi debitnya",
    note: "Penjualan tunai maupun yang menjadi piutang, keduanya dihitung pada bulan barangnya diserahkan.",
  },
  {
    name: "Beban pokok",
    formula: "jumlah debit akun 5100, dikurangi kreditnya",
    note: "Belanja bahan dibebankan saat dibeli, lalu dikoreksi hitungan stok akhir bulan.",
  },
  {
    name: "Beban usaha",
    formula: "jumlah debit akun 52xx, dikurangi kreditnya",
    note: "Termasuk penyusutan alat usaha (5280), yang bukan pengeluaran uang.",
  },
  {
    name: "Beban bunga",
    formula: "jumlah debit akun 5310, dikurangi kreditnya",
    note: "Hanya bagian bunga dari cicilan; pokoknya mengurangi utang, bukan laba.",
  },
  {
    name: "Laba bersih",
    formula: "seluruh akun 4xxx (kredit − debit) − seluruh akun 5xxx (debit − kredit)",
    note: "Sudah termasuk beban pajak penghasilan. Pengambilan pemilik tidak pernah masuk ke sini.",
  },
  {
    name: "Ambilan pemilik",
    formula: "jumlah debit akun 3200, dikurangi kreditnya",
    note: "Uang yang dibawa pulang untuk keperluan rumah. Mengurangi modal, bukan laba.",
  },
  {
    name: "Modal masuk",
    formula: "jumlah kredit akun 3100 dikurangi debitnya, tanpa entry saldo awal",
    note: "Entry saldo awal dikecualikan: penyeimbang kondisi awal bukan uang yang baru disetorkan.",
  },
  {
    name: "Piutang baru",
    formula: "jumlah debit akun 1300, dikurangi kreditnya",
    note: "Penjualan yang belum dibayar pelanggan pada bulan itu.",
  },
  {
    name: "Penjualan lewat rekening",
    formula: "jumlah pendapatan pada entry yang mendebit akun 1200",
    note: "Penjualan yang menjadi piutang tidak dihitung di sini; ia dilaporkan sebagai piutang baru.",
  },
  {
    name: "Rasio penjualan lewat rekening",
    formula: "penjualan lewat rekening ÷ seluruh pendapatan",
    note: "Kosong, bukan nol, pada bulan tanpa penjualan sama sekali.",
  },
  {
    name: "Hari tercatat",
    formula: "jumlah tanggal berbeda yang punya jurnal pada bulan itu",
    note: "Menggambarkan keteraturan mencatat, bukan jumlah hari usaha buka.",
  },
] as const;

export const statementDisclaimer =
  "Laporan ini disusun dari catatan pemilik melalui BERKEMBANG.ID, belum diaudit, dan bukan penilaian kelayakan pembiayaan.";

export type StatementDocumentData = {
  documentId: string;
  printedAt: string;
  period: { from: string; to: string };
  comparisonPeriod: { from: string; to: string } | null;
  businessName: string;
  incomeStatement: { current: IncomeStatementView; previous: IncomeStatementView | null };
  balanceSheet: { current: BalanceSheetView; previous: BalanceSheetView | null };
  cashFlow: CashFlowView;
  notes: NotesPayload;
  indicators: IndicatorMonthlyRow[];
  includeIndicators: boolean;
  /** Menentukan apakah kalimat kebijakan bukti ikut dicetak. */
  hasEvidence: boolean;
};
