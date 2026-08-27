"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building, CheckCircle2, Eye, EyeOff, Lock, Mail, Store, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";

type Role = "umkm" | "institution";
const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];
const INSTITUTION_TYPES = ["Bank / Koperasi", "Lembaga Pemerintah", "Investor", "NGO / Yayasan", "Universitas", "Lainnya"];

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("umkm");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");
  const [account, setAccount] = useState({ contactName: "", email: "", password: "" });
  const [business, setBusiness] = useState({ name: "", sector: "Kuliner", city: "" });
  const [institution, setInstitution] = useState({ name: "", type: "Bank / Koperasi", city: "" });
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!showTerms) return;
    closeRef.current?.focus();
    function handleDialogKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setShowTerms(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleDialogKey);
    return () => document.removeEventListener("keydown", handleDialogKey);
  }, [showTerms]);

  function changeRole(nextRole: Role) { setRole(nextRole); setStep(1); setError(""); }
  function continueToBusiness() {
    setError("");
    if (!account.contactName.trim() || !account.email.trim() || account.password.length < 8) { setError("Isi nama, email, dan kata sandi minimal 8 karakter."); return; }
    if (!agreeTerms) { setError("Baca dan setujui syarat penggunaan serta kebijakan privasi."); return; }
    setStep(2);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (step === 1) { continueToBusiness(); return; }
    if (role === "umkm" && (!business.name.trim() || !business.city.trim())) { setError("Isi nama usaha dan kota atau kabupaten usaha."); return; }
    if (role === "institution" && (!institution.name.trim() || !institution.city.trim())) { setError("Isi nama institusi dan kota atau kabupaten."); return; }
    setLoading(true);
    try {
      const metadata = role === "umkm" ? { nama_pemilik: account.contactName.trim(), nama_usaha: business.name.trim(), sektor_usaha: business.sector, lokasi: business.city, signup_account_type: "umkm" } : { nama_contact: account.contactName.trim(), nama_institusi: institution.name.trim(), jenis_institusi: institution.type, lokasi: institution.city, signup_account_type: "institution" };
      const { data, error: signUpError } = await supabase.auth.signUp({ email: account.email.trim(), password: account.password, options: { data: metadata } });
      if (signUpError) {
        if (signUpError.message.includes("already registered")) throw new Error("Email sudah terdaftar. Silakan masuk atau gunakan email lain.");
        if (signUpError.message.includes("Password")) throw new Error("Kata sandi minimal 8 karakter.");
        throw signUpError;
      }
      if (data.session) {
        const response = await fetch("/api/auth/bootstrap", { method: "POST" });
        if (!response.ok && response.status !== 409) throw new Error("Akun dibuat, tetapi data usaha belum dapat disiapkan. Silakan masuk kembali.");
        window.location.href = role === "umkm" ? "/umkm/catat?onboarding=1" : "/auth/continue";
        return;
      }
      window.location.href = "/auth/login?registered=1";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pendaftaran belum berhasil. Silakan coba lagi."); setLoading(false); }
  }

  return <>
    <header className="mb-5"><h1 className="text-xl font-bold text-[#141a34]">Buat akun Berkembang.id</h1><p className="mt-1 text-xs text-[#687086]">Langkah {step} dari 3 · {step === 1 ? "Buat akun" : role === "umkm" ? "Kenalkan usaha Anda" : "Kenalkan institusi Anda"}</p><div className="mt-3 flex gap-1.5" aria-label={`Langkah ${step} dari 3`}>{[1,2,3].map((number) => <span key={number} className={`h-1.5 rounded-full ${number <= step ? "w-8 bg-cyan-500" : "w-4 bg-slate-200"}`} />)}</div></header>
    {step === 1 && <div className="mb-5 flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">{(["umkm","institution"] as Role[]).map((item) => <button key={item} type="button" onClick={() => changeRole(item)} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-xs font-bold ${role === item ? "bg-white text-blue-900 shadow-sm" : "text-slate-500"}`}>{item === "umkm" ? <Store size={14} /> : <Building size={14} />}{item === "umkm" ? "Pemilik UMKM" : "Institusi"}</button>)}</div>}
    {error && <div role="alert" aria-live="assertive" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle size={16} className="shrink-0" />{error}</div>}
    <form onSubmit={submit} className="space-y-4">
      {step === 1 && <>
        <Field label={role === "umkm" ? "Nama pemilik" : "Nama kontak"} id="register-name" icon={<User size={17} />}><input id="register-name" value={account.contactName} onChange={(event) => setAccount({ ...account, contactName: event.target.value })} className="field-input" placeholder="Nama lengkap" autoComplete="name" required /></Field>
        <Field label="Email" id="register-email" icon={<Mail size={17} />}><input id="register-email" type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} className="field-input" placeholder="email@contoh.com" autoComplete="email" required /></Field>
        <Field label="Kata sandi" id="register-password" icon={<Lock size={17} />}><div className="relative"><input id="register-password" type={showPassword ? "text" : "password"} value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} className="field-input pr-12" placeholder="Minimal 8 karakter" autoComplete="new-password" minLength={8} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-500">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-600"><input type="checkbox" checked={agreeTerms} onChange={(event) => setAgreeTerms(event.target.checked)} className="mt-0.5 h-5 w-5" /><span>Saya menyetujui <button type="button" onClick={() => setShowTerms(true)} className="font-bold text-blue-900 underline">syarat penggunaan dan kebijakan privasi</button>.</span></label>
      </>}
      {step === 2 && role === "umkm" && <>
        <Field label="Nama usaha" id="business-name" icon={<Store size={17} />}><input id="business-name" value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} className="field-input" placeholder="Contoh: Warung Ibu Sari" required /></Field>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Bidang usaha</legend><div className="flex flex-wrap gap-2">{SECTORS.map((sector) => <button key={sector} type="button" onClick={() => setBusiness({ ...business, sector })} aria-pressed={business.sector === sector} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${business.sector === sector ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{sector}</button>)}</div></fieldset>
        <div><label className="mb-1.5 block text-xs font-bold text-slate-700">Kota atau kabupaten</label><CitySelect value={business.city} onChange={(city) => setBusiness({ ...business, city })} placeholder="Pilih lokasi usaha" required /></div>
      </>}
      {step === 2 && role === "institution" && <>
        <Field label="Nama institusi" id="institution-name" icon={<Building size={17} />}><input id="institution-name" value={institution.name} onChange={(event) => setInstitution({ ...institution, name: event.target.value })} className="field-input" placeholder="Nama lembaga" required /></Field>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Jenis institusi</legend><div className="flex flex-wrap gap-2">{INSTITUTION_TYPES.map((type) => <button key={type} type="button" onClick={() => setInstitution({ ...institution, type })} aria-pressed={institution.type === type} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${institution.type === type ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{type}</button>)}</div></fieldset>
        <div><label className="mb-1.5 block text-xs font-bold text-slate-700">Kota atau kabupaten</label><CitySelect value={institution.city} onChange={(city) => setInstitution({ ...institution, city })} placeholder="Pilih lokasi" required /></div>
      </>}
      <div className="flex gap-2 pt-2">{step === 2 && <button type="button" onClick={() => { setStep(1); setError(""); }} className="min-h-12 rounded-full border border-slate-300 px-5 text-xs font-bold text-slate-600">Kembali</button>}<button type="submit" disabled={loading} className="min-h-12 flex-1 rounded-full bg-[#001b85] px-5 text-sm font-bold text-white disabled:opacity-50">{loading ? "Menyiapkan akun..." : step === 1 ? "Lanjut" : role === "umkm" ? "Buat akun dan catat transaksi pertama" : "Buat akun institusi"}</button></div>
    </form>
    <p className="mt-5 text-center text-xs text-slate-600">Sudah punya akun? <Link href="/auth/login" className="font-bold text-blue-900">Masuk</Link></p>
    {showTerms && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTerms(false); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="terms-title" className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="terms-title" className="font-bold text-slate-900">Syarat dan privasi singkat</h2><button ref={closeRef} type="button" onClick={() => setShowTerms(false)} aria-label="Tutup" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100"><X size={18} /></button></div><div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600"><p>Data usaha digunakan untuk membantu pencatatan, menyusun Kesiapan Data Usaha, dan memberi saran langkah berikutnya.</p><p>Dokumen bersifat privat. Pihak lain hanya dapat mengakses data melalui persetujuan yang berlaku.</p><p>Hasil pembacaan otomatis wajib diperiksa oleh pemilik dan bukan verifikasi keaslian dokumen atau jaminan pembiayaan.</p></div><Link href="/terms" target="_blank" className="mt-4 inline-block text-xs font-bold text-blue-900 underline">Baca versi lengkap</Link><button type="button" onClick={() => { setAgreeTerms(true); setShowTerms(false); }} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-900 text-xs font-bold text-white"><CheckCircle2 size={16} /> Saya mengerti</button></section></div>}
    <style jsx>{`.field-input{width:100%;min-height:48px;border:1px solid #cbd5e1;border-radius:12px;padding:0 14px;font-size:14px;outline:none}.field-input:focus{border-color:#001b85;box-shadow:0 0 0 3px rgba(0,27,133,.1)}`}</style>
  </>;
}

function Field({ label, id, icon, children }: { label: string; id: string; icon: React.ReactNode; children: React.ReactNode }) { return <div><label htmlFor={id} className="mb-1.5 block text-xs font-bold text-slate-700">{label}</label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span><div className="[&_input]:pl-10">{children}</div></div></div>; }
