"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Building2, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

export default function RegisterUMKMPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    namaUsaha: "",
    jenisUsaha: "",
    lokasi: "",
    sektor: "Kuliner",
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (step < 2) {
      if (!form.namaUsaha.trim() || !form.lokasi.trim()) {
        setError("Silakan isi nama usaha dan kota/kabupaten Anda.");
        return;
      }
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            nama_usaha: form.namaUsaha,
            sektor_usaha: form.sektor,
            lokasi: form.lokasi,
            role: "umkm"
          }
        }
      });

      if (signUpError) {
        let msg = "Terjadi kesalahan pendaftaran. Silakan coba lagi dengan email lain.";
        const rawMsg = signUpError.message || "";

        if (rawMsg && rawMsg !== "{}") {
          if (rawMsg.includes("User already registered")) {
            msg = "Email sudah terdaftar. Silakan gunakan email lain atau masuk ke akun Anda.";
          } else if (rawMsg.includes("Password should be")) {
            msg = "Kata sandi minimal 8 karakter.";
          } else {
            msg = rawMsg;
          }
        }
        
        setError(msg);
        setLoading(false);
        return;
      }

      if (data?.user) {
        try {
          await supabase.from("profiles").insert({
            id: data.user.id,
            email: form.email.trim(),
            role: "umkm",
            nama_usaha: form.namaUsaha,
            sektor: form.sektor,
            lokasi: form.lokasi
          });
        } catch (err) {
          console.warn("Profiles insert optional:", err);
        }
      }

      router.push("/umkm");
    } catch (err: any) {
      console.error("Register catch error:", err);
      let errorMessage = "Terjadi kesalahan pendaftaran.";
      if (typeof err === "string" && err !== "{}") {
        errorMessage = err;
      } else if (err?.message && err.message !== "{}") {
        errorMessage = err.message;
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline text-xl font-bold text-[#141a34]">Daftar UMKM</h1>
          <p className="text-xs text-[#444655] mt-0.5">Langkah {step} dari 2</p>
        </div>
        <div className="flex gap-1.5">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-[#001b85] w-8" : "bg-[#e5e7ff] w-4"}`} />
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 mb-4 flex items-start gap-2 animate-fade-in">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {step === 1 && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Nama Usaha</label>
              <div className="relative">
                <input
                  value={form.namaUsaha}
                  disabled={loading}
                  onChange={(e) => setForm({ ...form, namaUsaha: e.target.value })}
                  placeholder="Contoh: Warung Ayam Geprek Ibu Sari"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  required
                />
                <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Sektor Usaha</label>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => setForm({ ...form, sektor: s })}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                      form.sektor === s ? "bg-[#001b85] text-white border-[#001b85]" : "bg-white text-[#444655] border-[#c5c5d7]"
                    } disabled:opacity-50`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Kota / Kabupaten</label>
              <div className="relative">
                <input
                  value={form.lokasi}
                  disabled={loading}
                  onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
                  placeholder="Contoh: Jakarta Selatan"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  required
                />
                <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Email</label>
              <div className="relative">
                <input
                  type="email"
                  value={form.email}
                  disabled={loading}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@contoh.com"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
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
                  value={form.password}
                  disabled={loading}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimal 8 karakter"
                  className="w-full px-4 py-3 pl-10 pr-11 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  minLength={8}
                  required
                />
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-[#600] transition-colors p-1 cursor-pointer"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="bg-[#f3f2ff] rounded-xl p-3 text-xs text-[#444655] space-y-1">
              <strong className="text-[#141a34]">Ringkasan pendaftaran:</strong><br />
              <span>Usaha: <span className="font-semibold text-slate-800">{form.namaUsaha}</span></span><br />
              <span>Sektor: <span className="font-semibold text-slate-800">{form.sektor}</span></span><br />
              <span>Lokasi: <span className="font-semibold text-slate-800">{form.lokasi}</span></span>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={loading}
              className="border border-slate-200 text-slate-600 font-bold px-4 py-3.5 rounded-xl text-sm hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ← Kembali
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#001b85] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#0e32c2] transition-colors disabled:bg-[#001b85]/50 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? "Memproses..." : step === 1 ? "Lanjut →" : "Daftar Sekarang 🚀"}
          </button>
        </div>
      </form>

      <p className="text-xs text-center text-[#444655] mt-4">
        Sudah punya akun?{" "}
        <Link href="/auth/login" className="text-[#001b85] font-bold hover:underline">Masuk</Link>
      </p>
    </>
  );
}
