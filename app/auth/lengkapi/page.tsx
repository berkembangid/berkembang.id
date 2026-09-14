"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Building, CalendarDays, MapPin, Phone, Store } from "lucide-react";
import CitySelect from "@/components/CitySelect";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/modules/auth/otp";
import {
  BUSINESS_FORMS, CHANNELS, CURRENT_YEAR, EMPTY_UMKM_DETAIL, HEADCOUNTS, INVESTOR_TYPES, SECTORS,
  investorError, investorSignupMetadata, umkmDetailError, umkmIdentityError, umkmSignupMetadata,
} from "@/modules/auth/onboarding-fields";

/**
 * Onboarding untuk akun Google.
 *
 * KENAPA LAYAR INI ADA.
 *
 * Pendaftaran lewat surel menitipkan metadata -- pemilik usaha atau investor,
 * nama usahanya, kotanya, cara usahanya berjalan -- dan `bootstrap` memakainya
 * untuk membuatkan profil dan baris usaha. Akun Google tidak membawa apa pun
 * selain nama dan alamat surel.
 *
 * KENAPA DUA LANGKAH, DAN BUKAN SATU SEPERTI SEBELUMNYA.
 *
 * Sebelumnya layar ini hanya menanyakan tiga hal: nama usaha, bidang, kota.
 * Padahal pendaftaran lewat surel menanyakan enam hal lagi -- bentuk usaha,
 * tahun mulai, WhatsApp, alamat, kanal penjualan, jumlah orang. Akibatnya akun
 * Google lahir separuh terisi, lalu pemiliknya diantar ke halaman Profil untuk
 * mengisi sisanya, DAN ia tidak pernah tahu mana yang belum diisi.
 *
 * Dua jalan masuk yang menghasilkan akun berbeda bukan dua jalan masuk; itu
 * satu jalan dan satu jalan pintas. Pertanyaannya sekarang persis sama, dan
 * ditanyakan dari satu tempat: `modules/auth/onboarding-fields.ts`.
 *
 * Investor tetap satu langkah, karena pendaftaran surelnya juga satu langkah.
 */

