"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertCircle, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [role, setRole] = useState<"umkm" | "institution" | "admin">("umkm");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
        let userRole = data.user.user_metadata?.role || role;

        if (!data.user.user_metadata?.role) {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("role")
              .eq("id", data.user.id)
              .maybeSingle();

            if (profile?.role) {
              userRole = profile.role;
            }
          } catch (err) {
            console.warn("Profiles optional lookup skipped:", err);
          }
        }

        const dest = userRole === "admin" ? "/admin" : userRole === "institution" ? "/institusi" : "/umkm";
        window.location.href = dest;
        return;
      }
    } catch (err: any) {
      console.error("Login catch error:", err);
      setError("Terjadi kesalahan koneksi saat masuk.");
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="font-headline text-2xl font-bold text-[#141a34] mb-1">Selamat Datang!</h1>
      <p className="text-sm text-[#444655] mb-6">Masuk ke akun Anda</p>

      {/* Role Selector Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-[#f3f2ff] rounded-xl">
        {(["umkm", "institution", "admin"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRole(r);
              setError("");
            }}
            className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-colors capitalize cursor-pointer ${
              role === r ? "bg-white text-[#001b85] shadow-sm" : "text-[#444655]"
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
          <label className="block text-xs font-bold text-[#444655] mb-1.5">Email</label>
          <div className="relative">
            <input
              type="email"
              value={email}
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@contoh.com"
              className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
              required
            />
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#444655] mb-1.5">Kata Sandi</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 pl-10 pr-11 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
              required
            />
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
              aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group relative w-full bg-gradient-to-r from-[#001b85] via-[#0b29a8] to-[#1a38bc] hover:from-[#082088] hover:to-[#2244d8] text-white font-bold py-3.5 rounded-xl text-sm transition-all duration-300 mt-2 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:shadow-[#001b85]/30 active:scale-[0.99] overflow-hidden"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Memproses...</span>
            </span>
          ) : (
            <>
              <span>Masuk</span>
              <LogIn size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
            </>
          )}
          <span className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out pointer-events-none" />
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
