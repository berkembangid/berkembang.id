"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

export default function RegisterUMKMPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    namaUsaha: "",
    jenisUsaha: "",
    lokasi: "",
    sektor: "",
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (step < 2) {
      setStep(2);
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
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
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      router.push("/umkm");
    } catch (err) {
      console.error(err);
      setError("Terjadi kesalahan pendaftaran. Silakan coba lagi.");
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
        <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {step === 1 && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Nama Usaha</label>
              <input
                value={form.namaUsaha}
                disabled={loading}
                onChange={(e) => setForm({ ...form, namaUsaha: e.target.value })}
                placeholder="Contoh: Warung Ayam Geprek Ibu Sari"
                className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Sektor Usaha</label>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map((s) => (
                  <button
                    key={s} type="button"
                    disabled={loading}
                    onClick={() => setForm({ ...form, sektor: s })}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
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
              <input
                value={form.lokasi}
                disabled={loading}
                onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
                placeholder="Contoh: Jakarta Selatan"
                className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                required
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                disabled={loading}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@contoh.com"
                className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Kata Sandi</label>
              <input
                type="password"
                value={form.password}
                disabled={loading}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Minimal 8 karakter"
                className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                minLength={8}
                required
              />
            </div>
            <div className="bg-[#f3f2ff] rounded-xl p-3 text-xs text-[#444655]">
              <strong className="text-[#141a34]">Ringkasan pendaftaran:</strong><br />
              Usaha: {form.namaUsaha}<br />
              Sektor: {form.sektor}<br />
              Lokasi: {form.lokasi}
            </div>
          </>
        )}

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-[#001b85] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#0e32c2] transition-colors disabled:bg-[#001b85]/50 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Memproses..." : step === 1 ? "Lanjut →" : "Daftar Sekarang 🚀"}
        </button>
      </form>

      <p className="text-xs text-center text-[#444655] mt-4">
        Sudah punya akun?{" "}
        <Link href="/auth/login" className="text-[#001b85] font-bold hover:underline">Masuk</Link>
      </p>
    </>
  );
}
