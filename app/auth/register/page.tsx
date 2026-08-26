"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Store, Building, User, ShieldCheck, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";

const UMKM_SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];
const INSTITUSI_TYPES = ["Bank / Koperasi", "Lembaga Pemerintah", "Investor / VC", "NGO / Yayasan", "Universitas", "Lainnya"];

type Role = "umkm" | "institution";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("umkm");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
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

    if (!agreeTerms) {
      setError("Silakan setujui Syarat & Ketentuan dan Kebijakan Privasi terlebih dahulu.");
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
            signup_account_type: "umkm",
          }
        : {
            nama_institusi: institusiForm.namaInstitusi,
            jenis_institusi: institusiForm.jenisInstitusi,
            lokasi: institusiForm.kota,
            nama_contact: institusiForm.namaContact,
            signup_account_type: "institution",
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
        if (data.session) {
          const bootstrapResponse = await fetch("/api/auth/bootstrap", { method: "POST" });
          if (!bootstrapResponse.ok) {
            setError("Akun dibuat, tetapi profil keanggotaan belum dapat disiapkan. Silakan masuk kembali.");
            setLoading(false);
            return;
          }
          window.location.href = "/auth/continue";
          return;
        }
      }

      router.push("/auth/login?registered=1");
    } catch (err: unknown) {
      console.error("Register catch error:", err);
      let msg = "Terjadi kesalahan pendaftaran.";
      if (err instanceof Error && err.message !== "{}") msg = err.message;
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
          <h1 className="font-headline text-xl font-bold text-[#141a34]">Buat akun Berkembang.id</h1>
          <p className="text-xs text-[#687086] mt-1">Langkah {step} dari 2 · Isi data yang paling penting dulu</p>
        </div>
        <div className="flex gap-1.5">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-[#02a8d0] w-8" : "bg-[#dfe5eb] w-4"}`} />
          ))}
        </div>
      </div>

      {/* Role Tab Selector (Step 1 only) */}
      {step === 1 && (
        <div className="flex gap-1 mb-6 p-1 bg-[#f5f7fb] border border-[#e7e9ef] rounded-full">
          {(["umkm", "institution"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRoleChange(r)}
              className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                role === r ? "bg-white text-[#001b85] shadow-sm" : "text-[#687086] hover:text-[#141a34]"
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
              <label className="block text-xs font-bold text-[#444655] mb-1.5">Kota / Kabupaten Usaha *</label>
              <CitySelect
                value={umkmForm.lokasi}
                disabled={loading}
                onChange={(val) => setUmkmForm({ ...umkmForm, lokasi: val })}
                placeholder="Pilih Kota / Kabupaten Usaha..."
                required
              />
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
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Kota / Kabupaten *</label>
                <CitySelect
                  value={institusiForm.kota}
                  disabled={loading}
                  onChange={(val) => setInstitusiForm({ ...institusiForm, kota: val })}
                  placeholder="Pilih Kota..."
                  required
                />
              </div>
            </div>
          </>
        )}

        {/* ───────── STEP 2 ───────── */}
        {step === 2 && (
          <>
            {/* Summary box */}
            <div className="bg-[#f2f9fb] rounded-2xl p-4 text-xs text-[#566072] space-y-1 border border-[#d9eef4]">
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

            {/* Terms and Conditions Checkbox */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="agreeTerms"
                checked={agreeTerms}
                disabled={loading}
                onChange={(e) => {
                  setAgreeTerms(e.target.checked);
                  if (error) setError("");
                }}
                className="mt-0.5 h-4 w-4 rounded border-[#c5c5d7] text-[#001b85] focus:ring-[#001b85] cursor-pointer"
                required
              />
              <label htmlFor="agreeTerms" className="text-xs text-[#566072] leading-relaxed cursor-pointer select-none">
                Saya menyetujui{" "}
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  className="text-[#001b85] font-bold underline hover:text-[#08299f] cursor-pointer inline focus:outline-none"
                >
                  Syarat &amp; Ketentuan
                </button>{" "}
                dan Kebijakan Perlindungan Data.
              </label>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {step === 2 && (
            <button
              type="button" onClick={() => setStep(1)} disabled={loading}
              className="border border-[#d8dce5] text-[#566072] font-bold px-5 py-3.5 rounded-full text-sm hover:bg-[#f5f7fb] transition-colors cursor-pointer"
            >
              ← Kembali
            </button>
          )}
          <button
            type="submit"
            disabled={loading || (step === 2 && !agreeTerms)}
            className="flex-1 bg-[#001b85] text-white font-bold py-3.5 rounded-full text-sm hover:bg-[#08299f] transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shadow-[0_12px_28px_rgba(0,27,133,.16)]"
          >
            {loading ? "Memproses..." : step === 1 ? "Lanjut →" : `Daftar sebagai ${role === "umkm" ? "UMKM" : "Institusi"}`}
          </button>
        </div>
      </form>

      <p className="text-xs text-center text-[#444655] mt-4">
        Sudah punya akun?{" "}
        <Link href="/auth/login" className="text-[#001b85] font-bold hover:underline">Masuk</Link>
      </p>

      {/* Terms & Conditions Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={() => setShowTermsModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#001b85] flex items-center justify-center">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#141a34]">Syarat &amp; Ketentuan Layanan</h3>
                  <p className="text-[11px] text-[#687086]">Kebijakan Perlindungan Privasi Data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed">
              {/* Privacy Highlight Box */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 text-[#001b85]">
                <div className="flex items-center gap-1.5 font-bold text-xs mb-1.5 text-[#001b85]">
                  <Lock size={14} className="shrink-0" />
                  <span>Komitmen Privasi &amp; Penggunaan Data:</span>
                </div>
                <p className="font-medium text-slate-800 text-[12px] leading-relaxed">
                  “Data yang dikumpulkan akan digunakan semata-mata untuk mendukung operasional, pengembangan, dan peningkatan layanan website. Kami tidak menjual, menyewakan, atau memperdagangkan data pengguna kepada pihak ketiga.”
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <CheckCircle2 size={14} className="text-[#001b85]" /> 1. Operasional &amp; Fitur Layanan
                  </h4>
                  <p className="pl-5 text-[11px] text-slate-600">
                    Data transaksi, profil, dan dokumen yang Anda masukkan diolah untuk kalkulasi Skor Kesiapan, Analisis Gap, dan asisten AI Copilot guna mendukung kemajuan usaha Anda.
                  </p>
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <CheckCircle2 size={14} className="text-[#001b85]" /> 2. Hak &amp; Kendali Penuh
                  </h4>
                  <p className="pl-5 text-[11px] text-slate-600">
                    Anda memiliki kendali penuh untuk memperbarui, mengubah, atau menghapus data dan dokumen usaha Anda kapan saja melalui dashboard profil.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-right">
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-[11px] font-bold text-[#001b85] hover:underline inline-flex items-center gap-1"
                >
                  Baca Halaman Syarat &amp; Ketentuan Lengkap ↗
                </Link>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgreeTerms(true);
                  setShowTermsModal(false);
                  if (error) setError("");
                }}
                className="px-4 py-2 text-xs font-bold bg-[#001b85] text-white hover:bg-[#08299f] rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Saya Mengerti &amp; Setujui
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
