"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building, CalendarDays, CheckCircle2, Eye, EyeOff, Lock, Mail, MapPin, Phone, Store, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";
import GoogleButton from "@/components/auth/GoogleButton";
import OtpInput from "@/components/auth/OtpInput";
import { authErrorMessage, isCompleteOtp, OTP_LENGTH } from "@/modules/auth/otp";
import { TERMS_DOCUMENTS, TERMS_HIGHLIGHTS } from "@/modules/legal/terms";

type Role = "umkm" | "investor";
const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

/**
 * Langkah tiga: kenali cara usahanya berjalan.
 */
const BUSINESS_FORMS = [
  { value: "perorangan", label: "Usaha perorangan" },
  { value: "badan_usaha", label: "Badan usaha (PT/CV/Koperasi)" },
] as const;

const HEADCOUNTS = [
  { value: "sendiri", label: "Saya sendiri" },
  { value: "1-4", label: "1\u20134 orang" },
  { value: "5-19", label: "5\u201319 orang" },
] as const;

const CHANNELS = [
  { value: "warung", label: "Warung / kios" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "marketplace", label: "Marketplace" },
  { value: "media_sosial", label: "Media sosial" },
] as const;

const CURRENT_YEAR = new Date().getFullYear();
const INVESTOR_TYPES = ["Modal Ventura (VC)", "Angel Investor", "Perusahaan Offtaker / Buyer", "Korporasi", "Koperasi / Agregator", "Lainnya"];

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("umkm");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [account, setAccount] = useState({ contactName: "", email: "", password: "" });
  const [business, setBusiness] = useState({ name: "", sector: "Kuliner", city: "" });
  const [detail, setDetail] = useState({ form: "perorangan", startYear: "", headcount: "", address: "", phone: "", channels: [] as string[] });
  const [investor, setInvestor] = useState({ companyName: "", type: "Modal Ventura (VC)", city: "" });
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

  // Lembaga tidak punya cara berjualan; langkahnya memang dua, dan
  // menampilkan "dari 3" kepada mereka menjanjikan tahap yang tidak pernah ada.
  // Verifikasi surel adalah langkah terakhir bagi keduanya, dan ikut dihitung:
  // langkah yang tidak muncul di penunjuk terasa seperti hambatan yang tidak
  // dijanjikan.
  const detailSteps = role === "umkm" ? 3 : 2;
  const verifyStep = detailSteps + 1;
  const totalSteps = verifyStep;

  function changeRole(nextRole: Role) { setRole(nextRole); setStep(1); setError(""); }
  function toggleChannel(value: string) {
    setDetail((current) => ({ ...current, channels: current.channels.includes(value) ? current.channels.filter((item) => item !== value) : [...current.channels, value] }));
  }
  function continueToBusiness() {
    setError("");
    if (!account.contactName.trim() || !account.email.trim() || account.password.length < 8) { setError("Isi nama, email, dan kata sandi minimal 8 karakter."); return; }
    if (!agreeTerms) { setError("Baca dan setujui syarat penggunaan serta kebijakan privasi."); return; }
    setStep(2);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (step === verifyStep) { void verifyEmail(); return; }
    if (step === 1) { continueToBusiness(); return; }
    if (step === 2) {
      if (role === "umkm" && (!business.name.trim() || !business.city.trim())) { setError("Isi nama usaha dan kota atau kabupaten usaha."); return; }
      if (role === "investor" && (!investor.companyName.trim() || !investor.city.trim())) { setError("Isi nama perusahaan / entitas dan kota atau kabupaten."); return; }
      if (role === "umkm") { setStep(3); return; }
    }
    if (role === "umkm" && step === 3) {
      const year = Number(detail.startYear);
      if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR) { setError(`Isi tahun mulai usaha antara 1900 dan ${CURRENT_YEAR}.`); return; }
      if (!detail.phone.trim()) { setError("Isi nomor WhatsApp yang bisa dihubungi."); return; }
      if (!detail.address.trim()) { setError("Isi alamat tempat usaha."); return; }
      if (detail.channels.length === 0) { setError("Pilih minimal satu tempat pembeli menemukan usaha Anda."); return; }
    }
    setLoading(true);
    try {
      const metadata = role === "umkm" 
        ? { 
            nama_pemilik: account.contactName.trim(), 
            nama_usaha: business.name.trim(), 
            sektor_usaha: business.sector, 
            lokasi: business.city, 
            alamat: detail.address.trim(), 
            phone: detail.phone.trim(), 
            bentuk_usaha: detail.form, 
            tahun_mulai_usaha: Number(detail.startYear), 
            jumlah_karyawan: detail.headcount || null, 
            kanal_penjualan: detail.channels, 
            signup_account_type: "umkm" 
          } 
        : { 
            nama_contact: account.contactName.trim(), 
            nama_perusahaan: investor.companyName.trim(), 
            nama_institusi: investor.companyName.trim(), 
            jenis_investor: investor.type, 
            lokasi: investor.city, 
            signup_account_type: "investor" 
          };
      const { data, error: signUpError } = await supabase.auth.signUp({ email: account.email.trim(), password: account.password, options: { data: metadata } });
      if (signUpError) {
        if (signUpError.message.includes("already registered")) throw new Error("Email sudah terdaftar. Silakan masuk atau gunakan email lain.");
        if (signUpError.message.includes("Password")) throw new Error("Kata sandi minimal 8 karakter.");
        throw signUpError;
      }
      // Sesi hanya ada bila proyek masih mengonfirmasi surel secara otomatis.
      // Selama itu masih menyala, verifikasi tidak akan pernah diminta, jadi
      // jalur lama dipertahankan alih-alih menahan orang di layar kode yang
      // tidak akan pernah menerima apa pun.
      if (data.session) { await finishSignup(); return; }
      setStep(verifyStep);
      setLoading(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pendaftaran belum berhasil. Silakan coba lagi."); setLoading(false); }
  }

  /** Dipanggil setelah sesi ada -- lewat kode, atau lewat konfirmasi otomatis. */
  async function finishSignup() {
    const response = await fetch("/api/auth/bootstrap", { method: "POST" });
    if (!response.ok && response.status !== 409) {
      setError("Akun dibuat, tetapi data usaha belum dapat disiapkan. Silakan masuk kembali.");
      setLoading(false);
      return;
    }
    window.location.href = role === "umkm" ? "/umkm/profil?onboarding=1" : "/auth/continue";
  }

  async function verifyEmail() {
    setError("");
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: account.email.trim(), token: code, type: "signup" });
    if (verifyError) {
      setError(authErrorMessage(verifyError.message, "Kode belum dapat diperiksa. Coba lagi."));
      setLoading(false);
      return;
    }
    await finishSignup();
  }

  async function resendCode() {
    setError("");
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: account.email.trim() });
    if (resendError) setError(authErrorMessage(resendError.message, "Kode belum dapat dikirim ulang. Coba lagi sebentar lagi."));
  }

  return <>
    <header className="mb-5"><h1 className="text-xl font-bold text-[#141a34]">Buat akun Berkembang.id</h1><p className="mt-1 text-xs text-[#687086]">Langkah {step} dari {totalSteps} · {step === verifyStep ? "Verifikasi email" : step === 1 ? "Buat akun" : step === 3 ? "Cara usaha Anda berjalan" : role === "umkm" ? "Kenalkan usaha Anda" : "Profil Investor / Offtaker"}</p><div className="mt-3 flex gap-1.5" aria-label={`Langkah ${step} dari ${totalSteps}`}>{Array.from({ length: totalSteps }, (_value, index) => index + 1).map((number) => <span key={number} className={`h-1.5 rounded-full ${number <= step ? "w-8 bg-cyan-500" : "w-4 bg-slate-200"}`} />)}</div></header>
    {step === 1 && <div className="mb-3 flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">{(["umkm","investor"] as Role[]).map((item) => <button key={item} type="button" onClick={() => changeRole(item)} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-xs font-bold ${role === item ? "bg-white text-blue-900 shadow-sm" : "text-slate-500"}`}>{item === "umkm" ? <Store size={14} /> : <Building size={14} />}{item === "umkm" ? "Pemilik UMKM" : "Investor / Offtaker"}</button>)}</div>}
    {step === 1 && role === "investor" && <p className="mb-4 text-xs leading-relaxed text-slate-500">Untuk modal ventura, angel investor, perusahaan offtaker/buyer, dan korporasi yang mencari potensi kemitraan UMKM.</p>}
    {step === 1 && <p className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">Mewakili <strong>Lembaga Keuangan / Instansi Pemerintah</strong>? Pendaftaran akun lembaga diproses via verifikasi admin. Silakan kirim email ke <a href="mailto:support@berkembang.id" className="font-bold text-[#001b85] hover:underline">support@berkembang.id</a>.</p>}
    {error && <div role="alert" aria-live="assertive" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle size={16} className="shrink-0" />{error}</div>}
    <form onSubmit={submit} className="space-y-4">
      {step === 1 && <>
        <Field label={role === "umkm" ? "Nama pemilik" : "Nama PIC / Kontak"} id="register-name" icon={<User size={17} />}><input id="register-name" value={account.contactName} onChange={(event) => setAccount({ ...account, contactName: event.target.value })} className="field-input" placeholder="Nama lengkap" autoComplete="name" required /></Field>
        <Field label="Email" id="register-email" icon={<Mail size={17} />}><input id="register-email" type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} className="field-input" placeholder="email@contoh.com" autoComplete="email" required /></Field>
        <Field label="Kata sandi" id="register-password" icon={<Lock size={17} />}><input id="register-password" type={showPassword ? "text" : "password"} value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} className="field-input has-toggle" placeholder="Minimal 8 karakter" autoComplete="new-password" minLength={8} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-500">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></Field>
        <div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-slate-200" /><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">atau</span><span className="h-px flex-1 bg-slate-200" /></div>
        <GoogleButton label="Daftar dengan Google" />
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-600"><input id="agree-terms" type="checkbox" checked={agreeTerms} onChange={(event) => setAgreeTerms(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" /><p><label htmlFor="agree-terms">Saya sudah membaca dan menyetujui </label><button type="button" onClick={() => setShowTerms(true)} className="auth-inline-link">syarat penggunaan serta kebijakan privasi</button><label htmlFor="agree-terms"> bagi {role === "umkm" ? "pemilik usaha" : "investor / offtaker"}.</label></p></div>
      </>}
      {step === 2 && role === "umkm" && <>
        <Field label="Nama usaha" id="business-name" icon={<Store size={17} />}><input id="business-name" value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} className="field-input" placeholder="Contoh: Warung Ibu Sari" required /></Field>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Bidang usaha</legend><div className="flex flex-wrap gap-2">{SECTORS.map((sector) => <button key={sector} type="button" onClick={() => setBusiness({ ...business, sector })} aria-pressed={business.sector === sector} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${business.sector === sector ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{sector}</button>)}</div></fieldset>
        <div><label className="mb-1.5 block text-xs font-bold text-slate-700">Kota atau kabupaten</label><CitySelect value={business.city} onChange={(city) => setBusiness({ ...business, city })} placeholder="Pilih lokasi usaha" required /></div>
      </>}
      {step === 2 && role === "investor" && <>
        <Field label="Nama perusahaan / entitas" id="investor-name" icon={<Building size={17} />}><input id="investor-name" value={investor.companyName} onChange={(event) => setInvestor({ ...investor, companyName: event.target.value })} className="field-input" placeholder="Nama instansi / entitas bisnis" required /></Field>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Jenis entitas</legend><div className="flex flex-wrap gap-2">{INVESTOR_TYPES.map((type) => <button key={type} type="button" onClick={() => setInvestor({ ...investor, type })} aria-pressed={investor.type === type} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${investor.type === type ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{type}</button>)}</div></fieldset>
        <div><label className="mb-1.5 block text-xs font-bold text-slate-700">Kota atau domisili entitas</label><CitySelect value={investor.city} onChange={(city) => setInvestor({ ...investor, city })} placeholder="Pilih lokasi" required /></div>
      </>}
      {step === 3 && role === "umkm" && <>
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Jawaban di sini yang membuat catatan Anda bisa dibaca pihak lain nanti. Semuanya bisa diubah kapan saja di halaman Profil.</p>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Bentuk usaha</legend><div className="flex flex-wrap gap-2">{BUSINESS_FORMS.map((option) => <button key={option.value} type="button" onClick={() => setDetail({ ...detail, form: option.value })} aria-pressed={detail.form === option.value} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.form === option.value ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{option.label}</button>)}</div><p className="mt-1.5 text-[11px] text-slate-500">Menentukan dokumen mana yang nanti diminta.</p></fieldset>
        <Field label="Tahun mulai usaha" id="start-year" icon={<CalendarDays size={17} />}><input id="start-year" inputMode="numeric" value={detail.startYear} onChange={(event) => setDetail({ ...detail, startYear: event.target.value.replace(/[^0-9]/g, "").slice(0, 4) })} className="field-input" placeholder={`Contoh: ${CURRENT_YEAR - 3}`} required /></Field>
        <Field label="Nomor WhatsApp" id="wa-number" icon={<Phone size={17} />}><input id="wa-number" type="tel" value={detail.phone} onChange={(event) => setDetail({ ...detail, phone: event.target.value })} className="field-input" placeholder="Contoh: 081234567890" autoComplete="tel" required /></Field>
        <Field label="Alamat tempat usaha" id="business-address" icon={<MapPin size={17} />}><input id="business-address" value={detail.address} onChange={(event) => setDetail({ ...detail, address: event.target.value })} className="field-input" placeholder="Nama jalan, nomor, kelurahan" autoComplete="street-address" required /></Field>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Pembeli datang dari mana</legend><div className="flex flex-wrap gap-2">{CHANNELS.map((option) => <button key={option.value} type="button" onClick={() => toggleChannel(option.value)} aria-pressed={detail.channels.includes(option.value)} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.channels.includes(option.value) ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{option.label}</button>)}</div><p className="mt-1.5 text-[11px] text-slate-500">Boleh lebih dari satu.</p></fieldset>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Berapa orang yang bekerja <span className="font-normal text-slate-400">(opsional)</span></legend><div className="flex flex-wrap gap-2">{HEADCOUNTS.map((option) => <button key={option.value} type="button" onClick={() => setDetail({ ...detail, headcount: detail.headcount === option.value ? "" : option.value })} aria-pressed={detail.headcount === option.value} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.headcount === option.value ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{option.label}</button>)}</div></fieldset>
      </>}
      {step === verifyStep && <div className="space-y-4">
        <p className="text-xs leading-relaxed text-slate-600">Kami mengirim kode {OTP_LENGTH} angka ke <strong className="text-slate-800">{account.email.trim()}</strong>. Masukkan kode itu untuk memastikan alamatnya benar milik Anda. Periksa juga folder spam.</p>
        <OtpInput value={code} onChange={setCode} onResend={resendCode} disabled={loading} />
      </div>}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">{step > 1 && step !== verifyStep && <button type="button" onClick={() => { setStep(step - 1); setError(""); }} className="min-h-12 w-full rounded-full border border-slate-300 px-5 text-xs font-bold text-slate-600 sm:w-auto">Kembali</button>}<button type="submit" disabled={loading || (step === verifyStep && !isCompleteOtp(code))} className="min-h-12 flex-1 rounded-full bg-[#001b85] px-5 text-sm font-bold text-white disabled:opacity-50">{loading ? "Menyiapkan akun..." : step === verifyStep ? "Verifikasi dan masuk" : step === 1 ? "Lanjut" : step === 2 && role === "umkm" ? "Lanjut" : role === "umkm" ? "Buat akun dan catat transaksi pertama" : "Buat akun Investor / Offtaker"}</button></div>
    </form>
    <p className="mt-5 text-center text-xs text-slate-600">Sudah punya akun? <Link href="/auth/login" className="font-bold text-blue-900">Masuk</Link></p>
    {showTerms && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTerms(false); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="terms-title" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between p-5 pb-3"><h2 id="terms-title" className="font-bold text-slate-900">{TERMS_DOCUMENTS.find((document) => document.id === role)?.summaryTitle}</h2><button ref={closeRef} type="button" onClick={() => setShowTerms(false)} aria-label="Tutup" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100"><X size={18} /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-5"><p className="text-xs text-slate-500">Pemilik usaha dan lembaga terikat pada perjanjian yang berbeda. Ringkasan berikut merupakan bagian dari perjanjian bagi {role === "umkm" ? "pemilik usaha" : "lembaga"}.</p><ul className="mt-4 space-y-3 pb-5 text-xs leading-relaxed text-slate-600">{TERMS_HIGHLIGHTS[role].map((highlight) => <li key={highlight.title}><strong className="text-slate-800">{highlight.title}</strong> {highlight.body}</li>)}</ul></div><div className="border-t border-slate-100 p-5"><Link href={role === "umkm" ? "/terms" : "/terms?pihak=lembaga"} target="_blank" className="inline-block text-xs font-bold text-blue-900 underline">Baca versi lengkap</Link><button type="button" onClick={() => { setAgreeTerms(true); setShowTerms(false); }} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-900 text-xs font-bold text-white"><CheckCircle2 size={16} /> Saya mengerti</button></div></section></div>}
  </>;
}

function Field({ label, id, icon, children }: { label: string; id: string; icon: React.ReactNode; children: React.ReactNode }) { return <div><label htmlFor={id} className="mb-1.5 block text-xs font-bold text-slate-700">{label}</label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">{icon}</span><div>{children}</div></div></div>; }
