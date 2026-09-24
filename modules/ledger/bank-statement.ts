/**
 * Membaca CSV mutasi rekening menjadi baris uang masuk / uang keluar.
 *
 * Modul murni, dan berjalan di PERAMBAN: berkas rekening koran tidak pernah
 * diunggah. Yang dikirim ke server hanya baris yang dipilih pemilik, lewat
 * jalur pencatatan yang sama dengan formulir manual.
 *
 * Setiap bank punya bentuknya sendiri, jadi pembacanya menebak dari judul
 * kolom, bukan dari urutan:
 *   - BCA         : Tanggal, Keterangan, Cabang, Jumlah ("1,500,000.00 CR"), Saldo
 *   - Mandiri/BNI : Tanggal, Keterangan, Debet, Kredit, Saldo
 *   - BRI/lainnya : Tanggal, Uraian, Nominal, DB/CR
 * Baris pembuka sebelum judul kolom (nama rekening, periode) dilewati, begitu
 * juga baris saldo awal/akhir dan jumlah mutasi.
 */

export type StatementRow = {
  /** Urutan baris di berkas, untuk kunci tampilan. */
  line: number;
  date: string;
  description: string;
  amountIdr: number;
  direction: "income" | "expense";
};

export type StatementParseResult = {
  rows: StatementRow[];
  /** Baris data yang dilewati karena tanggal atau nominalnya tidak terbaca. */
  skipped: number;
  /** Null bila judul kolom tidak ditemukan sama sekali. */
  error: null | "NO_HEADER" | "NO_ROWS";
};

/** Pisahkan satu baris CSV, dengan tanda kutip dan pemisah yang ditebak. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 20).join("\n");
  const counts = [",", ";", "\t", "|"].map((delimiter) => ({ delimiter, count: sample.split(delimiter).length }));
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

/**
 * Nominal dari teks bank: "1,500,000.00", "1.500.000,00", "Rp 25.000",
 * "-50000", "(50.000)", "1,500,000.00 CR". Hasilnya rupiah bulat dan tandanya;
 * akhiran CR/DB (atau K/D) mengalahkan tanda minus.
 */
export function parseAmount(raw: string): { value: number; sign: 1 | -1 | 0; marker: "CR" | "DB" | null } | null {
  let text = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!text) return null;
  let marker: "CR" | "DB" | null = null;
  const markerMatch = text.match(/\b(CR|DB|K|D|KREDIT|DEBET|DEBIT)\s*$/);
  if (markerMatch) {
    marker = ["CR", "K", "KREDIT"].includes(markerMatch[1]) ? "CR" : "DB";
    text = text.slice(0, markerMatch.index).trim();
  }
  let sign: 1 | -1 | 0 = 0;
  if (/^\(.*\)$/.test(text) || text.startsWith("-")) sign = -1;
  text = text.replace(/[^\d.,]/g, "");
  if (!/\d/.test(text)) return null;

  // Pemisah desimal: pemisah TERAKHIR yang diikuti tepat dua angka, bila ada
  // pemisah lain sebelumnya atau pemisahnya berbeda jenis.
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  const last = Math.max(lastDot, lastComma);
  let integerPart = text;
  if (last >= 0) {
    const tail = text.slice(last + 1);
    const separators = (text.match(/[.,]/g) ?? []).length;
    const mixed = lastDot >= 0 && lastComma >= 0;
    if (tail.length === 2 && (mixed || separators === 1)) {
      integerPart = text.slice(0, last);
    }
  }
  const value = Number(integerPart.replace(/[.,]/g, ""));
  if (!Number.isFinite(value)) return null;
  return { value, sign, marker };
}

/**
 * Tanggal ke YYYY-MM-DD. Bank Indonesia menulis hari lebih dulu. Tanggal
 * tanpa tahun (BCA: "24/09") memakai `fallbackYear`.
 */
