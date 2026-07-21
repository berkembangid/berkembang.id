"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertCircle } from "lucide-react";
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
    const targetPath = role === "admin" ? "/admin" : role === "institution" ? "/institusi" : "/umkm";

    try {
      // 1. Authenticate with Supabase Auth
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
        email: inputEmail,
        password,
      });

      if (!authError && signInData?.user) {
        let userRole = signInData.user.user_metadata?.role || role;
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", signInData.user.id)
            .maybeSingle();

          if (profile?.role) {
            userRole = profile.role;
          }
        } catch (err) {
          console.warn("Profiles optional lookup:", err);
        }

        const dest = userRole === "admin" ? "/admin" : userRole === "institution" ? "/institusi" : "/umkm";
        router.push(dest);
        return;
      }

      // 2. If account does not exist in Supabase Auth yet, create account in Supabase
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: inputEmail,
        password: password,
        options: {
          data: {
            nama_usaha: role === "admin" ? "Administrator Utama" : role === "institution" ? "Institusi Mitra" : "Warung Usaha UMKM",
            sektor_usaha: role === "admin" ? "Internal Admin" : role === "institution" ? "Finansial" : "Kuliner",
            lokasi: "Indonesia",
            role: role,
          },
        },
      });

      if (!signUpError && signUpData?.user) {
        try {
          await supabase.from("profiles").insert({
            id: signUpData.user.id,
            email: inputEmail,
            role: role,
            nama_usaha: role === "admin" ? "Administrator Utama" : role === "institution" ? "Institusi Mitra" : "Warung Usaha UMKM",
          });
        } catch (e) {
          console.warn("Profiles insert optional:", e);
        }

        router.push(targetPath);
        return;
      }

      // 3. Display clean error
      let msg = "Email atau kata sandi tidak valid. Silakan periksa kembali.";
      const rawMsg = authError?.message || signUpError?.message || "";
      if (rawMsg && rawMsg !== "{}" && rawMsg !== "Invalid login credentials") {
        msg = rawMsg;
      }
      setError(msg);
      setLoading(false);
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
          className="w-full bg-[#001b85] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#0e32c2] transition-colors mt-2 disabled:bg-[#001b85]/50 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>

      <p className="text-xs text-center text-[#444655] mt-4">
        Belum punya akun UMKM?{" "}
        <Link href="/auth/register/umkm" className="text-[#001b85] font-bold hover:underline">
          Daftar Gratis
        </Link>
      </p>
    </>
  );
}
