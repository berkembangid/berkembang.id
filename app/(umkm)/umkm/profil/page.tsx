"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Building2, MapPin, Tag, Phone, Save, FileText, Camera, Check, AlertCircle, LogOut, ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

export default function ProfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form Fields for Business Profile
  const [form, setForm] = useState({
    email: "",
    namaUsaha: "",
    sektor: "Kuliner",
    lokasi: "",
    alamat: "",
    phone: "",
    nib: "",
    avatarUrl: "",
  });

  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let dbProfile: any = null;
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            dbProfile = prof;
          } catch (e) {
            console.warn("Profile table load skipped:", e);
          }

          const nama = dbProfile?.name || dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || "";
          const sektor = dbProfile?.sektor_usaha || user.user_metadata?.sektor_usaha || "Kuliner";
          const lokasi = dbProfile?.lokasi || user.user_metadata?.lokasi || "";
          const phone = dbProfile?.phone || user.user_metadata?.phone || "";
          const nib = dbProfile?.nib || user.user_metadata?.nib || "";
          const alamat = dbProfile?.alamat || user.user_metadata?.alamat || "";
          const avatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || "";

          setForm({
            email: user.email || "",
            namaUsaha: nama,
            sektor: sektor,
            lokasi: lokasi,
            alamat: alamat,
            phone: phone,
            nib: nib,
            avatarUrl: avatar,
          });

          if (avatar) setPreviewAvatar(avatar);
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadUserProfile();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewAvatar(url);
      setForm((prev) => ({ ...prev, avatarUrl: url }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: "error", text: "Sesi habis. Silakan masuk kembali." });
        setSaving(false);
        return;
      }

      // 1. Update Supabase auth user metadata
      const { error: updateAuthError } = await supabase.auth.updateUser({
        data: {
          nama_usaha: form.namaUsaha,
          sektor_usaha: form.sektor,
          lokasi: form.lokasi,
          phone: form.phone,
          nib: form.nib,
          alamat: form.alamat,
          avatar_url: form.avatarUrl,
        },
      });

      if (updateAuthError) {
        console.warn("Auth update warning:", updateAuthError.message);
      }

      // 2. Upsert profile table row in Supabase
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          name: form.namaUsaha,
          nama_usaha: form.namaUsaha,
          sektor_usaha: form.sektor,
          lokasi: form.lokasi,
          phone: form.phone,
          email: form.email,
          role: "umkm",
          updated_at: new Date().toISOString(),
        });

      if (upsertError) {
        console.warn("Profiles upsert warning:", upsertError.message);
      }

      setMessage({ type: "success", text: "✓ Profil usaha berhasil disimpan!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error("Save profile error:", err);
      setMessage({ type: "error", text: err.message || "Gagal menyimpan profil." });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Sign out warning:", e);
    }
    window.location.href = "/auth/login";
  };

  return (
    <>
      {/* Header - Mobile only */}
      <header className="md:hidden sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-5 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <Link href="/umkm">
          <button className="flex items-center gap-1.5 text-xs font-bold text-[#001b85]">
            <ArrowLeft size={16} /> Beranda
          </button>
        </Link>
        <span className="text-xs font-bold text-[#141a34]">Profil Usaha</span>
        <button onClick={handleSignOut} className="text-xs text-red-600 font-bold flex items-center gap-1 cursor-pointer">
          <LogOut size={14} />
        </button>
      </header>

      <main className="px-5 md:px-0 py-5 space-y-6 pb-28 md:pb-8 max-w-4xl mx-auto">
        {/* Title Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-bold text-[#141a34]">Profil & Identitas Usaha</h1>
            <p className="text-xs text-slate-500 mt-0.5">Kelola detail informasi nama, sektor, lokasi, NIB, dan foto profil usaha Anda</p>
          </div>
          <button onClick={handleSignOut} className="hidden md:flex text-xs font-bold text-red-600 border border-red-200 bg-red-50 px-4 py-2 rounded-xl hover:bg-red-100 items-center gap-1.5 transition-colors cursor-pointer">
            <LogOut size={14} /> Keluar dari Akun
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl border text-xs font-bold flex items-center gap-2 animate-fade-in ${
            message.type === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
          }`}>
            {message.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar & Basic Info Header Card */}
          <div className="bg-white rounded-2xl p-6 border border-[#e5e7ff] shadow-card flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl bg-[#001b85] text-white flex items-center justify-center font-bold text-3xl shadow-md overflow-hidden border-2 border-[#001b85]/20">
                {previewAvatar ? (
                  <img src={previewAvatar} alt="Foto Profil Usaha" className="w-full h-full object-cover" />
                ) : (
                  form.namaUsaha ? form.namaUsaha.charAt(0).toUpperCase() : "U"
                )}
              </div>
              <label htmlFor="avatar-upload" className="absolute -bottom-2 -right-2 bg-[#001b85] text-white p-2 rounded-xl shadow-lg cursor-pointer hover:bg-[#0e32c2] transition-colors">
                <Camera size={14} />
                <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="font-headline text-xl font-bold text-[#141a34]">{form.namaUsaha || "Nama Usaha Belum Diisi"}</h2>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck size={12} /> Akun Terverifikasi
                </span>
              </div>
              <p className="text-xs text-slate-500">{form.email}</p>
              <p className="text-xs text-[#001b85] font-semibold">{form.sektor} · {form.lokasi || "Lokasi belum diisi"}</p>
            </div>
          </div>

          {/* Form Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Section 1: Informasi Usaha */}
            <div className="bg-white rounded-2xl p-6 border border-[#e5e7ff] shadow-card space-y-4">
              <h3 className="font-headline text-sm font-bold text-[#141a34] flex items-center gap-2 border-b border-slate-100 pb-3">
                <Building2 size={16} className="text-[#001b85]" /> Detail Informasi Usaha
              </h3>

              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Nama Usaha</label>
                <div className="relative">
                  <input
                    value={form.namaUsaha}
                    onChange={(e) => setForm({ ...form, namaUsaha: e.target.value })}
                    placeholder="Contoh: Warung Ayam Geprek Ibu Sari"
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none"
                    required
                  />
                  <Building2 size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Sektor Usaha</label>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, sektor: s })}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                        form.sektor === s ? "bg-[#001b85] text-white border-[#001b85]" : "bg-white text-[#444655] border-[#c5c5d7]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Kota / Kabupaten Usaha</label>
                <div className="relative">
                  <input
                    value={form.lokasi}
                    onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
                    placeholder="Contoh: Jakarta Selatan"
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none"
                    required
                  />
                  <MapPin size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Alamat Lengkap Kios / Toko</label>
                <textarea
                  rows={3}
                  value={form.alamat}
                  onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                  placeholder="Jl. Merdeka No. 12, Kelurahan X, Kecamatan Y"
                  className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none"
                />
              </div>
            </div>

            {/* Section 2: Kontak & Legalitas NIB */}
            <div className="bg-white rounded-2xl p-6 border border-[#e5e7ff] shadow-card space-y-4">
              <h3 className="font-headline text-sm font-bold text-[#141a34] flex items-center gap-2 border-b border-slate-100 pb-3">
                <FileText size={16} className="text-[#001b85]" /> Kontak & Legalitas Usaha
              </h3>

              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Email Terdaftar</label>
                <div className="relative">
                  <input
                    type="email"
                    value={form.email}
                    disabled
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
                  />
                  <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">Nomor Telepon / WhatsApp</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none"
                  />
                  <Phone size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#444655] mb-1.5">NIB (Nomor Induk Berusaha)</label>
                <div className="relative">
                  <input
                    value={form.nib}
                    onChange={(e) => setForm({ ...form, nib: e.target.value })}
                    placeholder="13 Digit NIB (Opsional, dari OSS.go.id)"
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none font-mono"
                  />
                  <FileText size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">💡 Pengisian NIB akan menaikkan Readiness Score usaha Anda secara signifikan.</p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto bg-[#001b85] text-white font-bold px-8 py-3.5 rounded-xl text-sm hover:bg-[#0e32c2] transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Menyimpan..." : "Simpan Perubahan Profil 🚀"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