export default function CompleteProfilePage() {
  const [role, setRole] = useState<"umkm" | "investor">("umkm");
  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState("");
  const [business, setBusiness] = useState({ name: "", sector: "Kuliner", city: "" });
  const [detail, setDetail] = useState(EMPTY_UMKM_DETAIL);
  const [investor, setInvestor] = useState({ companyName: "", type: INVESTOR_TYPES[0] as string, city: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Halaman ini hanya masuk akal dengan sesi. Tanpa penjaga ini, orang yang
  // membukanya langsung akan menekan tombol lalu menerima galat tentang
  // pengguna yang tidak ada -- pesan yang tidak menjelaskan apa pun.
  //
  // Nama dari Google diambil sekaligus di sini, bukan saat menyimpan: kalau
  // diambil saat menyimpan dan panggilannya gagal, nama pemiliknya hilang
  // padahal sudah ada di tangan sejak layar terbuka.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void supabase.auth.getUser().then(({ data }) => {
        if (!data.user) {
          window.location.href = "/auth/login";
          return;
        }
        const meta = data.user.user_metadata ?? {};
        const displayName = typeof meta.full_name === "string" ? meta.full_name
          : typeof meta.name === "string" ? meta.name : "";
        setOwnerName(displayName);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const totalSteps = role === "umkm" ? 2 : 1;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (role === "investor") {
      const message = investorError(investor);
      if (message) { setError(message); return; }
      await simpan(investorSignupMetadata({ ...investor, contactName: ownerName }));
      return;
    }

    if (step === 1) {
      const message = umkmIdentityError({ businessName: business.name, city: business.city });
      if (message) { setError(message); return; }
      setStep(2);
      return;
    }

    const message = umkmDetailError(detail);
    if (message) { setError(message); return; }
    await simpan(umkmSignupMetadata({
      ownerName,
      businessName: business.name,
      sector: business.sector,
      city: business.city,
      ...detail,
    }));
  }

  async function simpan(metadata: Record<string, unknown>) {
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ data: metadata });
    if (updateError) {
      setError(authErrorMessage(updateError.message, "Data belum tersimpan. Coba lagi."));
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/bootstrap", { method: "POST" });
    if (!response.ok) {
      setError("Data tersimpan, tetapi akun belum dapat disiapkan. Coba tekan tombol ini sekali lagi.");
      setLoading(false);
      return;
    }
    // `/auth/continue` yang memutuskan tujuannya, bukan layar ini. Satu tempat
    // yang tahu portal mana untuk peran mana.
    window.location.href = "/auth/continue";
  }

  function toggleChannel(value: string) {
    setDetail((current) => ({
      ...current,
      channels: current.channels.includes(value)
        ? current.channels.filter((item) => item !== value)
        : [...current.channels, value],
    }));
  }

  const heading = role === "investor" ? "Profil Investor / Offtaker"
    : step === 1 ? "Kenalkan usaha Anda" : "Cara usaha Anda berjalan";

  return (
    <>
      <header className="mb-5">
        <h1 className="font-headline text-xl font-bold text-[#141a34]">Satu langkah lagi</h1>
        <p className="mt-1 text-xs text-[#687086]">
          Langkah {step} dari {totalSteps} · {heading}
        </p>
        <div className="mt-3 flex gap-1.5" aria-label={`Langkah ${step} dari ${totalSteps}`}>
          {Array.from({ length: totalSteps }, (_value, index) => index + 1).map((number) => (
            <span key={number} className={`h-1.5 rounded-full ${number <= step ? "w-8 bg-cyan-500" : "w-4 bg-slate-200"}`} />
          ))}
        </div>
      </header>

      <p className="mb-5 text-sm leading-6 text-[#687086]">
        Akun Google Anda sudah tersambung. Jawaban di sini yang membuat catatan Anda bisa dibaca pihak
        lain nanti, dan semuanya bisa diubah kapan saja di halaman Profil.
      </p>

      {error && (
        <div role="alert" aria-live="assertive" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}

      {step === 1 && (
        <div className="mb-5 flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {([["umkm", "Pemilik UMKM"], ["investor", "Investor / Offtaker"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setRole(value); setStep(1); setError(""); }}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-xs font-bold ${role === value ? "bg-white text-blue-900 shadow-sm" : "text-slate-500"}`}
            >
              {value === "umkm" ? <Store size={14} /> : <Building size={14} />}{label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {role === "umkm" && step === 1 && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Nama usaha</span>
              <input value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} className="field-input" style={{ paddingLeft: 14 }} placeholder="Contoh: Warung Bu Ani" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Bidang usaha</span>
              <select value={business.sector} onChange={(event) => setBusiness({ ...business, sector: event.target.value })} className="field-input" style={{ paddingLeft: 14 }}>
                {SECTORS.map((sector) => <option key={sector}>{sector}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Kota atau kabupaten</span>
              <CitySelect value={business.city} onChange={(city) => setBusiness({ ...business, city })} placeholder="Pilih lokasi usaha" required />
            </div>
          </>
        )}

        {role === "umkm" && step === 2 && (
          <>
            <fieldset>
              <legend className="mb-2 text-xs font-bold text-slate-700">Bentuk usaha</legend>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_FORMS.map((option) => (
                  <button key={option.value} type="button" onClick={() => setDetail({ ...detail, businessForm: option.value })} aria-pressed={detail.businessForm === option.value}
                    className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.businessForm === option.value ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">Menentukan dokumen mana yang nanti diminta.</p>
            </fieldset>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#141a34]"><CalendarDays size={14} /> Tahun mulai usaha</span>
              <input inputMode="numeric" value={detail.startYear}
                onChange={(event) => setDetail({ ...detail, startYear: event.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                className="field-input" style={{ paddingLeft: 14 }} placeholder={`Contoh: ${CURRENT_YEAR - 3}`} required />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#141a34]"><Phone size={14} /> Nomor WhatsApp</span>
              <input type="tel" value={detail.phone} onChange={(event) => setDetail({ ...detail, phone: event.target.value })}
                className="field-input" style={{ paddingLeft: 14 }} placeholder="Contoh: 081234567890" autoComplete="tel" required />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#141a34]"><MapPin size={14} /> Alamat tempat usaha</span>
              <input value={detail.address} onChange={(event) => setDetail({ ...detail, address: event.target.value })}
                className="field-input" style={{ paddingLeft: 14 }} placeholder="Nama jalan, nomor, kelurahan" autoComplete="street-address" required />
            </label>

            <fieldset>
              <legend className="mb-2 text-xs font-bold text-slate-700">Pembeli datang dari mana</legend>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((option) => (
                  <button key={option.value} type="button" onClick={() => toggleChannel(option.value)} aria-pressed={detail.channels.includes(option.value)}
                    className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.channels.includes(option.value) ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">Boleh lebih dari satu.</p>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-bold text-slate-700">
                Berapa orang yang bekerja <span className="font-normal text-slate-400">(opsional)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {HEADCOUNTS.map((option) => (
                  <button key={option.value} type="button"
                    onClick={() => setDetail({ ...detail, headcount: detail.headcount === option.value ? "" : option.value })}
                    aria-pressed={detail.headcount === option.value}
                    className={`min-h-10 rounded-full border px-3 text-xs font-semibold ${detail.headcount === option.value ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 text-slate-600"}`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {role === "investor" && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Nama entitas / perusahaan</span>
              <input value={investor.companyName} onChange={(event) => setInvestor({ ...investor, companyName: event.target.value })} className="field-input" style={{ paddingLeft: 14 }} placeholder="Contoh: PT Investasi Maju Bersama" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Jenis investor</span>
              <select value={investor.type} onChange={(event) => setInvestor({ ...investor, type: event.target.value })} className="field-input" style={{ paddingLeft: 14 }}>
                {INVESTOR_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Kota atau kabupaten</span>
              <CitySelect value={investor.city} onChange={(city) => setInvestor({ ...investor, city })} placeholder="Pilih lokasi" required />
            </div>
          </>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          {step > 1 && (
            <button type="button" onClick={() => { setStep(step - 1); setError(""); }}
              className="min-h-12 w-full rounded-full border border-slate-300 px-5 text-xs font-bold text-slate-600 sm:w-auto">
              Kembali
            </button>
          )}
          <button type="submit" disabled={loading}
            className="min-h-12 flex-1 rounded-full bg-[#001b85] px-5 text-sm font-bold text-white disabled:opacity-60">
            {loading ? "Menyiapkan…" : role === "umkm" && step === 1 ? "Lanjut" : "Mulai pakai Berkembang.id"}
          </button>
        </div>
      </form>

      <p className="mt-5 text-center text-xs text-slate-400">
        Mewakili Lembaga mitra resmi? Lembaga didaftarkan khusus oleh admin platform.
      </p>
    </>
  );
}
