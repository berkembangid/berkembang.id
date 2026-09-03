import { getAuthenticatedUser, createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  AccountingOperationError,
  accountingErrorResponse,
} from "@/modules/accounting/accounting-errors";
import { buildZip, csvRow, type ZipEntry } from "@/modules/documents/zip";

/**
 * "Unduh semua data saya" — seluruh isi akun dalam satu berkas ZIP.
 *
 * Dibuat karena data usaha ini milik pemiliknya, bukan milik kami, dan hak itu
 * hanya berarti kalau ada tombolnya. Yang ikut: profil, seluruh jurnal sebagai
 * CSV, daftar dokumen, dan berkas dokumennya sendiri.
 *
 * CSV, bukan hanya JSON, karena yang membuka berkas ini kemungkinan besar
 * membukanya di Excel atau memberikannya ke orang lain — dan JSON tidak bisa
 * dibaca siapa pun tanpa alat.
 *
 * Berkas dokumen yang gagal diambil TIDAK menggagalkan seluruh ekspor. Sebuah
 * foto yang hilang tidak boleh menyandera seluruh pembukuan; kegagalannya
 * dicatat di dalam ZIP sebagai `BERKAS-TIDAK-TERBACA.txt` supaya pemilik tahu
 * apa yang tidak ikut.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Batas berkas yang ikut, supaya satu ekspor tidak menghabiskan memori server. */
const maxFiles = 200;

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) throw new AccountingOperationError("UNAUTHENTICATED");

    const client = await createServerSupabaseClient();
    const [profileResult, journalResult, documentResult] = await Promise.all([
      client.from("profiles").select("*").eq("auth_user_id", user.id).maybeSingle(),
      client
        .from("v_general_ledger")
        .select("entry_date,account_code,account_name,debit,credit,memo")
        .order("entry_date", { ascending: true })
        .limit(20_000),
      client
        .from("documents")
        .select("id,name,doc_type,doc_class,status,doc_number,valid_until,storage_path,created_at")
        .neq("status", "superseded")
        .order("created_at", { ascending: true })
        .limit(maxFiles),
    ]);

    const encoder = new TextEncoder();
    const entries: ZipEntry[] = [];
    const missing: string[] = [];

    entries.push({
      path: "profil.json",
      data: encoder.encode(JSON.stringify(profileResult.data ?? {}, null, 2)),
    });

    type LedgerRow = {
      entry_date: string;
      account_code: string;
      account_name: string;
      debit: number;
      credit: number;
      memo: string | null;
    };
    const ledgerRows = (journalResult.data ?? []) as unknown as LedgerRow[];
    const ledgerCsv = [
      csvRow(["tanggal", "kode_akun", "nama_akun", "debit", "kredit", "keterangan"]),
      ...ledgerRows.map((row) =>
        csvRow([row.entry_date, row.account_code, row.account_name, row.debit, row.credit, row.memo]),
      ),
    ].join("\n");
    // BOM supaya Excel di Windows membaca huruf beraksen dengan benar.
    entries.push({ path: "catatan/jurnal.csv", data: encoder.encode(`﻿${ledgerCsv}\n`) });

    type DocumentRow = {
      id: string;
      name: string;
      doc_type: string;
      doc_class: string | null;
      status: string;
      doc_number: string | null;
      valid_until: string | null;
      storage_path: string | null;
      created_at: string;
    };
    const documents = (documentResult.data ?? []) as unknown as DocumentRow[];
    const documentCsv = [
      csvRow(["nama", "jenis", "rak", "status", "nomor", "berlaku_sampai", "dibuat"]),
      ...documents.map((row) =>
        csvRow([
          row.name,
          row.doc_type,
          row.doc_class,
          row.status,
          row.doc_number,
          row.valid_until,
          row.created_at,
        ]),
      ),
    ].join("\n");
    entries.push({ path: "dokumen/daftar.csv", data: encoder.encode(`﻿${documentCsv}\n`) });

    const admin = createServiceRoleClient();
    const used = new Set<string>();
    for (const document of documents) {
      if (!document.storage_path) continue;
      const download = await admin.storage.from("documents").download(document.storage_path);
      if (download.error || !download.data) {
        missing.push(document.name);
        continue;
      }
      const extension = document.storage_path.split(".").pop() ?? "bin";
      // Nama berkas dirapikan dan dibuat unik: dua dokumen boleh bernama sama,
      // dua entri di dalam ZIP tidak boleh.
      const base = document.name.replace(/[^\p{L}\p{N} ._-]+/gu, "-").slice(0, 80) || "dokumen";
      let path = `dokumen/${base}.${extension}`;
      let counter = 2;
      while (used.has(path)) {
        path = `dokumen/${base} (${counter}).${extension}`;
        counter += 1;
      }
      used.add(path);
      entries.push({
        path,
        data: new Uint8Array(await download.data.arrayBuffer()),
      });
    }

    if (missing.length > 0) {
      entries.push({
        path: "BERKAS-TIDAK-TERBACA.txt",
        data: encoder.encode(
          "Berkas berikut tidak berhasil diambil saat ekspor dibuat:\n\n" +
            missing.map((name) => `- ${name}`).join("\n") +
            "\n\nSisa data Anda di berkas ini tetap lengkap.\n",
        ),
      });
    }

    const zip = buildZip(entries, new Date());
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(zip as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.byteLength),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="data-usaha-${stamp}.zip"`,
      },
    });
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
