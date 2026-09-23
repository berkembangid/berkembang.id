/**
 * Bagian murni layar Catat: bentuk baris draf, pemetaan ke dan dari API, dan
 * aturan kecil yang sebelumnya tertanam di komponen 1.300 baris. Dipisah
 * supaya bisa diuji tanpa mikrofon, kamera, atau peramban.
 */
import { emptySelection, type CategorySelection } from "@/components/warung/CategoryChips";
import { normalizeCategory } from "@/modules/accounting/templates";
import { CaptureClientError } from "@/modules/ledger/capture-client";
import { categoryLabels, type TransactionDraftItem } from "@/modules/ledger/capture-schema";

export type InputMode = "voice" | "camera" | "text";

export type Step = "ready" | "recording" | "uploading" | "processing" | "needs_review" | "saving" | "success" | "failed";

export interface ExtractedItem {
  id: number;
  clientItemId: string;
  item: string;
  qty: string;
  type: "masuk" | "keluar";
  nominal: number;
  kategori: "Penjualan" | "Bahan" | "Operasional" | "Gaji" | "Lainnya";
  transactionDate: string;
  categoryCode: TransactionDraftItem["categoryCode"];
  quantity: number | null;
  unit: string | null;
  unitPriceIdr: number | null;
  paymentMethod: TransactionDraftItem["paymentMethod"];
  salesChannel: string | null;
  category: CategorySelection;
}

export const ACTIVE_CAPTURE_STORAGE_KEY = "berkembang.active-ledger-capture";

// ───────── HELPER: map raw API items to ExtractedItem[] ─────────
export function formatDraftItems(items: TransactionDraftItem[]): ExtractedItem[] {
  return items.map((it, idx) => ({
    id: idx + 1,
    clientItemId: it.clientItemId,
    item: it.description,
    qty: it.quantity
      ? `${it.quantity}${it.unit ? ` ${it.unit}` : ""}`
      : (it.unit ?? ""),
    type: it.transactionType === "income" ? "masuk" : "keluar",
    nominal: it.amountIdr,
    kategori: categoryLabels[it.categoryCode] as ExtractedItem["kategori"],
    transactionDate: it.transactionDate,
    categoryCode: it.categoryCode,
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    unitPriceIdr: it.unitPriceIdr ?? null,
    paymentMethod: it.paymentMethod ?? null,
    salesChannel: it.salesChannel ?? null,
    category: {
      ...emptySelection(it.transactionType),
      ...(it.emkmCategoryCode
        ? { emkmCategoryCode: it.emkmCategoryCode, emkmCategorySubtype: it.emkmCategorySubtype ?? null }
        : {}),
      counterpartyName: it.counterpartyName ?? null,
      interestAmountIdr: it.interestAmountIdr ?? 0,
      assetCategory: it.assetCategory ?? null,
      assetUsefulLifeYears: it.assetUsefulLifeMonths ? Math.round(it.assetUsefulLifeMonths / 12) : null,
    },
  }));
}

export function toDraftItems(items: ExtractedItem[]): TransactionDraftItem[] {
  return items.map((item) => {
    // Kategori menentukan arah uang, bukan sebaliknya: jualan yang belum
    // dibayar tetap tercatat sebagai pelanggan yang belum bayar.
    const category = normalizeCategory(
      item.category.emkmCategoryCode,
      item.category.emkmCategorySubtype,
      item.paymentMethod,
    );
    return {
      clientItemId: item.clientItemId,
      transactionType: category.direction,
      amountIdr: item.nominal,
      transactionDate: item.transactionDate,
      categoryCode: item.categoryCode,
      description: item.item,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceIdr: item.unitPriceIdr,
      paymentMethod: category.paymentMethod,
      salesChannel: item.salesChannel,
      emkmCategoryCode: category.categoryCode,
      emkmCategorySubtype: category.subtype as TransactionDraftItem["emkmCategorySubtype"],
      counterpartyName: item.category.counterpartyName,
      interestAmountIdr: item.category.interestAmountIdr || null,
      // Pemilik menjawab dalam TAHUN; pembukuan menghitung dalam bulan.
      assetCategory: category.categoryCode === 8
        ? (item.category.assetCategory as TransactionDraftItem["assetCategory"]) ?? "peralatan"
        : null,
      assetUsefulLifeMonths: category.categoryCode === 8
        ? (item.category.assetUsefulLifeYears ?? 4) * 12
        : null,
    };
  });
}

