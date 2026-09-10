import { NextResponse } from "next/server";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { bootstrapAccountFromSignupMetadata } from "@/lib/auth/bootstrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Tempat Google mengembalikan orang setelah menyetujui.
 *
 * Yang dibawa balik hanya sebuah `code`; sesi baru ada setelah kode itu
 * ditukar. Penukaran dilakukan di server supaya kukinya ditulis dengan
 * `httpOnly` oleh klien SSR, bukan disimpan peramban lewat JavaScript.
 *
 * Sesudah itu ada satu hal yang tidak dimiliki pendaftaran lewat surel: akun
 * Google tidak membawa metadata pendaftaran, jadi `bootstrap` tidak tahu ini
 * pemilik usaha atau lembaga dan tidak bisa membuatkan apa pun. Menebaknya
 * berarti separuh akun lembaga akan lahir sebagai usaha. Jadi akun baru
 * diantar ke `/auth/lengkapi` untuk menjawabnya sendiri, sementara akun yang
 * sudah punya usaha langsung masuk.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (oauthError) {
    const target = new URL("/auth/login", url.origin);
    target.searchParams.set("error", "oauth_dibatalkan");
    return NextResponse.redirect(target);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login", url.origin));
  }

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const target = new URL("/auth/login", url.origin);
    target.searchParams.set("error", "oauth_gagal");
    return NextResponse.redirect(target);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", url.origin));

  // Akun lama yang sudah punya usaha atau keanggotaan lembaga diperiksa.
  // Akun lembaga resmi tidak diizinkan masuk menggunakan Google OAuth.
  try {
    const role = await getEffectivePortalRole(supabase, user.id);
    if (role) {
      if (role === "institution") {
        await supabase.auth.signOut();
        const target = new URL("/auth/login", url.origin);
        target.searchParams.set("error", "lembaga_google_prohibited");
        return NextResponse.redirect(target);
      }
      return NextResponse.redirect(new URL("/auth/continue", url.origin));
    }
  } catch {
    const target = new URL("/auth/login", url.origin);
    target.searchParams.set("error", "authorization_unavailable");
    return NextResponse.redirect(target);
  }

  // Akun yang metadatanya sudah lengkap -- misalnya pernah mendaftar lewat
  // surel lalu menautkan Google -- dipulihkan tanpa pertanyaan.
  try {
    await bootstrapAccountFromSignupMetadata(user);
    return NextResponse.redirect(new URL("/auth/continue", url.origin));
  } catch {
    return NextResponse.redirect(new URL("/auth/lengkapi", url.origin));
  }
}
