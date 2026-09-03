"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building, CalendarDays, CheckCircle2, Eye, EyeOff, FileText, Lock, Mail, MapPin, Phone, Store, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";

type Role = "umkm" | "institution";
const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

/**
 * Langkah tiga: kenali cara usahanya berjalan.
 *
 * Pertanyaan-pertanyaan di sini bukan basa-basi pendaftaran. Keempatnya adalah
 * bahan yang dipakai aplikasi sejak hari pertama: tahun mulai menjadi "lama
 * usaha" di berkas yang dibaca lembaga, bentuk usaha menentukan dokumen mana
 * yang diminta (akta hanya untuk badan usaha), kanal penjualan menjelaskan
 * asal pesanan, dan WhatsApp adalah satu-satunya cara menghubungi pemilik.
 *
 * Menanyakannya sekarang, bukan nanti, berarti akun baru langsung memiliki
 * profil intinya lengkap — satu bagian kesiapan yang sudah hijau di hari
 * pertama, bukan pekerjaan rumah yang menunggu.
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
  const [detail, setDetail] = useState({ form: "perorangan", startYear: "", headcount: "", address: "", phone: "", channels: [] as string[] });
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

  // Institusi tidak punya cara berjualan; langkahnya memang dua, dan
  // menampilkan "dari 3" kepada mereka menjanjikan tahap yang tidak pernah ada.
  const totalSteps = role === "umkm" ? 3 : 2;

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
    if (step === 1) { continueToBusiness(); return; }
    if (step === 2) {
      if (role === "umkm" && (!business.name.trim() || !business.city.trim())) { setError("Isi nama usaha dan kota atau kabupaten usaha."); return; }
      if (role === "institution" && (!institution.name.trim() || !institution.city.trim())) { setError("Isi nama institusi dan kota atau kabupaten."); return; }
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
      const metadata = role === "umkm" ? { nama_pemilik: account.contactName.trim(), nama_usaha: business.name.trim(), sektor_usaha: business.sector, lokasi: business.city, alamat: detail.address.trim(), phone: detail.phone.trim(), bentuk_usaha: detail.form, tahun_mulai_usaha: Number(detail.startYear), jumlah_karyawan: detail.headcount || null, kanal_penjualan: detail.channels, signup_account_type: "umkm" } : { nama_contact: account.contactName.trim(), nama_institusi: institution.name.trim(), jenis_institusi: institution.type, lokasi: institution.city, signup_account_type: "institution" };
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
    <header className="mb-5"><h1 className="text-xl font-bold text-[#141a34]">Buat akun Berkembang.id</h1><p className="mt-1 text-xs text-[#687086]">Langkah {step} dari {totalSteps} · {step === 1 ? "Buat akun" : step === 3 ? "Cara usaha Anda berjalan" : role === "umkm" ? "Kenalkan usaha Anda" : "Kenalkan institusi Anda"}</p><div className="mt-3 flex gap-1.5" aria-label={`Langkah ${step} dari ${totalSteps}`}>{Array.from({ length: totalSteps }, (_value, index) => index + 1).map((number) => <span key={number} className={`h-1.5 rounded-full ${number <= step ? "w-8 bg-cyan-500" : "w-4 bg-slate-200"}`} />)}</div></header>
    {step === 1 && <div className="mb-5 flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">{(["umkm","institution"] as Role[]).map((item) => <button key={item} type="button" onClick={() => changeRole(item)} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-xs font-bold ${role === item ? "bg-white text-blue-900 shadow-sm" : "text-slate-500"}`}>{item === "umkm" ? <Store size={14} /> : <Building size={14} />}{item === "umkm" ? "Pemilik UMKM" : "Institusi"}</button>)}</div>}
    {error && <div role="alert" aria-live="assertive" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle size={16} className="shrink-0" />{error}</div>}
    <form onSubmit={submit} className="space-y-4">
      {step === 1 && <>
        <Field label={role === "umkm" ? "Nama pemilik" : "Nama kontak"} id="register-name" icon={<User size={17} />}><input id="register-name" value={account.contactName} onChange={(event) => setAccount({ ...account, contactName: event.target.value })} className="field-input" placeholder="Nama lengkap" autoComplete="name" required /></Field>
        <Field label="Email" id="register-email" icon={<Mail size={17} />}><input id="register-email" type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} className="field-input" placeholder="email@contoh.com" autoComplete="email" required /></Field>
        <Field label="Kata sandi" id="register-password" icon={<Lock size={17} />}><input id="register-password" type={showPassword ? "text" : "password"} value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} className="field-input has-toggle" placeholder="Minimal 8 karakter" autoComplete="new-password" minLength={8} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-500">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></Field>
        <div className="rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
          <label htmlFor="agree-terms" className="flex items-start gap-3"><input id="agree-terms" type="checkbox" checked={agreeTerms} onChange={(event) => setAgreeTerms(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" /><span>Saya sudah membaca dan menyetujui syarat penggunaan serta kebijakan privasi.</span></label>
          <button type="button" onClick={() => setShowTerms(true)} className="mt-2 ml-8 inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-blue-900 underline"><FileText size={14} /> Baca syarat dan privasi</button>
        </div>
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
      {step === 3 && role === "umkm" && <>
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">Jawaban di sini yang membuat catatan Anda bisa dibaca pihak lain nanti. Semuanya bisa diubah kapan saja di halaman Profil.</p>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Bentuk usaha</legend><div className="flex flex-wrap gap-2">{BUSINESS_FORMS.map((option) => <button key={option.value} type="button" onClick={() => setDetail({ ...detail, form: option.value })} aria-pressed={detail.form === option.value} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.form === option.value ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{option.label}</button>)}</div><p className="mt-1.5 text-[11px] text-slate-500">Menentukan dokumen mana yang nanti diminta.</p></fieldset>
        <Field label="Tahun mulai usaha" id="start-year" icon={<CalendarDays size={17} />}><input id="start-year" inputMode="numeric" value={detail.startYear} onChange={(event) => setDetail({ ...detail, startYear: event.target.value.replace(/[^0-9]/g, "").slice(0, 4) })} className="field-input" placeholder={`Contoh: ${CURRENT_YEAR - 3}`} required /></Field>
        <Field label="Nomor WhatsApp" id="wa-number" icon={<Phone size={17} />}><input id="wa-number" type="tel" value={detail.phone} onChange={(event) => setDetail({ ...detail, phone: event.target.value })} className="field-input" placeholder="Contoh: 081234567890" autoComplete="tel" required /></Field>
        <Field label="Alamat tempat usaha" id="business-address" icon={<MapPin size={17} />}><input id="business-address" value={detail.address} onChange={(event) => setDetail({ ...detail, address: event.target.value })} className="field-input" placeholder="Nama jalan, nomor, kelurahan" autoComplete="street-address" required /></Field>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Pembeli datang dari mana</legend><div className="flex flex-wrap gap-2">{CHANNELS.map((option) => <button key={option.value} type="button" onClick={() => toggleChannel(option.value)} aria-pressed={detail.channels.includes(option.value)} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.channels.includes(option.value) ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{option.label}</button>)}</div><p className="mt-1.5 text-[11px] text-slate-500">Boleh lebih dari satu.</p></fieldset>
        <fieldset><legend className="mb-2 text-xs font-bold text-slate-700">Berapa orang yang bekerja <span className="font-normal text-slate-400">(opsional)</span></legend><div className="flex flex-wrap gap-2">{HEADCOUNTS.map((option) => <button key={option.value} type="button" onClick={() => setDetail({ ...detail, headcount: detail.headcount === option.value ? "" : option.value })} aria-pressed={detail.headcount === option.value} className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.headcount === option.value ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>{option.label}</button>)}</div></fieldset>
      </>}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">{step > 1 && <button type="button" onClick={() => { setStep(step - 1); setError(""); }} className="min-h-12 w-full rounded-full border border-slate-300 px-5 text-xs font-bold text-slate-600 sm:w-auto">Kembali</button>}<button type="submit" disabled={loading} className="min-h-12 flex-1 rounded-full bg-[#001b85] px-5 text-sm font-bold text-white disabled:opacity-50">{loading ? "Menyiapkan akun..." : step === 1 ? "Lanjut" : step === 2 && role === "umkm" ? "Lanjut" : role === "umkm" ? "Buat akun dan catat transaksi pertama" : "Buat akun institusi"}</button></div>
    </form>
    <p className="mt-5 text-center text-xs text-slate-600">Sudah punya akun? <Link href="/auth/login" className="font-bold text-blue-900">Masuk</Link></p>
    {showTerms && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTerms(false); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="terms-title" className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="terms-title" className="font-bold text-slate-900">Syarat dan privasi singkat</h2><button ref={closeRef} type="button" onClick={() => setShowTerms(false)} aria-label="Tutup" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-100"><X size={18} /></button></div><ul className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600"><li><strong className="text-slate-800">Catatan Anda dipakai untuk Anda.</strong> Data usaha diolah untuk menyusun pembukuan, menghitung tingkat kesiapan, dan menyarankan langkah berikutnya. Kami tidak menjual atau memperdagangkannya.</li><li><strong className="text-slate-800">Dokumen bersifat privat.</strong> KTP dan berkas usaha tidak pernah dibagikan. Institusi hanya bisa melihat bagian yang Anda setujui, dan izin itu bisa Anda cabut kapan saja.</li><li><strong className="text-slate-800">Angka datang dari Anda, bukan dari AI.</strong> Nominal dibaca pengurai tetap di aplikasi; AI hanya menebak jenis transaksinya, dan tebakannya selalu Anda periksa dulu.</li><li><strong className="text-slate-800">Tingkat kesiapan bukan penilaian kelayakan.</strong> Ia menggambarkan kelengkapan catatan, bukan janji pembiayaan. Aturannya terbuka dan bisa Anda baca.</li><li><strong className="text-slate-800">Anda boleh berhenti dan membawa data Anda.</strong> Seluruh isi akun bisa diunduh kapan saja, dan penghapusan akun mencabut akses institusi seketika.</li></ul><Link href="/terms" target="_blank" className="mt-4 inline-block text-xs font-bold text-blue-900 underline">Baca versi lengkap</Link><button type="button" onClick={() => { setAgreeTerms(true); setShowTerms(false); }} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-900 text-xs font-bold text-white"><CheckCircle2 size={16} /> Saya mengerti</button></section></div>}
    <style jsx>{`.field-input{width:100%;min-height:48px;border:1px solid #cbd5e1;border-radius:12px;padding:0 14px 0 40px;font-size:14px;outline:none}.field-input.has-toggle{padding-right:48px}.field-input:focus{border-color:#001b85;box-shadow:0 0 0 3px rgba(0,27,133,.1)}`}</style>
  </>;
}

function Field({ label, id, icon, children }: { label: string; id: string; icon: React.ReactNode; children: React.ReactNode }) { return <div><label htmlFor={id} className="mb-1.5 block text-xs font-bold text-slate-700">{label}</label><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">{icon}</span><div>{children}</div></div></div>; }
