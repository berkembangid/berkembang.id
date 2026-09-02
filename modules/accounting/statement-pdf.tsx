import "server-only";

/**
 * Berkas PDF laporan keuangan SAK EMKM.
 *
 * Dokumen dirender di server menjadi byte PDF, bukan halaman HTML yang
 * dicetak pemilik sendiri, supaya berkas yang dikirim ke bank selalu sama
 * bentuknya dari perangkat mana pun.
 *
 * Urutan isinya mengikuti spek: Laporan Posisi Keuangan, Laporan Laba Rugi,
 * Laporan Arus Kas, Catatan atas Laporan Keuangan, lampiran indikator, dan
 * lampiran metodologi. Setiap halaman memuat nama usaha, periode, nomor
 * halaman, ID dokumen, dan pernyataan batas penggunaan.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { accountByCode } from "@/modules/accounting/coa";
import { pilotCategoryTemplates } from "@/modules/accounting/templates";
import {
  accountingPolicyNotesFor,
  indicatorFormulaVersion,
  indicatorFormulas,
  statementDisclaimer,
  type StatementDocumentData,
} from "@/modules/accounting/statement-document";
import type { IncomeStatementView } from "@/modules/accounting/reports";

const palette = {
  ink: "#111111",
  muted: "#555555",
  rule: "#333333",
  faint: "#cccccc",
  warning: "#a33030",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 62,
    paddingBottom: 58,
    paddingHorizontal: 46,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: palette.ink,
    lineHeight: 1.45,
  },
  header: {
    position: "absolute",
    top: 28,
    left: 46,
    right: 46,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: palette.faint,
    paddingBottom: 6,
    fontSize: 7.5,
    color: palette.muted,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 46,
    right: 46,
    borderTopWidth: 0.5,
    borderTopColor: palette.faint,
    paddingTop: 6,
    fontSize: 6.8,
    color: palette.muted,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: palette.muted, marginBottom: 12 },
  heading: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 3 },
  paragraph: { marginBottom: 5, textAlign: "justify" },
  note: { fontSize: 8, color: palette.muted, marginBottom: 8 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: palette.rule,
    paddingBottom: 3,
    marginBottom: 2,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", paddingVertical: 2.5 },
  rowSubtotal: {
    flexDirection: "row",
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: palette.faint,
    fontFamily: "Helvetica-Oblique",
  },
  rowTotal: {
    flexDirection: "row",
    paddingVertical: 3.5,
    borderTopWidth: 1,
    borderTopColor: palette.rule,
    borderBottomWidth: 1.6,
    borderBottomColor: palette.rule,
    fontFamily: "Helvetica-Bold",
  },
  detailRow: {
    flexDirection: "row",
    paddingVertical: 2.5,
    borderBottomWidth: 0.4,
    borderBottomColor: "#eeeeee",
  },
  amount: { textAlign: "right" },
  cover: { marginTop: 190, alignItems: "center" },
  coverTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center" },
  coverLine: { fontSize: 10, marginTop: 6, textAlign: "center" },
  coverNote: { fontSize: 8, color: palette.muted, marginTop: 4, textAlign: "center", maxWidth: 360 },
  warning: {
    borderWidth: 0.8,
    borderColor: palette.warning,
    color: palette.warning,
    padding: 6,
    marginTop: 8,
    fontSize: 8,
  },
});

function idr(value: number): string {
  const text = Math.round(Math.abs(value)).toLocaleString("id-ID");
  return value < 0 ? `(${text})` : text;
}

function longDate(value: string): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const [year, month, day] = value.split("-");
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

type Column = { width: string; align?: "right" };

function StatementRow({
  cells,
  columns,
  emphasis = "normal",
}: {
  cells: string[];
  columns: Column[];
  emphasis?: "normal" | "subtotal" | "total";
}) {
  const style =
    emphasis === "total" ? styles.rowTotal : emphasis === "subtotal" ? styles.rowSubtotal : styles.row;
  return (
    <View style={style} wrap={false}>
      {cells.map((cell, index) => (
        <Text
          key={index}
          style={[
            { width: columns[index].width },
            columns[index].align === "right" ? styles.amount : {},
          ]}
        >
          {cell}
        </Text>
      ))}
    </View>
  );
}

function TableHead({ headers, columns }: { headers: string[]; columns: Column[] }) {
  return (
    <View style={styles.tableHead} fixed>
      {headers.map((header, index) => (
        <Text
          key={index}
          style={[
            { width: columns[index].width },
            columns[index].align === "right" ? styles.amount : {},
          ]}
        >
          {header}
        </Text>
      ))}
    </View>
  );
}

function PageChrome({ data }: { data: StatementDocumentData }) {
  return (
    <>
      <View style={styles.header} fixed>
        <Text>{data.businessName}</Text>
        <Text>
          {longDate(data.period.from)} – {longDate(data.period.to)}
        </Text>
      </View>
      <View style={styles.footer} fixed>
        <Text>{statementDisclaimer}</Text>
        <View style={styles.footerRow}>
          <Text>
            ID dokumen {data.documentId} · dicetak {longDate(data.printedAt.slice(0, 10))}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`} />
        </View>
      </View>
    </>
  );
}

function BalanceSheetPage({ data }: { data: StatementDocumentData }) {
  const { current, previous } = data.balanceSheet;
  const columns: Column[] = previous
    ? [{ width: "46%" }, { width: "10%" }, { width: "22%", align: "right" }, { width: "22%", align: "right" }]
    : [{ width: "62%" }, { width: "10%" }, { width: "28%", align: "right" }];

  const previousAmount = (key: string) =>
    previous ? (previous.lines.find((line) => line.key === key)?.amountIdr ?? 0) : null;

  return (
    <Page size="A4" style={styles.page}>
      <PageChrome data={data} />
      <Text style={styles.title}>LAPORAN POSISI KEUANGAN</Text>
      <Text style={styles.subtitle}>Per {longDate(current.asOf)}</Text>
      <TableHead
        headers={
          previous
            ? ["Pos", "Catatan", longDate(current.asOf), longDate(previous.asOf)]
            : ["Pos", "Catatan", longDate(current.asOf)]
        }
        columns={columns}
      />
      {current.lines.map((line) => {
        const cells = [line.label, line.noteNumber ? String(line.noteNumber) : "", idr(line.amountIdr)];
        if (previous) cells.push(idr(previousAmount(line.key) ?? 0));
        return <StatementRow key={line.key} cells={cells} columns={columns} emphasis={line.emphasis} />;
      })}
      {!current.balanced && (
        <Text style={styles.warning}>
          Jumlah aset belum sama dengan jumlah liabilitas dan ekuitas. Periksa catatan sebelum dokumen ini
          dipakai.
        </Text>
      )}
    </Page>
  );
}

function IncomeStatementPage({ data }: { data: StatementDocumentData }) {
  const { current, previous } = data.incomeStatement;
  const columns: Column[] = previous
    ? [{ width: "46%" }, { width: "10%" }, { width: "22%", align: "right" }, { width: "22%", align: "right" }]
    : [{ width: "62%" }, { width: "10%" }, { width: "28%", align: "right" }];

  const line = (
    label: string,
    note: number | null,
    pick: (view: IncomeStatementView) => number,
    emphasis: "normal" | "subtotal" | "total" = "normal",
  ) => {
    const cells = [label, note ? String(note) : "", idr(pick(current))];
    if (previous) cells.push(idr(pick(previous)));
    return <StatementRow key={label} cells={cells} columns={columns} emphasis={emphasis} />;
  };

  return (
    <Page size="A4" style={styles.page}>
      <PageChrome data={data} />
      <Text style={styles.title}>LAPORAN LABA RUGI</Text>
      <Text style={styles.subtitle}>Untuk periode yang berakhir {longDate(current.period.to)}</Text>
      <TableHead
        headers={
          previous
            ? ["Pos", "Catatan", longDate(current.period.to), longDate(previous.period.to)]
            : ["Pos", "Catatan", longDate(current.period.to)]
        }
        columns={columns}
      />
      {line("Pendapatan usaha", 10, (view) => view.operatingRevenueIdr)}
      {line("Pendapatan lain-lain", null, (view) => view.otherRevenueIdr)}
      {line("JUMLAH PENDAPATAN", null, (view) => view.totalRevenueIdr, "subtotal")}
      {line("Beban usaha", 11, (view) => view.operatingExpenseIdr)}
      {line("Beban lain-lain", 12, (view) => view.otherExpenseIdr)}
      {line("JUMLAH BEBAN", null, (view) => view.totalExpenseIdr, "subtotal")}
      {line("LABA (RUGI) SEBELUM PAJAK PENGHASILAN", null, (view) => view.profitBeforeTaxIdr, "total")}
      {line("Beban pajak penghasilan", null, (view) => view.incomeTaxIdr)}
      {line("LABA (RUGI) SETELAH PAJAK PENGHASILAN", null, (view) => view.profitAfterTaxIdr, "total")}
    </Page>
  );
}

function CashFlowPage({ data }: { data: StatementDocumentData }) {
  const flow = data.cashFlow;
  const columns: Column[] = [{ width: "72%" }, { width: "28%", align: "right" }];
  return (
    <Page size="A4" style={styles.page}>
      <PageChrome data={data} />
      <Text style={styles.title}>LAPORAN ARUS KAS</Text>
      <Text style={styles.subtitle}>
        Untuk periode {longDate(flow.period.from)} sampai {longDate(flow.period.to)}
      </Text>
      <Text style={styles.note}>
        Disusun dengan metode langsung. Laporan arus kas bukan komponen wajib SAK EMKM; disertakan karena umum
        dibaca lembaga keuangan.
      </Text>
      <TableHead headers={["Pos", "Jumlah"]} columns={columns} />
      <StatementRow cells={["Arus kas dari aktivitas operasi", idr(flow.operatingIdr)]} columns={columns} />
      <StatementRow cells={["Arus kas dari aktivitas investasi", idr(flow.investingIdr)]} columns={columns} />
      <StatementRow cells={["Arus kas dari aktivitas pendanaan", idr(flow.financingIdr)]} columns={columns} />
      <StatementRow
        cells={["KENAIKAN (PENURUNAN) KAS", idr(flow.netChangeIdr)]}
        columns={columns}
        emphasis="subtotal"
      />
      <StatementRow cells={["Kas dan setara kas awal periode", idr(flow.openingCashIdr)]} columns={columns} />
      <StatementRow
        cells={["Kas dan setara kas akhir periode", idr(flow.closingCashIdr)]}
        columns={columns}
        emphasis="total"
      />
      {!flow.balanced && (
        <Text style={styles.warning}>
          Jumlah ketiga aktivitas belum sama dengan perubahan kas. Periksa catatan sebelum dokumen ini dipakai.
        </Text>
      )}
    </Page>
  );
}

function NotesPage({ data }: { data: StatementDocumentData }) {
  const notes = data.notes;
  const twoColumns: Column[] = [{ width: "70%" }, { width: "30%", align: "right" }];

  return (
    <Page size="A4" style={styles.page}>
      <PageChrome data={data} />
      <Text style={styles.title}>CATATAN ATAS LAPORAN KEUANGAN</Text>
      <Text style={styles.subtitle}>
        Untuk periode {longDate(data.period.from)} sampai {longDate(data.period.to)}
      </Text>

      <Text style={styles.heading}>1. Umum</Text>
      <Text style={styles.paragraph}>
        {notes.business?.name ?? data.businessName} adalah usaha perseorangan
        {notes.business?.sector ? ` yang bergerak di bidang ${notes.business.sector.toLowerCase()}` : ""}
        {notes.business?.location ? `, berkedudukan di ${notes.business.location}` : ""}.{" "}
        {notes.openingBalance
          ? `Pencatatan keuangan melalui BERKEMBANG.ID dimulai pada ${longDate(notes.openingBalance.startDate)}.`
          : "Saldo awal usaha belum dicatat."}
      </Text>

      <Text style={styles.heading}>2. Ikhtisar kebijakan akuntansi</Text>
      {accountingPolicyNotesFor({ hasEvidence: data.hasEvidence }).map((policy) => (
        <Text key={policy.title} style={styles.paragraph}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{policy.title}. </Text>
          {policy.body}
        </Text>
      ))}

      <Text style={styles.heading}>3. Kas</Text>
      <Text style={styles.paragraph}>Saldo kas pada akhir periode sebesar {idr(Number(notes.cash))}.</Text>

      <Text style={styles.heading}>4. Giro</Text>
      <Text style={styles.paragraph}>
        Saldo rekening bank dan dompet digital pada akhir periode sebesar {idr(Number(notes.bank))}.
      </Text>

      <Text style={styles.heading}>5. Piutang usaha</Text>
      {notes.receivables.length === 0 ? (
        <Text style={styles.paragraph}>Tidak ada piutang usaha pada akhir periode.</Text>
      ) : (
        notes.receivables.map((item) => (
          <View key={item.name} style={styles.detailRow} wrap={false}>
            <Text style={{ width: "70%" }}>{item.name}</Text>
            <Text style={[{ width: "30%" }, styles.amount]}>{idr(item.amountIdr)}</Text>
          </View>
        ))
      )}

      <Text style={styles.heading}>6. Persediaan</Text>
      <Text style={styles.paragraph}>
        Nilai persediaan pada akhir periode sebesar {idr(Number(notes.inventory.balanceIdr))}.
        {notes.inventory.lastCountedMonth
          ? ` Hitungan fisik terakhir dilakukan untuk periode ${String(notes.inventory.lastCountedMonth).slice(0, 7)}.`
          : " Belum ada hitungan fisik persediaan."}
      </Text>

      <Text style={styles.heading}>7. Aset tetap</Text>
      {notes.fixedAssets.length === 0 ? (
        <Text style={styles.paragraph}>Tidak ada aset tetap yang tercatat.</Text>
      ) : (
        <>
          <TableHead
            headers={["Aset", "Perolehan", "Harga", "Akumulasi", "Nilai buku"]}
            columns={[
              { width: "30%" },
              { width: "20%" },
              { width: "17%", align: "right" },
              { width: "17%", align: "right" },
              { width: "16%", align: "right" },
            ]}
          />
          {notes.fixedAssets.map((asset) => (
            <View key={`${asset.name}-${asset.acquiredOn}`} style={styles.detailRow} wrap={false}>
              <Text style={{ width: "30%" }}>{asset.name}</Text>
              <Text style={{ width: "20%" }}>{longDate(asset.acquiredOn)}</Text>
              <Text style={[{ width: "17%" }, styles.amount]}>{idr(asset.costIdr)}</Text>
              <Text style={[{ width: "17%" }, styles.amount]}>{idr(asset.accumulatedIdr)}</Text>
              <Text style={[{ width: "16%" }, styles.amount]}>{idr(asset.costIdr - asset.accumulatedIdr)}</Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.heading}>8. Utang bank dan pinjaman lain</Text>
      {notes.loans.length === 0 ? (
        <Text style={styles.paragraph}>Tidak ada utang bank atau pinjaman lain yang tercatat.</Text>
      ) : (
        <>
          <TableHead
            headers={["Pemberi pinjaman", "Mulai", "Pokok", "Sisa", "Angsuran"]}
            columns={[
              { width: "30%" },
              { width: "20%" },
              { width: "17%", align: "right" },
              { width: "17%", align: "right" },
              { width: "16%", align: "right" },
            ]}
          />
          {notes.loans.map((loan) => (
            <View key={`${loan.lenderName}-${loan.startedOn}`} style={styles.detailRow} wrap={false}>
              <Text style={{ width: "30%" }}>
                {loan.lenderName} ({loan.lenderType.toLowerCase()})
              </Text>
              <Text style={{ width: "20%" }}>{longDate(loan.startedOn)}</Text>
              <Text style={[{ width: "17%" }, styles.amount]}>{idr(loan.principalIdr)}</Text>
              <Text style={[{ width: "17%" }, styles.amount]}>{idr(loan.outstandingIdr)}</Text>
              <Text style={[{ width: "16%" }, styles.amount]}>
                {loan.monthlyInstallmentIdr ? idr(loan.monthlyInstallmentIdr) : "-"}
              </Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.heading}>9. Modal</Text>
      <Text style={styles.paragraph}>
        Setoran modal pemilik sampai akhir periode sebesar {idr(Number(notes.equity.capitalIdr))}. Pengambilan
        pemilik untuk keperluan pribadi sebesar {idr(Number(notes.equity.ownerDrawIdr))}, disajikan sebagai
        pengurang modal dan tidak pernah diperlakukan sebagai beban usaha.
      </Text>

      <Text style={styles.heading}>10. Pendapatan usaha</Text>
      {notes.revenueByMonth.length === 0 ? (
        <Text style={styles.paragraph}>Tidak ada pendapatan yang tercatat pada periode ini.</Text>
      ) : (
        notes.revenueByMonth.map((item) => (
          <View key={item.month} style={styles.detailRow} wrap={false}>
            <Text style={{ width: "70%" }}>{String(item.month).slice(0, 7)}</Text>
            <Text style={[{ width: "30%" }, styles.amount]}>{idr(item.amountIdr)}</Text>
          </View>
        ))
      )}

      <Text style={styles.heading}>11. Beban usaha</Text>
      {notes.expenseByAccount.length === 0 ? (
        <Text style={styles.paragraph}>Tidak ada beban yang tercatat pada periode ini.</Text>
      ) : (
        notes.expenseByAccount.map((item) => (
          <View key={item.accountCode} style={styles.detailRow} wrap={false}>
            <Text style={{ width: "70%" }}>{item.accountName}</Text>
            <Text style={[{ width: "30%" }, styles.amount]}>{idr(item.amountIdr)}</Text>
          </View>
        ))
      )}

      <Text style={styles.heading}>12. Beban lain-lain</Text>
      <View style={styles.detailRow} wrap={false}>
        <Text style={{ width: "70%" }}>Beban bunga pinjaman</Text>
        <Text style={[{ width: "30%" }, styles.amount]}>
          {idr(data.incomeStatement.current.otherExpenseIdr)}
        </Text>
      </View>

      <Text style={styles.heading}>13. Pernyataan</Text>
      <Text style={styles.paragraph}>{statementDisclaimer}</Text>
      <View style={{ height: 0 }} />
      <Text style={styles.note}>{twoColumns.length > 0 ? "" : ""}</Text>
    </Page>
  );
}

function IndicatorPage({ data }: { data: StatementDocumentData }) {
  const columns: Column[] = [
    { width: "16%" },
    { width: "16%", align: "right" },
    { width: "15%", align: "right" },
    { width: "15%", align: "right" },
    { width: "15%", align: "right" },
    { width: "15%", align: "right" },
    { width: "8%", align: "right" },
  ];
  return (
    <Page size="A4" style={styles.page}>
      <PageChrome data={data} />
      <Text style={styles.title}>LAMPIRAN A — INDIKATOR ENAM BULAN</Text>
      <Text style={styles.note}>
        Indikator berikut dihitung langsung dari jurnal. Angka ini menggambarkan aktivitas usaha, bukan penilaian
        atas usaha. Rumus setiap kolom tercetak di Lampiran B. Versi rumus: {indicatorFormulaVersion}.
      </Text>
      <TableHead
        headers={["Bulan", "Pendapatan", "Beban pokok", "Laba bersih", "Ambilan", "Rekening", "Hari"]}
        columns={columns}
      />
      {data.indicators.map((month) => (
        <StatementRow
          key={month.periodMonth}
          columns={columns}
          cells={[
            month.periodMonth,
            idr(month.revenueIdr),
            idr(month.cogsIdr),
            idr(month.netIncomeIdr),
            idr(month.priveIdr),
            // Kosong, bukan "0%", pada bulan tanpa penjualan sama sekali.
            month.noncashSalesRatio === null
              ? "—"
              : `${Math.round(month.noncashSalesRatio * 100)}%`,
            String(month.daysRecorded),
          ]}
        />
      ))}
    </Page>
  );
}

function MethodologyPage({ data }: { data: StatementDocumentData }) {
  const columns: Column[] = [
    { width: "9%" },
    { width: "26%" },
    { width: "28%" },
    { width: "26%" },
    { width: "11%" },
  ];
  const formulaColumns: Column[] = [{ width: "22%" }, { width: "40%" }, { width: "38%" }];
  const describe = (rule: string) => {
    const account = accountByCode[rule];
    if (account) return `${rule} ${account.name}`;
    if (rule === "CASH_STAR") return "Kas atau Bank sesuai cara bayar";
    if (rule === "CASH_OR_PAYABLE") return "Kas, Bank, atau Utang Usaha sesuai cara bayar";
    if (rule === "LIABILITY_STAR") return "Utang sesuai jenis pemberi pinjaman";
    return rule;
  };

  return (
    <Page size="A4" style={styles.page}>
      <PageChrome data={data} />
      <Text style={styles.title}>LAMPIRAN B — METODOLOGI PENCATATAN</Text>
      <Text style={styles.note}>
        Pemilik usaha memilih satu dari sepuluh kategori dalam bahasa sehari-hari. Pemetaan kategori menjadi akun
        bersifat tetap dan tidak ditentukan oleh model bahasa. Tabel berikut adalah pemetaan yang dipakai untuk
        seluruh angka dalam dokumen ini.
      </Text>
      <TableHead headers={["Kode", "Kategori", "Debit", "Kredit", "Arus kas"]} columns={columns} />
      {pilotCategoryTemplates.map((template) => (
        <StatementRow
          key={`${template.categoryCode}-${template.subtype ?? "x"}`}
          columns={columns}
          cells={[
            `${template.categoryCode}${template.subtype ? `-${template.subtype}` : ""}`,
            template.labelUmkm,
            describe(template.debitRule),
            describe(template.creditRule),
            template.cashFlowSection.toLowerCase(),
          ]}
        />
      ))}
      <Text style={[styles.subtitle, { marginTop: 14 }]}>Rumus indikator ({indicatorFormulaVersion})</Text>
      <TableHead headers={["Indikator", "Rumus", "Keterangan"]} columns={formulaColumns} />
      {indicatorFormulas.map((item) => (
        <StatementRow
          key={item.name}
          columns={formulaColumns}
          cells={[item.name, item.formula, item.note]}
        />
      ))}
      <Text style={[styles.note, { marginTop: 10 }]}>
        Laba bersih dihitung sebagai jumlah pendapatan dikurangi jumlah beban. Pengambilan pemilik untuk keperluan
        pribadi tidak pernah masuk ke dalam beban. Setiap koreksi dicatat sebagai jurnal pembalik dan jurnal baru;
        tidak ada baris jurnal yang pernah diubah atau dihapus.
      </Text>
    </Page>
  );
}

function StatementDocument({ data }: { data: StatementDocumentData }) {
  return (
    <Document
      title={`Laporan Keuangan ${data.businessName}`}
      author="BERKEMBANG.ID"
      subject="Laporan keuangan SAK EMKM"
      creator="BERKEMBANG.ID"
      producer="BERKEMBANG.ID"
    >
      <Page size="A4" style={styles.page}>
        <PageChrome data={data} />
        <View style={styles.cover}>
          <Text style={styles.coverTitle}>{data.businessName}</Text>
          <Text style={styles.coverLine}>LAPORAN KEUANGAN</Text>
          <Text style={styles.coverLine}>
            Untuk periode {longDate(data.period.from)} sampai {longDate(data.period.to)}
          </Text>
          <Text style={[styles.coverNote, { marginTop: 28 }]}>Disusun sesuai SAK EMKM</Text>
          <Text style={styles.coverNote}>{statementDisclaimer}</Text>
        </View>
      </Page>
      <BalanceSheetPage data={data} />
      <IncomeStatementPage data={data} />
      <CashFlowPage data={data} />
      <NotesPage data={data} />
      {data.includeIndicators && data.indicators.length > 0 && <IndicatorPage data={data} />}
      <MethodologyPage data={data} />
    </Document>
  );
}

export async function renderFinancialStatementsPdf(data: StatementDocumentData): Promise<Uint8Array> {
  return renderToBuffer(<StatementDocument data={data} />);
}

/** Nama berkas yang muncul saat pemilik menyimpan atau meneruskannya. */
export function statementFileName(businessName: string, period: { from: string; to: string }): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "usaha";
  return `laporan-keuangan-${slug}-${period.from}-sd-${period.to}.pdf`;
}