export function captureErrorMessage(error: unknown, fallback: string) {
  return error instanceof CaptureClientError ? error.message : fallback;
}

export function normalizedAudioMimeType(value: string) {
  const mimeType = value.toLowerCase().split(";", 1)[0];
  return ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"].includes(mimeType)
    ? (mimeType as "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/mpeg")
    : "audio/webm";
}

export function parseQuantity(value: string) {
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return { quantity: null, unit: value.trim() || null };
  const quantity = Number(match[1].replace(",", "."));
  return {
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    unit: match[2].trim() || null,
  };
}

export function formatSeconds(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/**
 * Baris kosong yang ditambahkan pemilik sendiri di layar periksa.
 *
 * Satu cerita sering memuat transaksi yang terlewat dibaca -- « tadi juga
 * bayar parkir dua ribu ». Dulu satu-satunya jalan adalah mengulang seluruh
 * rekaman. Baris baru ikut disimpan bersama draf lain dalam capture yang sama.
 */
export function blankItem(nextId: number, transactionDate: string): ExtractedItem {
  return {
    id: nextId,
    clientItemId: `manual-${crypto.randomUUID()}`,
    item: "",
    qty: "",
    type: "keluar",
    nominal: 0,
    kategori: "Lainnya",
    transactionDate,
    categoryCode: "other",
    quantity: null,
    unit: null,
    unitPriceIdr: null,
    paymentMethod: "cash",
    salesChannel: null,
    category: emptySelection("expense"),
  };
}

/** Baris yang belum layak disimpan: tanpa nominal atau tanpa keterangan. */
export function incompleteItems(items: readonly ExtractedItem[]) {
  return items.filter((item) => !(item.nominal > 0) || !item.item.trim());
}

export function itemTotals(items: readonly ExtractedItem[]) {
  return {
    totalMasuk: items.filter((item) => item.type === "masuk").reduce((sum, item) => sum + item.nominal, 0),
    totalKeluar: items.filter((item) => item.type === "keluar").reduce((sum, item) => sum + item.nominal, 0),
  };
}

/** Arah uang mengikuti kategori; tanda +/− di layar ikut berubah saat dipilih. */
export function withCategory(item: ExtractedItem, category: CategorySelection): ExtractedItem {
  const normalized = normalizeCategory(category.emkmCategoryCode, category.emkmCategorySubtype, item.paymentMethod);
  return { ...item, category, type: normalized.direction === "income" ? "masuk" : "keluar" };
}

type Span = [number, number];

/**
 * Letak kata yang menjadi dasar nominal dan kategori, dari draf jalur teks.
 *
 * Pemilik yang melihat « Rp150.000 » di layar periksa tidak tahu dari kata
 * mana angka itu diambil. Dengan sorotan, « seratus lima puluh ribu » di
 * kalimatnya sendiri tampil ditandai. Masukan dari API dibaca hati-hati:
 * bentuk yang tidak dikenal menghasilkan daftar kosong, bukan galat.
 */
export function evidenceSpansFromDrafts(drafts: unknown): Span[] {
  if (!Array.isArray(drafts)) return [];
  const isSpan = (value: unknown): value is Span =>
    Array.isArray(value) && value.length === 2 && value.every((part) => Number.isInteger(part) && part >= 0);
  const spans: Span[] = [];
  for (const draft of drafts) {
    if (!draft || typeof draft !== "object") continue;
    const record = draft as { amountCandidates?: unknown; category?: { evidenceSpan?: unknown } | null };
    const first = Array.isArray(record.amountCandidates) ? (record.amountCandidates[0] as { span?: unknown } | undefined) : undefined;
    if (isSpan(first?.span)) spans.push(first.span);
    if (isSpan(record.category?.evidenceSpan)) spans.push(record.category.evidenceSpan);
  }
  return spans;
}
