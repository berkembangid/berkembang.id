import type { TransactionItem } from "@/modules/ai/schema";

type InsertError = { message: string } | null;

export type TransactionInsertClient = {
  from(table: "transactions"): {
    insert(values: Record<string, unknown>[]): PromiseLike<{ error: InsertError }>;
  };
};

type SaveInput = {
  client: TransactionInsertClient;
  userId: string | null | undefined;
  transactions: TransactionItem[];
  transactionDate: string;
};

export type SaveTransactionsResult =
  | { ok: true }
  | { ok: false; message: string };

export async function saveConfirmedTransactions({
  client,
  userId,
  transactions,
  transactionDate,
}: SaveInput): Promise<SaveTransactionsResult> {
  if (!userId) {
    return { ok: false, message: "Sesi berakhir. Silakan masuk kembali." };
  }

  if (transactions.length === 0 || transactions.some((item) => item.nominal <= 0)) {
    return {
      ok: false,
      message: "Tidak ada transaksi valid untuk disimpan. Periksa kembali nominalnya.",
    };
  }

  try {
    const { error } = await client.from("transactions").insert(
      transactions.map((item) => ({
        user_id: userId,
        item: item.item,
        qty: item.qty,
        type: item.type,
        nominal: item.nominal,
        kategori: item.kategori,
        tanggal: transactionDate,
      })),
    );

    if (error) {
      return {
        ok: false,
        message: "Catatan belum tersimpan. Silakan coba lagi tanpa menutup halaman ini.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Catatan belum tersimpan. Periksa koneksi lalu coba lagi.",
    };
  }
}

