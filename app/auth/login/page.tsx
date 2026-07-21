"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Sparkles, ShieldCheck, Building, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PRESET_ACCOUNTS = {
  umkm: {
    email: "umkm@berkembang.id",
    password: "UmkmPassword123!",
    role: "umkm" as const,
  },
  institution: {
    email: "institusi@berkembang.id",
    password: "InstitusiPassword123!",
    role: "institution" as const,
  },
  admin: {
    email: "admin@berkembang.id",
    password: "AdminPassword123!",
    role: "admin" as const,
  },
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"umkm" | "institution" | "admin">("umkm");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const fillPresetAccount = (selectedRole: "umkm" | "institution" | "admin") => {
    setRole(selectedRole);
    setEmail(PRESET_ACCOUNTS[selectedRole].email);
    setPassword(PRESET_ACCOUNTS[selectedRole].password);
    setError("");
  };

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

      // 2. If account does not exist in Supabase Auth yet, create real account in Supabase
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: inputEmail,
        password: password,
        options: {
          data: {
            nama_usaha: role === "admin" ? "Administrator Utama" : role === "institution" ? "Bank Mandiri Wirausaha" : "Warung Ibu Sari",
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
            nama_usaha: role === "admin" ? "Administrator Utama" : role === "institution" ? "Bank Mandiri Wirausaha" : "Warung Ibu Sari",
          });
        } catch (e) {
          console.warn("Profiles insert optional:", e);
        }

        router.push(targetPath);
        return;
      }

      // 3. For UMKM / Institusi preview if offline/unconfirmed
      if (role !== "admin" && inputEmail.includes("@berkembang.id")) {
        router.push(targetPath);
        return;
      }

      // 4. Display exact error for Admin or failed Auth
      let msg = "Email atau kata sandi tidak valid. Silakan periksa kembali.";
      const rawMsg = authError?.message || signUpError?.message || "";
      if (rawMsg && rawMsg !== "{}" && rawMsg !== "Invalid login credentials") {
        msg = rawMsg;
      }
      setError(msg);
      setLoading(false);
    } catch (err: any) {
      console.error("Login catch error:", err);
      if (role !== "admin" && inputEmail.includes("@berkembang.id")) {
        router.push(targetPath);
        return;
      }
      setError("Terjadi kesalahan koneksi saat masuk.");
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="font-headline text-2xl font-bold text-[#141a34] mb-1">Selamat Datang!</h1>
      <p className="text-sm text-[#444655] mb-4">Masuk ke akun Anda</p>

      {/* Role selector */}
      <div className="flex gap-2 mb-4 p-1 bg-[#f3f2ff] rounded-xl">
        {(["umkm", "institution", "admin"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors capitalize cursor-pointer ${
              role === r ? "bg-white text-[#001b85] shadow-sm" : "text-[#444655]"
            }`}
          >
            {r === "umkm" ? "UMKM" : r === "institution" ? "Institusi" : "Admin"}
          </button>
        ))}
      </div>

      {/* Preset Fill Buttons */}
      <div className="bg-[#f8fafc] border border-slate-200/80 rounded-xl p-3 mb-5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={12} className="text-[#001b85]" /> Pilih Kredensial Akun
          </span>
          <span className="text-[9px] font-semibold text-[#001b85] bg-[#ececff] px-2 py-0.5 rounded-full">Supabase Auth</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => fillPresetAccount("umkm")}
            className={`px-2 py-2 rounded-lg border text-[11px] font-bold transition-all text-left flex items-center gap-1.5 cursor-pointer ${
              role === "umkm" && email === PRESET_ACCOUNTS.umkm.email
                ? "bg-[#001b85] text-white border-[#001b85] shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:border-[#001b85]"
            }`}
          >
            <Store size={12} />
            <span className="truncate">UMKM</span>
          </button>
          <button
            type="button"
            onClick={() => fillPresetAccount("institution")}
            className={`px-2 py-2 rounded-lg border text-[11px] font-bold transition-all text-left flex items-center gap-1.5 cursor-pointer ${
              role === "institution" && email === PRESET_ACCOUNTS.institution.email
                ? "bg-[#001b85] text-white border-[#001b85] shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:border-[#001b85]"
            }`}
          >
            <Building size={12} />
            <span className="truncate">Institusi</span>
          </button>
          <button
            type="button"
            onClick={() => fillPresetAccount("admin")}
            className={`px-2 py-2 rounded-lg border text-[11px] font-bold transition-all text-left flex items-center gap-1.5 cursor-pointer ${
              role === "admin" && email === PRESET_ACCOUNTS.admin.email
                ? "bg-[#001b85] text-white border-[#001b85] shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:border-[#001b85]"
            }`}
          >
            <ShieldCheck size={12} />
            <span className="truncate">Admin (Real)</span>
          </button>
        </div>
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
