import "server-only";

/**
 * Kata kunci kategori dari basis data, untuk dipakai parser di server.
 *
 * MASALAH YANG DIPERBAIKI BERKAS INI
 *
 * Kata kunci kategori hidup di dua tempat: `category_templates.trigger_keywords`
 * di basis data, dan `defaultCategoryKeywords` di dalam `nominal-parser`. Spek
 * Voice Capture Bagian 3.2 menetapkan basis data sebagai sumbernya, tetapi
 * jalannya tidak pernah tersambung — parser selalu memakai tabel bawaannya
 * sendiri.
 *
 * Akibatnya nyata: menambah "meja" ke basis data tidak mengubah apa pun, dan
 * temuan yang sama akan kembali dengan kata benda berikutnya. Berkas ini
 * menyambungkannya.
 *
 * Tabel bawaan parser tetap ada sebagai cadangan luring untuk klien, dan uji
 * kontrak menjaga keduanya tidak pernah saling bertentangan.
 *
 * KENAPA DI-CACHE
 *
 * Kata kunci hanya berubah lewat migrasi. Membacanya sekali per proses jauh
 * lebih murah daripada satu kueri untuk setiap ucapan, dan tidak ada jendela
 * basi yang berarti: proses baru membaca ulang.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sectorFromAnswer } from "@/modules/accounting/templates";
import type { AccountingSector } from "@/modules/accounting/coa";
import type { EmkmCategoryCode, KeywordEntry } from "@/modules/nominal-parser";

const cache = new Map<AccountingSector, readonly KeywordEntry[]>();

/** Sektor yang dijawab pemilik di halaman Profil; jatuh ke barang bila kosong. */
export async function sectorForCurrentUser(userId: string): Promise<AccountingSector> {
  const client = await createServerSupabaseClient();
  const { data } = await client
    .from("profiles")
    .select("sektor_usaha")
    .eq("id", userId)
    .maybeSingle();
  return sectorFromAnswer(data?.sektor_usaha ?? null);
}

export async function categoryKeywordsForSector(
  sector: AccountingSector,
): Promise<readonly KeywordEntry[]> {
  const cached = cache.get(sector);
  if (cached) return cached;

  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("category_templates")
    .select("category_code,subtype,trigger_keywords")
    .eq("sector", sector)
    .eq("version", "coa-emkm-v1")
    .eq("is_active", true);

  // Kegagalan membaca tabel referensi tidak boleh menggagalkan pencatatan.
  // Parser punya tabel bawaan; yang hilang hanya kata kunci terbaru.
  if (error || !data) return [];

  const entries: KeywordEntry[] = [];
  for (const row of data) {
    for (const keyword of row.trigger_keywords ?? []) {
      const trimmed = keyword.trim().toLowerCase();
      if (trimmed === "") continue;
      entries.push({
        keyword: trimmed,
        code: row.category_code as EmkmCategoryCode,
        ...(row.subtype ? { subtype: row.subtype } : {}),
      });
    }
  }

  cache.set(sector, entries);
  return entries;
}

/** Dipakai uji; produksi tidak pernah perlu membersihkannya. */
export function clearCategoryKeywordCache(): void {
  cache.clear();
}
