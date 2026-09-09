"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import OtpInput from "@/components/auth/OtpInput";
import { isCompleteOtp, OTP_LENGTH } from "@/modules/auth/otp";

type Stage = "email" | "kode" | "sandi" | "selesai";

/**
 * Lupa kata sandi, tiga langkah pada satu layar.
 *
 * Bukan tiga halaman: alamat surel yang baru diketik harus tetap terlihat saat
 * kode dimasukkan, dan berpindah halaman di tengah jalan adalah cara paling
 * mudah kehilangan orang yang sedang berpindah ke aplikasi surelnya.
 *
 * Kode dipakai, bukan tautan. Tautan mengharuskan orang membuka surel di
 * peramban yang sama; kode bisa dibaca di ponsel lalu diketik di komputer.
 */
export default function ForgotPasswordPage() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const [resetSessionToken, setResetSessionToken] = useState("");

  async function sendCode(silent = false) {
    setError("");
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Kode belum dapat dikirim. Coba lagi sebentar lagi.");
        setLoading(false);
        return false;
      }
      setNote(data.message || `Kode ${OTP_LENGTH} angka dikirim ke ${email.trim()}. Periksa juga folder spam.`);
      setStage("kode");
      setLoading(false);
      return true;
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
      setLoading(false);
      return false;
    }
  }

  async function verifyCode() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-reset-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Kode belum dapat diperiksa. Coba lagi.");
        setLoading(false);
        return;
      }
      setResetSessionToken(data.resetSessionToken);
      setNote("");
      setStage("sandi");
      setLoading(false);
    } catch {
      setError("Gagal memverifikasi kode. Periksa koneksi internet Anda.");
      setLoading(false);
    }
  }

  async function savePassword() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resetSessionToken,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Kata sandi belum tersimpan. Coba lagi.");
        setLoading(false);
        return;
      }
      setStage("selesai");
      setLoading(false);
    } catch {
      setError("Gagal memperbarui kata sandi. Periksa koneksi internet Anda.");
      setLoading(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (stage === "email") { void sendCode(); return; }
    if (stage === "kode") { void verifyCode(); return; }
    if (stage === "sandi") { void savePassword(); }
  }

  return (
    <>
      <h1 className="font-headline mb-2 text-2xl font-bold text-[#141a34]">
        {stage === "selesai" ? "Kata sandi tersimpan" : "Lupa kata sandi"}
      </h1>
      <p className="mb-7 text-sm leading-6 text-[#687086]">
        {stage === "email" && "Masukkan alamat surel akun Anda. Kami kirimkan kode untuk mengatur ulang kata sandi."}
        {stage === "kode" && "Masukkan kode yang baru saja dikirim ke surel Anda."}
        {stage === "sandi" && "Tetapkan kata sandi baru untuk akun Anda."}
        {stage === "selesai" && "Silakan masuk memakai kata sandi baru Anda."}
      </p>

      {error && (
        <div role="alert" aria-live="assertive" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}
      {note && !error && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{note}</p>
      )}

      {stage === "selesai" ? (
        <Link href="/auth/login" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#001b85] text-sm font-bold text-white">
          <CheckCircle2 size={16} /> Masuk sekarang
        </Link>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {stage === "email" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Email</span>
              <span className="relative block">
                <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-500" />
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field-input" placeholder="email@contoh.com" autoComplete="email" required />
              </span>
            </label>
          )}

          {stage === "kode" && (
            <OtpInput value={code} onChange={setCode} onResend={async () => { await sendCode(true); }} disabled={loading} />
          )}

          {stage === "sandi" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Kata sandi baru</span>
              <span className="relative block">
                <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-500" />
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="field-input has-toggle" placeholder="Minimal 8 karakter" autoComplete="new-password" minLength={8} required />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-500">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading || (stage === "kode" && !isCompleteOtp(code)) || (stage === "sandi" && password.length < 8)}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#001b85] text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? "Memproses…" : stage === "email" ? "Kirim kode" : stage === "kode" ? "Periksa kode" : "Simpan kata sandi"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-[#687086]">
        <Link href="/auth/login" className="inline-flex items-center gap-1 font-bold text-[#001b85]">
          <ArrowLeft size={13} /> Kembali ke halaman masuk
        </Link>
      </p>
    </>
  );
}
