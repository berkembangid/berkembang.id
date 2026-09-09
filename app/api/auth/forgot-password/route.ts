import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendPasswordResetOtpEmail } from "@/lib/email/resend";
import {
  generateOtp,
  hashOtp,
  OTP_EXPIRY_MINUTES,
} from "@/lib/auth/password-reset";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Alamat email tidak valid." },
        { status: 400 }
      );
    }

    const adminClient = createServiceRoleClient();

    // 1. Cek keberadaan user via Supabase Auth Admin (tanpa membocorkan detail jika tidak ada)
    // Note: Supabase Admin listUsers / getUserById
    const { data: usersData, error: userError } =
      await adminClient.auth.admin.listUsers();

    if (userError) {
      console.error("[ForgotPassword] Admin listUsers error:", userError);
      return NextResponse.json(
        { error: "Terjadi kesalahan pada server. Coba lagi nanti." },
        { status: 500 }
      );
    }

    const matchedUser = usersData.users.find(
      (u) => u.email?.toLowerCase() === email
    );

    // Jika user tidak ditemukan, demi keamanan tetap kembalikan respons sukses
    // atau jika user ingin tahu bisa ditangani. Tapi di berkembang.id kita kembalikan success
    // agar penyerang tidak bisa enumerasi email secara mudah.
    if (!matchedUser) {
      return NextResponse.json({
        success: true,
        message: "Jika email terdaftar, kode verifikasi akan segera dikirimkan.",
      });
    }

    // 2. Cek rate limit sederhana di database: jangan kirim lagi jika baru minta < 60 detik lalu
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentTokens } = await adminClient
      .from("password_reset_tokens")
      .select("id, created_at")
      .eq("email", email)
      .gt("created_at", oneMinuteAgo)
      .limit(1);

    if (recentTokens && recentTokens.length > 0) {
      return NextResponse.json(
        { error: "Permintaan terlalu berdekatan. Tunggu 1 menit sebelum meminta kode baru." },
        { status: 429 }
      );
    }

    // 3. Generate OTP 6-digit & Hash
    const otp = generateOtp();
    const tokenHash = hashOtp(otp);
    const expiresAt = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
    ).toISOString();

    // Invalidate token sebelumnya yang belum used untuk email ini
    await adminClient
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("email", email)
      .is("used_at", null);

    // 4. Simpan ke database
    const { error: insertError } = await adminClient
      .from("password_reset_tokens")
      .insert({
        user_id: matchedUser.id,
        email,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("[ForgotPassword] Insert token error:", insertError);
      return NextResponse.json(
        { error: "Gagal memproses permintaan reset sandi." },
        { status: 500 }
      );
    }

    // 5. Kirim email melalui Resend
    const sendResult = await sendPasswordResetOtpEmail({
      to: email,
      code: otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });

    if (!sendResult.success) {
      console.error("[ForgotPassword] Resend delivery error:", sendResult.error);
      // Tetap beri tahu pengguna jika email delivery gagal
      return NextResponse.json(
        { error: "Gagal mengirimkan surel verifikasi. Silakan coba sesaat lagi." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Kode ${otp.length} angka dikirim ke ${email}. Periksa juga folder spam.`,
    });
  } catch (err: unknown) {
    console.error("[ForgotPassword] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    );
  }
}
