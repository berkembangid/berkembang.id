/**
 * Tipe data dokumen dossier usaha yang siap dicetak sebagai PDF ringkas (1–2 halaman).
 *
 * Berbeda dari StatementDocumentData (laporan keuangan SAK EMKM multi-halaman),
 * dossier ini adalah ringkasan eksekutif profil usaha yang dirancang untuk
 * dibaca lembaga/investor dalam hitungan menit.
 */

export type LegalitasItem = {
  /** Nama jenis dokumen, mis. "KTP Pemilik", "NIB", "NPWP", "Halal", "PIRT" */
  label: string;
  /** Status ketersediaan/verifikasi */
  status: "verified" | "available" | "unavailable";
  /** Detail tambahan: tanggal konfirmasi, nomor tersamar, atau nama sertifikat */
  detail?: string;
};

export type FinancialSummaryRow = {
  /** Label baris, mis. "Total Pendapatan (6 Bln)" */
  label: string;
  /** Nilai dalam Rupiah */
  amountIdr: number;
};

export type DossierDocumentData = {
  /** ID unik dokumen (internal, tidak tercetak) */
  documentId: string;
  /** Nomor dokumen yang tercetak di kaki halaman */
  documentUid: string;
  /** Waktu cetak ISO-8601 */
  printedAt: string;
  /** Periode snapshot keuangan */
  period: { from: string; to: string };

  // ── Identitas Usaha ──────────────────────────────────────────────────────
  businessName: string;
  /** Nama pemilik (dari snapshot atau fallback ke email) */
  ownerName: string | null;
  /** Bentuk usaha, mis. "Perorangan", "CV", "PT" */
  businessForm: string | null;
  /** Sektor usaha dari snapshot */
  sector: string | null;
  /** Kota/kabupaten */
  city: string | null;
  /** Tahun mulai usaha */
  yearStarted: number | null;
  /** Jumlah karyawan */
  employeeCount: number | null;
  /** Kontak: email */
  contactEmail: string | null;
  /** Kontak: WhatsApp atau nomor telepon */
  contactPhone: string | null;

  // ── Kesiapan Usaha ───────────────────────────────────────────────────────
  /** Level kesiapan: "Mulai", "Tembaga", "Perak", "Emas" atau null jika belum dihitung */
  readinessLevel: string | null;
  /** Skor kesiapan 0–100 */
  readinessScore: number | null;
  /** Tanggal penghitungan kesiapan */
  readinessDate: string | null;

  // ── Legalitas & Perizinan ────────────────────────────────────────────────
  legalitas: LegalitasItem[];

  // ── Ringkasan Keuangan ───────────────────────────────────────────────────
  financialRows: FinancialSummaryRow[];
  /** Jumlah total transaksi dalam periode */
  transactionCount: number | null;
  /** Rasio transaksi non-tunai / QRIS (0–1), null jika tidak ada data */
  noncashRatio: number | null;

  // ── Kualitas Data ────────────────────────────────────────────────────────
  /** Jumlah hari aktif mencatat dalam 6 bulan */
  daysRecorded: number | null;
  /** Apakah ada bukti transaksi (foto/dokumen) yang tertaut */
  hasEvidence: boolean;
};
