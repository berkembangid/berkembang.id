import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resetSessionToken =
      typeof body.resetSessionToken === "string" ? body.resetSessionToken.trim() : "";
    const newPassword = typeof body.password === "string" ? body.password : "";

    if (!resetSessionToken) {
      return NextResponse.json(
        { error: "Sesi pemulihan tidak valid atau sudah kedaluwarsa. Silakan ulangi proses." },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Kata sandi minimal 8 karakter." },
        { status: 400 }
      );
    }

    const adminClient = createServiceRoleClient();

    // 1. Cari token record berdasarkan reset_session_token yang belum used
    const { data: records, error: fetchError } = await adminClient
      .from("password_reset_tokens")
      .select("*")
      .eq("reset_session_token", resetSessionToken)
      .is("used_at", null)
      .limit(1);

    if (fetchError || !records || records.length === 0) {
      return NextResponse.json(
        { error: "Sesi pemulihan tidak ditemukan atau sudah digunakan." },
        { status: 400 }
      );
    }

    const resetRecord = records[0];

    // Cek expiry waktu (berlaku maksimal 15 menit dari pembuatan awal record)
    const isExpired =
      new Date(resetRecord.expires_at).getTime() + 10 * 60 * 1000 < Date.now();
    if (isExpired) {
      return NextResponse.json(
        { error: "Sesi pemulihan telah berakhir. Silakan minta kode baru." },
        { status: 400 }
      );
    }

    // 2. Update password user di Supabase Auth via Admin API
    const { error: updateAuthError } =
      await adminClient.auth.admin.updateUserById(resetRecord.user_id, {
        password: newPassword,
      });

    if (updateAuthError) {
      console.error("[ResetPassword] Supabase update user error:", updateAuthError);
      return NextResponse.json(
        { error: updateAuthError.message || "Gagal memperbarui kata sandi." },
        { status: 500 }
      );
    }

    // 3. Tandai token sudah digunakan (digunakan satu kali saja)
    await adminClient
      .from("password_reset_tokens")
      .update({
        used_at: new Date().toISOString(),
        reset_session_token: null,
      })
      .eq("id", resetRecord.id);

    return NextResponse.json({
      success: true,
      message: "Kata sandi Anda berhasil diperbarui.",
    });
  } catch (err: unknown) {
    console.error("[ResetPassword] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    );
  }
}
