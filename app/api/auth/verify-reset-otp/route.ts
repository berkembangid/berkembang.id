import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  generateResetSessionToken,
  hashOtp,
  MAX_VERIFY_ATTEMPTS,
} from "@/lib/auth/password-reset";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email dan kode verifikasi wajib diisi." },
        { status: 400 }
      );
    }

    const adminClient = createServiceRoleClient();

    // 1. Ambil token aktif paling baru untuk email ini
    const { data: tokens, error: fetchError } = await adminClient
      .from("password_reset_tokens")
      .select("*")
      .eq("email", email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError || !tokens || tokens.length === 0) {
      return NextResponse.json(
        { error: "Kode tidak ditemukan atau sudah tidak berlaku. Silakan minta kode baru." },
        { status: 400 }
      );
    }

    const currentToken = tokens[0];

    // 2. Cek apakah token sudah expired
    const isExpired = new Date(currentToken.expires_at).getTime() < Date.now();
    if (isExpired) {
      return NextResponse.json(
        { error: "Kode verifikasi sudah kedaluwarsa (berlaku 5 menit). Minta kode baru." },
        { status: 400 }
      );
    }

    // 3. Cek batas percobaan gagal
    if (currentToken.attempts >= MAX_VERIFY_ATTEMPTS) {
      await adminClient
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", currentToken.id);

      return NextResponse.json(
        { error: "Terlalu banyak percobaan salah. Kode ini dibatalkan. Silakan minta kode baru." },
        { status: 429 }
      );
    }

    // 4. Verifikasi hash OTP
    const incomingHash = hashOtp(code);
    if (incomingHash !== currentToken.token_hash) {
      // Tambah counter attempts
      await adminClient
        .from("password_reset_tokens")
        .update({ attempts: currentToken.attempts + 1 })
        .eq("id", currentToken.id);

      const remaining = MAX_VERIFY_ATTEMPTS - (currentToken.attempts + 1);
      const hint = remaining > 0 ? ` Sisa percobaan: ${remaining} kali.` : "";

      return NextResponse.json(
        { error: `Kode yang Anda masukkan salah.${hint}` },
        { status: 400 }
      );
    }

    // 5. OTP Benar! Buat temporary reset_session_token
    const resetSessionToken = generateResetSessionToken();

    const { error: updateTokenError } = await adminClient
      .from("password_reset_tokens")
      .update({
        reset_session_token: resetSessionToken,
      })
      .eq("id", currentToken.id);

    if (updateTokenError) {
      console.error("[VerifyResetOtp] update reset session error:", updateTokenError);
      return NextResponse.json(
        { error: "Gagal memproses sesi pemulihan." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      resetSessionToken,
    });
  } catch (err: unknown) {
    console.error("[VerifyResetOtp] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    );
  }
}
