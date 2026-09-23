import { NextResponse } from "next/server";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { portalPathForRole } from "@/modules/auth/role-resolution";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  try {
    const role = await getEffectivePortalRole(supabase, user.id);
    if (role) {
      // Pemilik yang BARU MENDAFTAR diantar ke Kondisi awal, sekali -- langkah
      // pertama yang membuat laporannya bisa jujur. Di sana ada « Lewati, isi
      // nanti »; daftar persiapan di Beranda mengingatkannya lagi.
      //
      // Bedanya dengan perilaku yang dicabut hari ini terletak pada apa yang
      // ditanyakan. Dulu: "apakah ia belum punya transaksi" -- keadaan yang
      // tetap kosong selama berhari-hari, jadi pengalihannya terjadi pada
      // SETIAP kali masuk dan terbaca seperti kegagalan masuk. Sekarang:
      // "apakah ia sudah pernah melihat perkenalan" -- penanda yang tersimpan
      // dan hanya pernah berubah sekali.
      //
      // Gagal ke arah yang aman: kalau kolomnya tidak terbaca, pemilik masuk
      // ke portalnya seperti biasa. Pengalihan yang muncul karena bacaan
      // gagal lebih buruk daripada perkenalan yang terlewat.
      if (role === "umkm") {
        const profile = await supabase
          .from("profiles")
          .select("onboarding_seen_at")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (!profile.error && profile.data && profile.data.onboarding_seen_at === null) {
          return NextResponse.redirect(new URL("/umkm/profil/kondisi-awal?mulai=1", request.url));
        }
      }

      // Masuk selalu berakhir di portalnya sendiri, tanpa pengalihan lain.
      //
      // Sebelumnya pemilik usaha yang belum punya satu pun transaksi dibelokkan
      // ke `/umkm/profil?onboarding=1`. Maksudnya baik, akibatnya tidak: ia
      // berlaku pada SETIAP kali masuk, bukan sekali saat mendaftar, jadi
      // pemilik yang belum mencatat dibelokkan terus -- dan pengalihan pada
      // saat masuk terbaca seperti kegagalan masuk, bukan seperti ajakan.
      //
      // Jawaban profilnya sekarang dikumpulkan saat onboarding di KEDUA jalur
      // masuk (surel dan Google), jadi pengalihan ini tidak lagi menambal apa
      // pun. Ajakan melengkapi profil tetap ada sebagai kartu di Beranda --
      // di tempat yang bisa ditunda pemiliknya, bukan di jalan masuknya.
      return NextResponse.redirect(new URL(portalPathForRole(role), request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/auth/login?error=authorization_unavailable", request.url));
  }

  return NextResponse.redirect(new URL("/auth/login?error=membership_required", request.url));
}
