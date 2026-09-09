"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
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
        const checkRoleRes = await fetch("/api/auth/continue");
        if (checkRoleRes.redirected && checkRoleRes.url.includes("/admin")) {
          window.location.href = "/admin";
          return;
        }
        window.location.href = "/admin";
      }
    } catch {
      setError("Terjadi kesalahan koneksi saat memverifikasi sesi admin.");
      setLoading(false);
    }
  };

  return (
    <>
      <header className="mb-6">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#001b85]">
          <ShieldCheck size={22} />
        </div>
        <h1 className="text-xl font-bold text-[#141a34]">Portal Administrator</h1>
        <p className="mt-1 text-xs text-[#687086]">
          Akses operasional sistem, kontrol data, dan kebijakan platform.
        </p>
      </header>

      {error && (
        <div role="alert" aria-live="assertive" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="admin-email" className="mb-1.5 block text-xs font-bold text-slate-700">
            Email Administrator
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
              <Mail size={17} />
            </span>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@berkembang.id"
              className="field-input"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="admin-password" className="mb-1.5 block text-xs font-bold text-slate-700">
            Kata Sandi
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
              <Lock size={17} />
            </span>
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="field-input has-toggle"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-500"
              aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="min-h-12 w-full rounded-full bg-[#001b85] px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Mengautentikasi...
            </span>
          ) : (
            "Masuk ke Portal Admin"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        <Link href="/auth/login" className="font-semibold text-slate-500 hover:text-[#001b85] transition-colors">
          ← Kembali ke login pengguna
        </Link>
      </p>

      <p className="mt-8 text-center text-[11px] text-slate-400">
        Akses terbatas. Seluruh aktivitas login diawasi dan tercatat dalam log audit platform.
      </p>
    </>
  );
}
