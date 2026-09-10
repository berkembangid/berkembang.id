"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, AlertCircle, LogIn } from "lucide-react";
import GoogleButton from "@/components/auth/GoogleButton";
import { supabase } from "@/lib/supabase";

type Portal = "umkm" | "institution" | "investor";

/**
 * Tiga pintu masuk homepage: UMKM, Lembaga, dan Investor / Offtaker.
 * Pintu masuk Admin dipisahkan secara mandiri di /admin/login.
 */
const PORTAL_COPY: Record<Portal, { tab: string; subtitle: string; footer: React.ReactNode }> = {
  umkm: {
    tab: "UMKM",
    subtitle: "Lanjutkan pencatatan dan lihat perkembangan usaha Anda.",
    footer: (
      <>
        Belum punya akun UMKM?{" "}
        <Link href="/auth/register" className="text-[#001b85] font-bold hover:underline">Daftar Gratis</Link>
      </>
    ),
  },
  institution: {
    tab: "Lembaga",
    subtitle: "Buka portal lembaga resmi dan tinjau seluruh data UMKM tanpa batas.",
    footer: (
      <>
        Lembaga didaftarkan khusus melalui admin. Hubungi{" "}
        <a href="mailto:support@berkembang.id" className="text-[#001b85] font-bold hover:underline">support@berkembang.id</a>
      </>
    ),
  },
  investor: {
    tab: "Investor / Offtaker",
    subtitle: "Temukan potensi UMKM terverifikasi dan ajukan kemitraan usaha.",
    footer: (
      <>
        Belum punya akun Investor?{" "}
        <Link href="/auth/register" className="text-[#001b85] font-bold hover:underline">Daftar Sekarang</Link>
      </>
    ),
  },
};

export default function LoginForm({ bounceReason }: { bounceReason: string | null }) {
  const [role, setRole] = useState<Portal>(
    bounceReason === "lembaga_google_prohibited" ? "institution" : "umkm"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // `/auth/continue` dan proxy memantulkan ke sini dengan `?error=`, dan
  // sebelumnya tidak ada yang membacanya: orang memasukkan kata sandi yang
  // benar, kembali ke halaman ini, dan tidak diberi tahu apa pun. Penolakan
  // yang tidak menjelaskan dirinya lebih buruk daripada penolakan.
  const [error, setError] = useState(
    bounceReason === "membership_required"
      ? "Akun ini belum punya akses ke portal mana pun. Coba tekan Masuk sekali lagi; kalau masih sama, mintalah admin mengaktifkan akunnya."
      : bounceReason === "authorization_unavailable"
        ? "Data akun sedang tidak bisa dibaca. Coba lagi sebentar lagi."
        : bounceReason === "lembaga_google_prohibited"
          ? "Akun Lembaga tidak dapat masuk menggunakan Google. Silakan masuk menggunakan Email / Username dan kata sandi."
          : bounceReason
            ? "Sesi Anda berakhir. Silakan masuk kembali."
            : "",
  );
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const inputEmail = email.trim();
    let loginEmail = inputEmail;

    if (!inputEmail.includes("@")) {
      try {
        const res = await fetch("/api/auth/resolve-identifier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: inputEmail }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body.email) loginEmail = body.email;
        } else {
          loginEmail = `${inputEmail.toLowerCase()}@lembaga.berkembang.id`;
        }
      } catch {
        loginEmail = `${inputEmail.toLowerCase()}@lembaga.berkembang.id`;
      }
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
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
        // Dipanggil untuk SETIAP akun, bukan hanya yang metadatanya lengkap.
        // Panggilan ini tidak mengubah apa pun bagi akun yang sudah punya
        // usaha, dan ia satu-satunya jalan pulih bagi akun yang belum.
        const bootstrapResponse = await fetch("/api/auth/bootstrap", { method: "POST" });
        if (bootstrapResponse.status === 409) {
          // Dua keadaan yang sangat berbeda pernah memakai satu kalimat yang
          // sama. Yang satu soal data pendaftaran yang rusak; yang satu lagi
          // soal akun admin yang aksesnya memang belum diaktifkan -- dan
          // kalimat lama menyuruhnya "hubungi pengelola" padahal ia sendiri
          // pengelolanya.
          const body = (await bootstrapResponse.json().catch(() => null)) as { error?: string } | null;
          setError(
            body?.error === "ADMIN_ACCESS_NOT_GRANTED"
              ? "Akun ini terdaftar sebagai admin, tetapi akses adminnya belum diaktifkan di sistem. Status admin tidak pernah diberikan otomatis dari data pendaftaran — mintalah admin lain mengaktifkannya."
              : "Akun ini belum punya data usaha, dan data pendaftarannya tidak lengkap sehingga tidak bisa disiapkan otomatis. Hubungi pengelola.",
          );
          setLoading(false);
          return;
        }
        if (!bootstrapResponse.ok) {
          setError("Data usaha belum berhasil disiapkan. Silakan tekan Masuk sekali lagi. Jika masih gagal, hubungi pengelola.");
          setLoading(false);
          return;
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
      <p className="text-sm leading-6 text-[#687086] mb-7">{PORTAL_COPY[role].subtitle}</p>

      {/* Role Selector Tabs */}
      <div className="flex gap-1 mb-7 p-1 bg-[#f5f7fb] border border-[#e7e9ef] rounded-full">
        {(Object.keys(PORTAL_COPY) as Portal[]).map((r) => (
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
            {PORTAL_COPY[r].tab}
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
          <label htmlFor="login-email" className="block text-xs font-bold text-[#444655] mb-1.5">Email / Username</label>
          <div className="relative">
            <input
              id="login-email"
              type="text"
              autoCapitalize="none"
              value={email}
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@contoh.com atau username"
              className="w-full px-4 py-3 pl-10 rounded-2xl border border-[#d8dce5] text-sm transition-colors disabled:bg-slate-50 disabled:text-slate-400"
              required
            />
            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="login-password" className="block text-xs font-bold text-[#444655]">Kata Sandi</label>
            <Link href="/auth/lupa-sandi" className="text-xs font-bold text-[#001b85] hover:underline">Lupa kata sandi?</Link>
          </div>
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

      {role !== "institution" && (
        <>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">atau</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <GoogleButton label="Masuk dengan Google" />
        </>
      )}

      <p className={`text-xs text-center text-[#444655] ${role === "institution" ? "mt-6" : "mt-4"}`}>
        {PORTAL_COPY[role].footer}
      </p>

      <p className="text-[11px] text-center text-slate-400 mt-6 pt-4 border-t border-slate-100">
        Khusus administrator platform?{" "}
        <Link href="/auth/login/admin" className="text-slate-600 font-semibold hover:underline">
          Masuk ke Portal Admin
        </Link>
      </p>
    </>
  );
}
