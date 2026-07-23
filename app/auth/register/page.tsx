"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Building2, MapPin, Store, Building, User } from "lucide-react";
import { supabase } from "@/lib/supabase";

const UMKM_SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];
const INSTITUSI_TYPES = ["Bank / Koperasi", "Lembaga Pemerintah", "Investor / VC", "NGO / Yayasan", "Universitas", "Lainnya"];

type Role = "umkm" | "institution";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("umkm");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // UMKM form fields
  const [umkmForm, setUmkmForm] = useState({
    namaPemilik: "",
    namaUsaha: "",
    sektor: "Kuliner",
    lokasi: "",
    email: "",
    password: "",
  });

  // Institusi form fields
  const [institusiForm, setInstitusiForm] = useState({
    namaInstitusi: "",
    jenisInstitusi: "Bank / Koperasi",
    kota: "",
    namaContact: "",
    email: "",
    password: "",
  });

  const handleRoleChange = (r: Role) => {
    setRole(r);
    setStep(1);
    setError("");
  };

  const validateStep1 = () => {
    if (role === "umkm") {
      if (!umkmForm.namaPemilik.trim() || !umkmForm.namaUsaha.trim() || !umkmForm.lokasi.trim()) {
        setError("Silakan isi nama pemilik, nama usaha, dan kota/kabupaten Anda.");
        return false;
      }
    } else {
      if (!institusiForm.namaInstitusi.trim() || !institusiForm.kota.trim() || !institusiForm.namaContact.trim()) {
        setError("Silakan isi nama institusi, nama kontak, dan kota.");
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (step < 2) {
      if (!validateStep1()) return;
      setStep(2);
      return;
    }

    setLoading(true);
    const email = role === "umkm" ? umkmForm.email.trim() : institusiForm.email.trim();
    const password = role === "umkm" ? umkmForm.password : institusiForm.password;

    try {
      const metadata = role === "umkm"
        ? {
            nama_pemilik: umkmForm.namaPemilik,
            nama_usaha: umkmForm.namaUsaha,
            sektor_usaha: umkmForm.sektor,
            lokasi: umkmForm.lokasi,
            role: "umkm",
          }
        : {
            nama_institusi: institusiForm.namaInstitusi,
            jenis_institusi: institusiForm.jenisInstitusi,
            lokasi: institusiForm.kota,
            nama_contact: institusiForm.namaContact,
            role: "institution",
          };

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });

      if (signUpError) {
        let msg = "Terjadi kesalahan pendaftaran. Silakan coba lagi.";
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
            email,
            role: role === "umkm" ? "umkm" : "institution",
            name: role === "umkm" ? umkmForm.namaPemilik : institusiForm.namaInstitusi,
            nama_pemilik: role === "umkm" ? umkmForm.namaPemilik : null,
            nama_usaha: role === "umkm" ? umkmForm.namaUsaha : null,
            sektor_usaha: role === "umkm" ? umkmForm.sektor : null,
            nama_institusi: role === "institution" ? institusiForm.namaInstitusi : null,
            jenis_institusi: role === "institution" ? institusiForm.jenisInstitusi : null,
            nama_contact: role === "institution" ? institusiForm.namaContact : null,
            lokasi: role === "umkm" ? umkmForm.lokasi : institusiForm.kota,
          });

          if (role === "institution") {
            await supabase.from("institutions").insert({
              name: institusiForm.namaInstitusi,
              type: institusiForm.jenisInstitusi || "Bank / Koperasi",
              programs_count: 1,
              active: true,
            });
          }
        } catch (err) {
          console.warn("Profiles/Institutions insert optional:", err);
        }
      }

      router.push(role === "umkm" ? "/umkm" : "/institusi");
    } catch (err: any) {
      console.error("Register catch error:", err);
      let msg = "Terjadi kesalahan pendaftaran.";
      if (err?.message && err.message !== "{}") msg = err.message;
      setError(msg);
      setLoading(false);
    }
  };

  const passwordValue = role === "umkm" ? umkmForm.password : institusiForm.password;
  const emailValue = role === "umkm" ? umkmForm.email : institusiForm.email;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-headline text-xl font-bold text-[#141a34]">Daftar Akun</h1>
          <p className="text-xs text-[#444655] mt-0.5">Langkah {step} dari 2</p>
        </div>
        <div className="flex gap-1.5">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-[#001b85] w-8" : "bg-[#e5e7ff] w-4"}`} />
          ))}
        </div>
      </div>

      {/* Role Tab Selector (Step 1 only) */}
      {step === 1 && (
        <div className="flex gap-2 mb-5 p-1 bg-[#f3f2ff] rounded-xl">
          {(["umkm", "institution"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRoleChange(r)}
              className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                role === r ? "bg-white text-[#001b85] shadow-sm" : "text-[#444655]"
              }`}
            >
              {r === "umkm" ? <Store size={13} /> : <Building size={13} />}
              {r === "umkm" ? "UMKM / Usaha" : "Institusi / Mitra"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-xs font-semibold p-3.5 rounded-xl border border-red-100 mb-4 flex items-start gap-2 animate-fade-in">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ───────── STEP 1 ───────── */}
        {step === 1 && role === "umkm" && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Nama Pemilik (Owner)</label>
              <div className="relative">
                <input
                  value={umkmForm.namaPemilik}
                  disabled={loading}
                  onChange={(e) => setUmkmForm({ ...umkmForm, namaPemilik: e.target.value })}
                  placeholder="Contoh: Ibu Sari"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                  required
                />
                <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Nama Usaha</label>
              <div className="relative">
                <input
                  value={umkmForm.namaUsaha}
                  disabled={loading}
                  onChange={(e) => setUmkmForm({ ...umkmForm, namaUsaha: e.target.value })}
                  placeholder="Contoh: Warung Ayam Geprek Ibu Sari"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                  required
                />
                <Store size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Sektor Usaha</label>
              <div className="flex flex-wrap gap-2">
                {UMKM_SECTORS.map((s) => (
                  <button
                    key={s} type="button" disabled={loading}
                    onClick={() => setUmkmForm({ ...umkmForm, sektor: s })}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                      umkmForm.sektor === s ? "bg-[#001b85] text-white border-[#001b85]" : "bg-white text-[#444655] border-[#c5c5d7]"
                    } disabled:opacity-50`}
                  >{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Kota / Kabupaten</label>
              <div className="relative">
                <input
                  value={umkmForm.lokasi} disabled={loading}
                  onChange={(e) => setUmkmForm({ ...umkmForm, lokasi: e.target.value })}
                  placeholder="Contoh: Jakarta Selatan"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                  required
                />
                <MapPin size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </>
        )}

        {step === 1 && role === "institution" && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Nama Institusi</label>
              <div className="relative">
                <input
                  value={institusiForm.namaInstitusi} disabled={loading}
                  onChange={(e) => setInstitusiForm({ ...institusiForm, namaInstitusi: e.target.value })}
                  placeholder="Contoh: BRI KUR, Dinas Koperasi Kota X"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                  required
                />
                <Building size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Jenis Institusi</label>
              <div className="flex flex-wrap gap-2">
                {INSTITUSI_TYPES.map((t) => (
                  <button
                    key={t} type="button" disabled={loading}
                    onClick={() => setInstitusiForm({ ...institusiForm, jenisInstitusi: t })}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                      institusiForm.jenisInstitusi === t ? "bg-[#001b85] text-white border-[#001b85]" : "bg-white text-[#444655] border-[#c5c5d7]"
                    } disabled:opacity-50`}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Nama Kontak</label>
                <input
                  value={institusiForm.namaContact} disabled={loading}
                  onChange={(e) => setInstitusiForm({ ...institusiForm, namaContact: e.target.value })}
                  placeholder="Nama PIC / Petugas"
                  className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Kota</label>
                <div className="relative">
                  <input
                    value={institusiForm.kota} disabled={loading}
                    onChange={(e) => setInstitusiForm({ ...institusiForm, kota: e.target.value })}
                    placeholder="Jakarta"
                    className="w-full px-4 py-3 pl-9 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                    required
                  />
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ───────── STEP 2 ───────── */}
        {step === 2 && (
          <>
            {/* Summary box */}
            <div className="bg-[#f3f2ff] rounded-xl p-3 text-xs text-[#444655] space-y-0.5 border border-[#e5e7ff]">
              <p className="font-bold text-[#141a34] mb-1">Ringkasan {role === "umkm" ? "Usaha" : "Institusi"}:</p>
              {role === "umkm" ? (
                <>
                  <p>Usaha: <span className="font-semibold text-slate-800">{umkmForm.namaUsaha}</span></p>
                  <p>Sektor: <span className="font-semibold text-slate-800">{umkmForm.sektor}</span></p>
                  <p>Lokasi: <span className="font-semibold text-slate-800">{umkmForm.lokasi}</span></p>
                </>
              ) : (
                <>
                  <p>Institusi: <span className="font-semibold text-slate-800">{institusiForm.namaInstitusi}</span></p>
                  <p>Jenis: <span className="font-semibold text-slate-800">{institusiForm.jenisInstitusi}</span></p>
                  <p>Kontak: <span className="font-semibold text-slate-800">{institusiForm.namaContact}</span></p>
                  <p>Kota: <span className="font-semibold text-slate-800">{institusiForm.kota}</span></p>
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Email</label>
              <div className="relative">
                <input
                  type="email" value={emailValue} disabled={loading}
                  onChange={(e) => role === "umkm"
                    ? setUmkmForm({ ...umkmForm, email: e.target.value })
                    : setInstitusiForm({ ...institusiForm, email: e.target.value })}
                  placeholder="email@contoh.com"
                  className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                  required
                />
                <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Kata Sandi</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordValue} disabled={loading}
                  onChange={(e) => role === "umkm"
                    ? setUmkmForm({ ...umkmForm, password: e.target.value })
                    : setInstitusiForm({ ...institusiForm, password: e.target.value })}
                  placeholder="Minimal 8 karakter"
                  minLength={8}
                  className="w-full px-4 py-3 pl-10 pr-11 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none disabled:bg-slate-50"
                  required
                />
                <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {step === 2 && (
            <button
              type="button" onClick={() => setStep(1)} disabled={loading}
              className="border border-slate-200 text-slate-600 font-bold px-4 py-3.5 rounded-xl text-sm hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ← Kembali
            </button>
          )}
          <button
            type="submit" disabled={loading}
            className="flex-1 bg-[#001b85] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#0e32c2] transition-colors disabled:bg-[#001b85]/50 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? "Memproses..." : step === 1 ? "Lanjut →" : `Daftar ${role === "umkm" ? "UMKM" : "Institusi"} 🚀`}
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
