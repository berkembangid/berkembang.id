import "server-only";

/**
 * Template PDF Dossier Usaha – ringkasan eksekutif 1–2 halaman.
 *
 * Menggantikan `renderFinancialStatementsPdf` lama yang menghasilkan
 * laporan SAK EMKM multi-halaman. Dokumen ini dirancang untuk dibaca
 * investor atau dinas/lembaga: satu pandang, semua yang penting ada.
 *
 * Halaman 1: Identitas usaha, Kesiapan usaha, Legalitas & Perizinan.
 * Halaman 2: Ringkasan Keuangan 6 Bulan, Kualitas Data, Disclaimer.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { DossierDocumentData, LegalitasItem } from "@/modules/institution/dossier-document";

// ── Palet warna ────────────────────────────────────────────────────────────
const C = {
  navy: "#0b5f86",
  navyLight: "#d6eaf5",
  ink: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  faint: "#f1f5f9",
  verified: "#059669",
  unavailable: "#94a3b8",
  warning: "#d97706",
  white: "#ffffff",
} as const;

// ── StyleSheet ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 54,
    paddingHorizontal: 40,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.5,
    backgroundColor: C.white,
  },
  // Watermark cap lembaga di bagian atas halaman
  watermarkBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: C.navy,
    paddingVertical: 5,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  watermarkLeft: { color: C.white, fontSize: 7, fontFamily: "Helvetica-Bold" },
  watermarkRight: { color: C.navyLight, fontSize: 6.5 },
  // Footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.faint,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6.5,
    color: C.muted,
  },
  // Bagian / seksi
  section: {
    marginBottom: 10,
  },
  sectionHeader: {
    backgroundColor: C.navyLight,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginBottom: 5,
    borderLeftWidth: 2.5,
    borderLeftColor: C.navy,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Grid 2 kolom
  row2: { flexDirection: "row", marginBottom: 3 },
  cell: { width: "50%" },
  cellLabel: { fontSize: 7, color: C.muted, marginBottom: 1 },
  cellValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  // Judul halaman 1 (hero)
  heroBox: {
    borderWidth: 0.8,
    borderColor: C.navy,
    borderRadius: 3,
    padding: 10,
    marginBottom: 12,
    backgroundColor: C.faint,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.navy },
  heroSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  heroRight: { alignItems: "flex-end" },
  heroBadge: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    backgroundColor: C.navy,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 3,
  },
  heroBadgeScore: { fontSize: 7, color: C.navyLight, marginTop: 2, textAlign: "right" },
  // Tabel legalitas
  legalTable: { borderWidth: 0.5, borderColor: C.border, marginBottom: 4 },
  legalHead: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  legalHeadCell: { color: C.white, fontSize: 7, fontFamily: "Helvetica-Bold" },
  legalRow: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderTopWidth: 0.4,
    borderTopColor: C.border,
  },
  legalRowAlt: { backgroundColor: C.faint },
  legalLabel: { width: "35%", fontSize: 8 },
  legalStatus: { width: "25%", fontSize: 8 },
  legalDetail: { width: "40%", fontSize: 7.5, color: C.muted },
  statusVerified: { color: C.verified, fontFamily: "Helvetica-Bold" },
  statusAvailable: { color: C.warning },
  statusUnavailable: { color: C.unavailable },
  // Keuangan – kartu metrik
  metricsRow: { flexDirection: "row", marginBottom: 8 },
  metricCard: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 3,
    padding: 7,
    marginRight: 5,
    backgroundColor: C.faint,
  },
  metricCardLast: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 3,
    padding: 7,
    backgroundColor: C.faint,
  },
  metricLabel: { fontSize: 6.5, color: C.muted, marginBottom: 2 },
  metricValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.navy },
  metricSub: { fontSize: 6.5, color: C.muted, marginTop: 1 },
  // Tabel keuangan ringan
  finTable: { borderWidth: 0.5, borderColor: C.border, marginBottom: 8 },
  finRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderTopWidth: 0.4,
    borderTopColor: C.border,
  },
  finRowTotal: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: C.navy,
    backgroundColor: C.navyLight,
  },
  finLabel: { flex: 1, fontSize: 8 },
  finAmount: { fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right" },
  // Kualitas data
  qualityRow: { flexDirection: "row", marginBottom: 6 },
  qualityItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  qualityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  qualityText: { fontSize: 8 },
  // Disclaimer
  disclaimer: {
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    paddingTop: 6,
    marginTop: 4,
    fontSize: 6.5,
    color: C.muted,
    lineHeight: 1.4,
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────

function longDate(iso: string): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

function shortMonth(iso: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const [, month] = iso.slice(0, 10).split("-");
  return months[Number(month) - 1] ?? iso.slice(5, 7);
}

function idr(value: number): string {
  const abs = Math.round(Math.abs(value)).toLocaleString("id-ID");
  return value < 0 ? `(${abs})` : abs;
}

function idrMillion(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} M`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Jt`;
  return `Rp ${idr(value)}`;
}

function statusText(status: LegalitasItem["status"]): string {
  if (status === "verified") return "✓ Terverifikasi";
  if (status === "available") return "Tersedia";
  return "Tidak Ada";
}

function statusStyle(status: LegalitasItem["status"]) {
  if (status === "verified") return s.statusVerified;
  if (status === "available") return s.statusAvailable;
  return s.statusUnavailable;
}

// ── Komponen ───────────────────────────────────────────────────────────────

export type DossierWatermark = {
  institutionName: string;
  memberLabel: string;
  downloadedAt: string;
  documentUid: string;
};

function WatermarkBand({ watermark }: { watermark: DossierWatermark }) {
  return (
    <View style={s.watermarkBand} fixed>
      <Text style={s.watermarkLeft}>
        {watermark.institutionName} · Akses Lembaga
      </Text>
      <Text style={s.watermarkRight}>
        Dibuka oleh {watermark.memberLabel} · {longDate(watermark.downloadedAt.slice(0, 10))} · No. {watermark.documentUid}
      </Text>
    </View>
  );
}

function Footer({ data, watermark }: { data: DossierDocumentData; watermark: DossierWatermark }) {
  return (
    <View style={s.footer} fixed>
      <Text>BERKEMBANG.ID · Dossier Usaha · No. Dok {watermark.documentUid} · Dicetak {longDate(data.printedAt.slice(0, 10))}</Text>
      <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function IdentitasSection({ data }: { data: DossierDocumentData }) {
  const fields: Array<[string, string | null | number]> = [
    ["Nama Pemilik", data.ownerName],
    ["Bentuk Usaha", data.businessForm],
    ["Sektor Usaha", data.sector],
    ["Kota / Kabupaten", data.city],
    ["Tahun Berdiri", data.yearStarted ? String(data.yearStarted) : null],
    ["Jumlah Karyawan", data.employeeCount !== null ? `${data.employeeCount} orang` : null],
    ["Email Kontak", data.contactEmail],
    ["No. WhatsApp / Telp", data.contactPhone],
  ];
  return (
    <View style={s.section}>
      <SectionHeader title="Identitas Usaha & Pemilik" />
      <View style={s.row2}>
        {fields.slice(0, 6).map(([label, value], i) => (
          <View key={i} style={[s.cell, { paddingRight: i % 2 === 0 ? 8 : 0 }]}>
            <Text style={s.cellLabel}>{label}</Text>
            <Text style={s.cellValue}>{(value as string | null) ?? "—"}</Text>
          </View>
        ))}
      </View>
      <View style={s.row2}>
        {fields.slice(6).map(([label, value], i) => (
          <View key={i} style={[s.cell, { paddingRight: i % 2 === 0 ? 8 : 0 }]}>
            <Text style={s.cellLabel}>{label}</Text>
            <Text style={s.cellValue}>{(value as string | null) ?? "—"}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LegalitasSection({ data }: { data: DossierDocumentData }) {
  return (
    <View style={s.section}>
      <SectionHeader title="Portofolio Legalitas & Perizinan" />
      <View style={s.legalTable}>
        <View style={s.legalHead}>
          <Text style={[s.legalHeadCell, s.legalLabel]}>Jenis Dokumen</Text>
          <Text style={[s.legalHeadCell, s.legalStatus]}>Status</Text>
          <Text style={[s.legalHeadCell, s.legalDetail]}>Keterangan</Text>
        </View>
        {data.legalitas.map((item, i) => (
          <View key={i} style={[s.legalRow, i % 2 === 1 ? s.legalRowAlt : {}]} wrap={false}>
            <Text style={s.legalLabel}>{item.label}</Text>
            <Text style={[s.legalStatus, statusStyle(item.status)]}>{statusText(item.status)}</Text>
            <Text style={s.legalDetail}>{item.detail ?? "—"}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function KesiapanSection({ data }: { data: DossierDocumentData }) {
  const level = data.readinessLevel ?? "Belum Dihitung";
  const score = data.readinessScore !== null ? `${data.readinessScore} / 100` : "—";
  const date = data.readinessDate ? longDate(data.readinessDate) : "—";
  return (
    <View style={s.section}>
      <SectionHeader title="Tingkat Kesiapan Usaha" />
      <View style={s.row2}>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Level Kesiapan</Text>
          <Text style={[s.cellValue, { color: C.navy }]}>{level}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Skor</Text>
          <Text style={s.cellValue}>{score}</Text>
        </View>
      </View>
      <Text style={[s.cellLabel, { marginTop: 2 }]}>Tanggal Penghitungan: {date}</Text>
    </View>
  );
}

function KeuanganSection({ data }: { data: DossierDocumentData }) {
  // Pisahkan baris total dari baris biasa untuk styling
  const mainRows = data.financialRows.filter((r) => !r.label.startsWith("—"));
  const totalRow = data.financialRows.find((r) => r.label.startsWith("Estimasi Laba") || r.label.startsWith("Laba"));

  const totalPendapatan = data.financialRows.find((r) => r.label.includes("Pendapatan"))?.amountIdr ?? 0;
  const totalBeban = data.financialRows.find((r) => r.label.includes("Beban") || r.label.includes("Pengeluaran"))?.amountIdr ?? 0;
  const estimasiLaba = totalRow?.amountIdr ?? (totalPendapatan - totalBeban);
  const avgOmzet = totalPendapatan / 6;

  return (
    <View style={s.section}>
      <SectionHeader title="Ringkasan Keuangan 6 Bulan" />
      {/* Kartu metrik cepat */}
      <View style={s.metricsRow}>
        <View style={s.metricCard}>
          <Text style={s.metricLabel}>Total Pendapatan</Text>
          <Text style={s.metricValue}>{idrMillion(totalPendapatan)}</Text>
          <Text style={s.metricSub}>Rp {idr(totalPendapatan)}</Text>
        </View>
        <View style={s.metricCard}>
          <Text style={s.metricLabel}>Total Beban</Text>
          <Text style={s.metricValue}>{idrMillion(totalBeban)}</Text>
          <Text style={s.metricSub}>Rp {idr(totalBeban)}</Text>
        </View>
        <View style={s.metricCard}>
          <Text style={s.metricLabel}>Estimasi Laba Bersih</Text>
          <Text style={[s.metricValue, { color: estimasiLaba >= 0 ? C.verified : "#dc2626" }]}>
            {idrMillion(estimasiLaba)}
          </Text>
          <Text style={s.metricSub}>Rp {idr(estimasiLaba)}</Text>
        </View>
        <View style={s.metricCardLast}>
          <Text style={s.metricLabel}>Rata-rata Omzet / Bln</Text>
          <Text style={s.metricValue}>{idrMillion(avgOmzet)}</Text>
          <Text style={s.metricSub}>Periode {shortMonth(data.period.from)} – {shortMonth(data.period.to)}</Text>
        </View>
      </View>
      {/* Rincian tabel */}
      <View style={s.finTable}>
        {mainRows.map((row, i) => (
          <View key={i} style={s.finRow} wrap={false}>
            <Text style={s.finLabel}>{row.label}</Text>
            <Text style={s.finAmount}>Rp {idr(row.amountIdr)}</Text>
          </View>
        ))}
        {totalRow && (
          <View style={s.finRowTotal} wrap={false}>
            <Text style={[s.finLabel, { fontFamily: "Helvetica-Bold" }]}>{totalRow.label}</Text>
            <Text style={[s.finAmount, { color: C.navy }]}>Rp {idr(totalRow.amountIdr)}</Text>
          </View>
        )}
      </View>
      {/* Transaksi & QRIS */}
      <View style={s.row2}>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Jumlah Transaksi (6 Bln)</Text>
          <Text style={s.cellValue}>
            {data.transactionCount !== null ? `${data.transactionCount.toLocaleString("id-ID")} transaksi` : "—"}
          </Text>
        </View>
        <View style={s.cell}>
          <Text style={s.cellLabel}>Rasio Transaksi Digital (QRIS/Transfer)</Text>
          <Text style={s.cellValue}>
            {data.noncashRatio !== null ? `${Math.round(data.noncashRatio * 100)}%` : "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function KualitasDataSection({ data }: { data: DossierDocumentData }) {
  const items: Array<{ label: string; ok: boolean; detail?: string }> = [
    {
      label: "Konsistensi Pencatatan",
      ok: (data.daysRecorded ?? 0) >= 60,
      detail: data.daysRecorded !== null ? `${data.daysRecorded} hari aktif (6 bln)` : "—",
    },
    {
      label: "Bukti Transaksi",
      ok: data.hasEvidence,
      detail: data.hasEvidence ? "Ada bukti digital tertaut" : "Belum ada bukti",
    },
    {
      label: "Legalitas Usaha",
      ok: data.legalitas.some((l) => l.status === "verified"),
      detail: `${data.legalitas.filter((l) => l.status === "verified").length} dari ${data.legalitas.length} dokumen terverifikasi`,
    },
    {
      label: "Profil Kesiapan",
      ok: data.readinessLevel !== null && data.readinessLevel !== "Mulai",
      detail: data.readinessLevel ?? "Belum dihitung",
    },
  ];

  // Pemisahan rekening hanya muncul bila potretnya memang memuatnya. Dossier
  // yang dibekukan sebelum komponen ini ada tidak boleh berbunyi "belum" --
  // yang benar adalah pertanyaannya tidak pernah diajukan waktu itu.
  if (data.separateBankAccount !== null) {
    items.push({
      label: "Rekening Usaha Terpisah",
      ok: data.separateBankAccount === "berbukti",
      detail:
        data.separateBankAccount === "berbukti"
          ? "Tercatat, dengan berkas pendukung"
          : data.separateBankAccount === "tercatat"
            ? "Dinyatakan pemilik, tanpa berkas"
            : "Belum dipisahkan",
    });
  }

  // Dibariskan dua-dua secara umum, bukan dengan potongan tetap: daftar ini
  // sudah pernah bertambah panjang, dan potongan tetap membuat baris kedua
  // diam-diam memuat tiga kolom.
  const rows: (typeof items)[] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));

  return (
    <View style={s.section}>
      <SectionHeader title="Kualitas Data & Integritas Catatan" />
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={s.qualityRow}>
          {row.map((item, i) => (
            <View key={i} style={[s.qualityItem, { flex: 1 }]}>
              <View style={[s.qualityDot, { backgroundColor: item.ok ? C.verified : C.warning }]} />
              <View>
                <Text style={[s.qualityText, { fontFamily: "Helvetica-Bold" }]}>{item.label}</Text>
                <Text style={[s.qualityText, { color: C.muted }]}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function DisclaimerSection() {
  return (
    <View style={s.disclaimer}>
      <Text>
        Dokumen ini adalah ringkasan profil usaha berdasarkan data yang dicatat pemilik melalui BERKEMBANG.ID.
        Data kesiapan merupakan snapshot pada tanggal disetujui dan bukan penilaian kelayakan pembiayaan.
        Keputusan pembiayaan, investasi, atau pembinaan sepenuhnya merupakan kewenangan lembaga penerima.
        Dokumen belum diaudit oleh akuntan publik. Penggunaan dokumen ini tunduk pada syarat dan ketentuan
        BERKEMBANG.ID serta peraturan perundang-undangan yang berlaku.
      </Text>
    </View>
  );
}

// ── Dokumen utama ──────────────────────────────────────────────────────────

function DossierDocument({ data, watermark }: { data: DossierDocumentData; watermark: DossierWatermark }) {
  return (
    <Document
      title={`Dossier ${data.businessName} untuk ${watermark.institutionName}`}
      author="BERKEMBANG.ID"
      subject="Dossier Profil Usaha"
      creator="BERKEMBANG.ID"
      producer="BERKEMBANG.ID"
    >
      {/* Halaman 1: Profil, Kesiapan, Legalitas */}
      <Page size="A4" style={s.page}>
        <WatermarkBand watermark={watermark} />
        <Footer data={data} watermark={watermark} />

        {/* Hero box */}
        <View style={s.heroBox}>
          <View>
            <Text style={s.heroName}>{data.businessName}</Text>
            <Text style={s.heroSub}>
              {[data.businessForm, data.sector, data.city].filter(Boolean).join(" · ") || "UMKM Indonesia"}
            </Text>
            <Text style={[s.heroSub, { marginTop: 3 }]}>
              Periode Data: {longDate(data.period.from)} – {longDate(data.period.to)}
            </Text>
          </View>
          <View style={s.heroRight}>
            <Text style={s.heroBadge}>{data.readinessLevel ?? "Belum Dinilai"}</Text>
            {data.readinessScore !== null && (
              <Text style={s.heroBadgeScore}>Skor Kesiapan: {data.readinessScore}/100</Text>
            )}
          </View>
        </View>

        <IdentitasSection data={data} />
        <KesiapanSection data={data} />
        <LegalitasSection data={data} />
      </Page>

      {/* Halaman 2: Keuangan, Kualitas Data, Disclaimer */}
      <Page size="A4" style={s.page}>
        <WatermarkBand watermark={watermark} />
        <Footer data={data} watermark={watermark} />

        <KeuanganSection data={data} />
        <KualitasDataSection data={data} />
        <DisclaimerSection />
      </Page>
    </Document>
  );
}

// ── Exports ────────────────────────────────────────────────────────────────

export async function renderInstitutionDossierPdf(
  data: DossierDocumentData,
  watermark: DossierWatermark,
): Promise<Uint8Array> {
  return renderToBuffer(<DossierDocument data={data} watermark={watermark} />);
}

export function dossierFileName(businessName: string, documentUid: string): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "usaha";
  return `dossier-${slug}-${documentUid}.pdf`;
}

export const dossierDisclaimer =
  "Data kesiapan, bukan penilaian kelayakan pembiayaan. Keputusan pembiayaan sepenuhnya milik lembaga.";
