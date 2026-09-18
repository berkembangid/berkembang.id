import { muatTim } from "@/modules/tim/team-source";
import { PenyuntingTim } from "./penyunting-tim";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil Tim | Ruang Mesin" };

/**
 * Layar admin untuk menyunting profil tim publik.
 *
 * ISINYA DIBACA DI SERVER, bukan lewat klien. Tabel `team_profiles` sengaja
 * tidak punya hak baca maupun kebijakan RLS -- ia tidak bisa disentuh lewat
 * REST API oleh siapa pun. Yang membacanya service role di sini, dan yang
 * menulisnya satu RPC yang menuntut admin platform.
 */
export default async function AdminTimPage() {
  const anggota = await muatTim();
  return <PenyuntingTim anggota={anggota} />;
}
