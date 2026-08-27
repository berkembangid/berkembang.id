"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, AlertCircle, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [role, setRole] = useState<"umkm" | "institution" | "admin">("umkm");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        let msg = "Email atau kata sandi salah. Silakan periksa kembali.";
        const rawMsg = authError.message || "";
        if (rawMsg && rawMsg !== "{}" && rawMsg !== "Invalid login credentials") {
          if (rawMsg.includes("Email not confirmed")) {
            msg = "Email belum dikonfirmasi. Silakan periksa kotak masuk email Anda.";
          } else {
            msg = rawMsg;
          }
        }
        setError(msg);
        setLoading(false);
        return;
      }

      if (data?.user) {
        if (data.user.user_metadata?.signup_account_type) {
          const bootstrapResponse = await fetch("/api/auth/bootstrap", { method: "POST" });
          if (!bootstrapResponse.ok && bootstrapResponse.status !== 409) {
            setError("Data usaha belum berhasil disiapkan. Silakan tekan Masuk sekali lagi. Jika masih gagal, hubungi pengelola.");
            setLoading(false);
            return;
          }
        }
        window.location.href = "/auth/continue";
        return;
      }
    } catch (err: unknown) {
      console.error("Login catch error:", err);
      setError("Terjadi kesalahan koneksi saat masuk.");
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="font-headline text-2xl font-bold text-[#141a34] mb-2">Masuk ke Berkembang.id</h1>
      <p className="text-sm leading-6 text-[#687086] mb-7">Lanjutkan pencatatan dan lihat perkembangan usaha Anda.</p>

      {/* Role Selector Tabs */}
      <div className="flex gap-1 mb-7 p-1 bg-[#f5f7fb] border border-[#e7e9ef] rounded-full">
        {(["umkm", "institution", "admin"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRole(r);
              setError("");
            }}
            className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-colors capitalize cursor-pointer ${
              role === r ? "bg-white text-[#001b85] shadow-sm" : "text-[#687086] hover:text-[#141a34]"
            }`}
          >
            {r === "umkm" ? "UMKM" : r === "institution" ? "Institusi" : "Admin"}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 mb-4 flex items-start gap-2 animate-fade-in">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-xs font-bold text-[#444655] mb-1.5">Email</label>
          <div className="relative">
            <input
              id="login-email"
              type="email"
              value={email}
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@contoh.com"
              className="w-full px-4 py-3 pl-10 rounded-2xl border border-[#d8dce5] text-sm transition-colors disabled:bg-slate-50 disabled:text-slate-400"
              required
            />
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="block text-xs font-bold text-[#444655] mb-1.5">Kata Sandi</label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full px-4 py-3 pl-10 pr-12 rounded-2xl border border-[#d8dce5] text-sm transition-colors disabled:bg-slate-50 disabled:text-slate-400"
              required
            />
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#001b85] transition-colors p-2 cursor-pointer rounded-full"
              aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group relative w-full bg-[#001b85] hover:bg-[#08299f] text-white font-bold py-3.5 rounded-full text-sm transition-all duration-200 mt-3 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-[0_12px_28px_rgba(0,27,133,.18)] active:scale-[0.99] overflow-hidden"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Memproses...</span>
            </span>
          ) : (
            <>
              <span>Masuk</span>
              <LogIn size={18} className="text-[#72d9ef] transition-transform duration-300 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>

      <p className="text-xs text-center text-[#444655] mt-4">
        Belum punya akun UMKM?{" "}
        <Link href="/auth/register" className="text-[#001b85] font-bold hover:underline">
          Daftar Gratis
        </Link>
      </p>
    </>
  );
}
