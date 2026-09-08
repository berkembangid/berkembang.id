import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Sakelar fitur, dibaca dari sisi server.
 *
 * KENAPA ADA NILAI CADANGAN, DAN KENAPA PEMANGGIL YANG MENENTUKANNYA.
 *
 * Sakelar yang gagal dibaca harus jatuh ke salah satu sisi, dan sisi yang
 * benar berbeda untuk tiap fitur. `capture_camera` masih baru: kalau
 * pembacaannya gagal, menutupnya tidak merugikan siapa pun. `capture_voice`
 * adalah alasan aplikasi ini dibuka: menutupnya karena satu bacaan gagal
 * berarti mematikan produk gara-gara gangguan sesaat.
 *
 * Nilai bawaannya `false` -- yang aman untuk fitur baru, dan pemanggil yang
 * tahu fiturnya tidak boleh mati harus mengatakannya secara eksplisit.
 */
export async function featureFlagEnabled(
  flagKey: string,
  options: { fallback?: boolean } = {},
): Promise<boolean> {
  const fallback = options.fallback ?? false;
  try {
    const client = await createServerSupabaseClient();
    // Usaha pemanggil dicari lewat RLS, bukan lewat parameter: baris yang
    // terbaca di sini pasti miliknya, dan tidak ada id yang bisa dititipkan
    // dari luar untuk membaca sakelar milik orang lain.
    const { data: business } = await client.from("businesses").select("id").limit(1).maybeSingle();
    const { data, error } = await client.rpc("feature_flag_enabled", {
      p_flag_key: flagKey,
      p_business_id: business?.id ?? undefined,
    });
    if (error) return fallback;
    return data === true;
  } catch {
    return fallback;
  }
}
