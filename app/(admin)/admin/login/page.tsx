"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const inputEmail = email.trim();

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      if (authError) {
        setError("Email atau kata sandi admin salah. Silakan periksa kembali.");
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Cek apakah akun ini benar memiliki role admin aktif
        const checkRoleRes = await fetch("/api/auth/continue");
        if (checkRoleRes.redirected && checkRoleRes.url.includes("/admin")) {
          window.location.href = "/admin";
          return;
        }

        // Jalankan redirect manual ke /admin untuk diverifikasi oleh proxy/guards
        window.location.href = "/admin";
      }
    } catch {
      setError("Terjadi kesalahan koneksi saat memverifikasi sesi admin.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d121f] text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-cyan-500 selection:text-white">
      {/* Background glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-cyan-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-blue-600/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 mb-4 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
            <ShieldCheck size={28} />
          </div>
          <div className="flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-cyan-400 font-semibold mb-1">
            <Sparkles size={13} /> Ruang Mesin • Berkembang.id
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Portal Masuk Administrator</h1>
          <p className="text-xs text-slate-400 mt-1">Akses operasional sistem, kontrol data, dan kebijakan platform</p>
        </div>

        {/* Form Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
          {error && (
            <div role="alert" aria-live="assertive" className="mb-6 flex gap-3 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-xs font-medium text-red-300">
              <AlertCircle size={17} className="shrink-0 text-red-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Email Administrator
              </label>
              <div className="relative">
                <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@berkembang.id"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-800 bg-slate-950/60 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Kata Sandi
              </label>
              <div className="relative">
                <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-800 bg-slate-950/60 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-900/30 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Mengautentikasi...</span>
                </span>
              ) : (
                <span>Masuk ke Ruang Mesin</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <Link href="/auth/login" className="text-xs text-slate-400 hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5 font-medium">
              ← Kembali ke Login Utama
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-500">
          Akses terbatas. Seluruh aktivitas login diawasi dan tercatat dalam log audit platform.
        </p>
      </div>
    </div>
  );
}