export function parseStatementDate(raw: string, fallbackYear: number): string | null {
  const text = raw.trim().replace(/^'/, "");
  const months: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, MAY: 5, JUN: 6, JUL: 7, AGU: 8, AGT: 8, AUG: 8, SEP: 9, OKT: 10, OCT: 10, NOV: 11, DES: 12, DEC: 12,
  };
  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/))) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : fallbackYear;
  } else if ((match = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})/))) {
    day = Number(match[1]);
    month = months[match[2].toUpperCase()];
    year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  }
  if (!year || !month || !day || month > 12 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Columns = { date: number; description: number; debit?: number; credit?: number; amount?: number; type?: number };

function findColumns(cells: string[]): Columns | null {
  const lower = cells.map((cell) => cell.toLowerCase().trim());
  const find = (pattern: RegExp, exclude?: RegExp) => lower.findIndex((cell) => pattern.test(cell) && !(exclude && exclude.test(cell)));
  const date = find(/^(tanggal|tgl|date|tanggal transaksi|posting date|trans(action)? date)\b/);
  const description = find(/keterangan|deskripsi|description|uraian|remark|detail|transaksi/, /tanggal|date/);
  if (date < 0 || description < 0) return null;
  const debit = find(/^(debet|debit|mutasi debet|mutasi debit|keluar|uang keluar|withdrawal)/);
  const credit = find(/^(kredit|credit|mutasi kredit|masuk|uang masuk|deposit)/);
  const amount = find(/^(jumlah|nominal|amount|mutasi)$|^(jumlah|nominal|amount)\b/);
  const type = find(/^(db\/cr|cr\/db|d\/k|k\/d|jenis|tipe|type)$/);
  if (debit >= 0 && credit >= 0) return { date, description, debit, credit };
  // BCA menaruh CR/DB di kolom TANPA judul tepat sesudah « Jumlah ».
  const untitledNext = amount >= 0 && lower[amount + 1] === "" ? amount + 1 : -1;
  if (amount >= 0) return { date, description, amount, type: type >= 0 ? type : untitledNext >= 0 ? untitledNext : undefined };
  return null;
}

const SKIP_DESCRIPTION = /saldo awal|saldo akhir|opening balance|closing balance|total mutasi|mutasi (debet|kredit)|^saldo$/i;

export function parseBankStatement(text: string, fallbackYear: number): StatementParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { rows: [], skipped: 0, error: "NO_ROWS" };
  const delimiter = detectDelimiter(lines);

  let headerIndex = -1;
  let columns: Columns | null = null;
  for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
    columns = findColumns(splitCsvLine(lines[index], delimiter));
    if (columns) {
      headerIndex = index;
      break;
    }
  }
  if (!columns) return { rows: [], skipped: 0, error: "NO_HEADER" };

  const rows: StatementRow[] = [];
  let skipped = 0;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index], delimiter);
    const description = (cells[columns.description] ?? "").replace(/\s+/g, " ").trim();
    if (SKIP_DESCRIPTION.test(description)) continue;
    const date = parseStatementDate(cells[columns.date] ?? "", fallbackYear);

    let amountIdr = 0;
    let direction: "income" | "expense" | null = null;
    if (columns.debit !== undefined && columns.credit !== undefined) {
      const debit = parseAmount(cells[columns.debit] ?? "");
      const credit = parseAmount(cells[columns.credit] ?? "");
      if (credit && credit.value > 0) {
        amountIdr = credit.value;
        direction = "income";
      } else if (debit && debit.value > 0) {
        amountIdr = debit.value;
        direction = "expense";
      }
    } else if (columns.amount !== undefined) {
      const parsed = parseAmount(cells[columns.amount] ?? "");
      const typeCell = columns.type !== undefined ? (cells[columns.type] ?? "").trim().toUpperCase() : "";
      if (parsed && parsed.value > 0) {
        amountIdr = parsed.value;
        const marker = parsed.marker ?? (/^(CR|K|KREDIT|C)$/.test(typeCell) ? "CR" : /^(DB|D|DEBET|DEBIT)$/.test(typeCell) ? "DB" : null);
        direction = marker === "CR" ? "income" : marker === "DB" ? "expense" : parsed.sign === -1 ? "expense" : "income";
      }
    }

    if (!date || !direction || amountIdr <= 0) {
      // Baris kosong di ujung berkas bukan kegagalan membaca.
      if (cells.some((cell) => cell !== "")) skipped += 1;
      continue;
    }
    rows.push({ line: index + 1, date, description: description || "Mutasi rekening", amountIdr, direction });
  }
  return { rows, skipped, error: rows.length === 0 ? "NO_ROWS" : null };
}
