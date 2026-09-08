"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Building, Store } from "lucide-react";
import CitySelect from "@/components/CitySelect";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/modules/auth/otp";

const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];
const INSTITUTION_TYPES = ["Bank / Koperasi", "Lembaga Pemerintah", "Investor", "NGO / Yayasan", "Universitas", "Lainnya"];

/**
 * Satu pertanyaan yang tidak bisa dijawab akun Google.
 *
 * Pendaftaran lewat surel menitipkan metadata -- pemilik usaha atau lembaga,
 * nama usahanya, kotanya -- dan `bootstrap` memakainya untuk membuatkan usaha
 * beserta profilnya. Akun Google tidak membawa apa pun selain nama dan alamat
 * surel.
 *
 * Menebaknya berarti separuh akun lembaga lahir sebagai usaha, dan memperbaiki
 * kesalahan itu jauh lebih mahal daripada menanyakannya sekali. Jadi halaman
 * ini menanyakan yang paling sedikit: siapa Anda, dan dua hal yang tanpa itu
 * tidak ada yang bisa dibuat.
 */
export default function CompleteProfilePage() {
  const [role, setRole] = useState<"umkm" | "institution">("umkm");
  const [business, setBusiness] = useState({ name: "", sector: "Kuliner", city: "" });
  const [institution, setInstitution] = useState({ name: "", type: "Bank / Koperasi", city: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Halaman ini hanya masuk akal dengan sesi. Tanpa penjaga ini, orang yang
  // membukanya langsung akan menekan tombol lalu menerima galat tentang
  // pengguna yang tidak ada -- pesan yang tidak menjelaskan apa pun.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = "/auth/login";
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (role === "umkm" && (!business.name.trim() || !business.city.trim())) {
      setError("Isi nama usaha dan kota atau kabupaten usaha.");
      return;
    }
    if (role === "institution" && (!institution.name.trim() || !institution.city.trim())) {
      setError("Isi nama lembaga dan kota atau kabupaten.");
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const displayName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

    const metadata = role === "umkm"
      ? { nama_pemilik: displayName, nama_usaha: business.name.trim(), sektor_usaha: business.sector, lokasi: business.city, signup_account_type: "umkm" }
      : { nama_contact: displayName, nama_institusi: institution.name.trim(), jenis_institusi: institution.type, lokasi: institution.city, signup_account_type: "institution" };

    const { error: updateError } = await supabase.auth.updateUser({ data: metadata });
    if (updateError) {
      setError(authErrorMessage(updateError.message, "Data belum tersimpan. Coba lagi."));
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/bootstrap", { method: "POST" });
    if (!response.ok) {
      setError("Data tersimpan, tetapi usaha belum dapat disiapkan. Coba tekan tombol ini sekali lagi.");
      setLoading(false);
      return;
    }
    window.location.href = role === "umkm" ? "/umkm/profil?onboarding=1" : "/auth/continue";
  }

  return (
    <>
      <h1 className="font-headline mb-2 text-2xl font-bold text-[#141a34]">Satu langkah lagi</h1>
      <p className="mb-7 text-sm leading-6 text-[#687086]">
        Akun Google Anda sudah tersambung. Beri tahu kami sedikit tentang Anda supaya aplikasinya bisa disiapkan.
      </p>

      {error && (
        <div role="alert" aria-live="assertive" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={16} className="shrink-0" />{error}
        </div>
      )}

      <div className="mb-5 flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
        {([["umkm", "Pemilik UMKM"], ["institution", "Lembaga"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setRole(value); setError(""); }}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-xs font-bold ${role === value ? "bg-white text-blue-900 shadow-sm" : "text-slate-500"}`}
          >
            {value === "umkm" ? <Store size={14} /> : <Building size={14} />}{label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {role === "umkm" ? (
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
              <CitySelect value={business.city} onChange={(city) => setBusiness({ ...business, city })} />
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Nama lembaga</span>
              <input value={institution.name} onChange={(event) => setInstitution({ ...institution, name: event.target.value })} className="field-input" style={{ paddingLeft: 14 }} placeholder="Contoh: Bank Daerah Sejahtera" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Jenis lembaga</span>
              <select value={institution.type} onChange={(event) => setInstitution({ ...institution, type: event.target.value })} className="field-input" style={{ paddingLeft: 14 }}>
                {INSTITUTION_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold text-[#141a34]">Kota atau kabupaten</span>
              <CitySelect value={institution.city} onChange={(city) => setInstitution({ ...institution, city })} />
            </div>
          </>
        )}

        <button type="submit" disabled={loading} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#001b85] text-sm font-bold text-white disabled:opacity-60">
          {loading ? "Menyiapkan…" : "Mulai pakai Berkembang.id"}
        </button>
      </form>
    </>
  );
}
