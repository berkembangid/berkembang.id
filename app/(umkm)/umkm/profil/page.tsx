"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { User, Mail, Building2, Phone, Save, FileText, Camera, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";
import OwnerConsentPanel from "@/modules/consent/owner-consent-panel";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";

const SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

interface ProfileRecord {
  name?: string | null;
  nama_pemilik?: string | null;
  nama_usaha?: string | null;
  sektor_usaha?: string | null;
  lokasi?: string | null;
  phone?: string | null;
  nib?: string | null;
  alamat?: string | null;
  avatar_url?: string | null;
}

export default function ProfilPage() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  // Form Fields for Business Profile
  const [form, setForm] = useState({
    email: "",
    namaPemilik: "",
    namaUsaha: "",
    sektor: "Kuliner",
    lokasi: "",
    alamat: "",
    phone: "",
    nib: "",
    avatarUrl: "",
  });

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let dbProfile: ProfileRecord | null = null;
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

          const namaUsaha = dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || "";
          const namaPemilik = dbProfile?.nama_pemilik || dbProfile?.name || user.user_metadata?.nama_pemilik || user.user_metadata?.name || "";
          const sektor = dbProfile?.sektor_usaha || user.user_metadata?.sektor_usaha || "Kuliner";
          const lokasi = dbProfile?.lokasi || user.user_metadata?.lokasi || "";
          const phone = dbProfile?.phone || user.user_metadata?.phone || "";
          const nib = dbProfile?.nib || user.user_metadata?.nib || "";
          const alamat = dbProfile?.alamat || user.user_metadata?.alamat || "";
          const avatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || "";

          setForm({
            email: user.email || "",
            namaPemilik: namaPemilik,
            namaUsaha: namaUsaha || dbProfile?.name || "",
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
      }
    }
    loadUserProfile();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewAvatar(url);
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

      let finalAvatarUrl = form.avatarUrl;

      // Upload image directly to Supabase Storage 'avatars' bucket if a new file was selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) {
          throw new Error("Foto belum berhasil diunggah. Silakan coba lagi.");
        }

        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);
        if (publicUrlData?.publicUrl) {
          finalAvatarUrl = publicUrlData.publicUrl;
        }
      }

      // 1. Update Supabase auth user metadata
      const { error: updateAuthError } = await supabase.auth.updateUser({
        data: {
          name: form.namaPemilik,
          nama_pemilik: form.namaPemilik,
          nama_usaha: form.namaUsaha,
          sektor_usaha: form.sektor,
          lokasi: form.lokasi,
          phone: form.phone,
          nib: form.nib,
          alamat: form.alamat,
          avatar_url: finalAvatarUrl,
        },
      });

      if (updateAuthError) {
        throw new Error("Profil belum berhasil diperbarui. Silakan coba lagi.");
      }

      // 2. Upsert profile table row in Supabase
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          name: form.namaPemilik || form.namaUsaha,
          nama_pemilik: form.namaPemilik,
          nama_usaha: form.namaUsaha,
          sektor_usaha: form.sektor,
          lokasi: form.lokasi,
          phone: form.phone,
          email: form.email,
          avatar_url: finalAvatarUrl,
          updated_at: new Date().toISOString(),
        });

      if (upsertError) {
        throw new Error("Profil belum berhasil disimpan. Silakan coba lagi.");
      }

      setForm((prev) => ({ ...prev, avatarUrl: finalAvatarUrl }));
      setMessage({ type: "success", text: "✓ Profil & Foto Usaha berhasil disimpan!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: unknown) {
      console.error("Save profile error");
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal menyimpan profil.",
      });
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
      <DashboardPage width="compact">
        <PageHeader title="Profil & identitas usaha" description="Pastikan informasi usaha tetap lengkap dan terbaru agar dokumen serta laporan mudah dikenali." icon={Building2} actions={<button onClick={handleSignOut} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#c8d3de] bg-white px-4 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9]"><LogOut size={14} /> Keluar akun</button>} />
        <OwnerConsentPanel />

        {message && (
          <FeedbackBanner tone={message.type === "success" ? "success" : "error"} live>{message.text}</FeedbackBanner>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar & Basic Info Header Card */}
          <div className="bg-white rounded-2xl p-6 border border-[#e3e9f0] shadow-card flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl bg-[#0b5f86] text-white flex items-center justify-center font-bold text-3xl shadow-md overflow-hidden border-2 border-[#0b5f86]/20">
                {previewAvatar ? (
                  <Image src={previewAvatar} alt="Foto profil usaha" width={96} height={96} unoptimized className="h-full w-full object-cover" />
                ) : (
                  form.namaUsaha ? form.namaUsaha.charAt(0).toUpperCase() : "U"
                )}
              </div>
              <label htmlFor="avatar-upload" className="absolute -bottom-2 -right-2 bg-[#0b5f86] text-white p-2 rounded-xl shadow-lg cursor-pointer hover:bg-[#0f73a3] transition-colors" title="Unggah foto profil">
                <Camera size={14} />
                <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="font-headline text-xl font-bold text-[#1b2a3a]">{form.namaUsaha || "Nama Usaha Belum Diisi"}</h2>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck size={12} /> Akun Terverifikasi
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Pemilik: <span className="font-bold text-slate-700">{form.namaPemilik || "Belum Diisi"}</span> · {form.email}</p>
              <p className="text-xs text-[#0b5f86] font-semibold">{form.sektor} · {form.lokasi || "Lokasi belum diisi"}</p>
            </div>
          </div>

          {/* Form Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Section 1: Informasi Usaha */}
            <div className="bg-white rounded-2xl p-6 border border-[#e3e9f0] shadow-card space-y-4">
              <h3 className="font-headline text-sm font-bold text-[#1b2a3a] flex items-center gap-2 border-b border-slate-100 pb-3">
                <Building2 size={16} className="text-[#0b5f86]" /> Detail Informasi Usaha
              </h3>

              <div>
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">Nama Usaha</label>
                <div className="relative">
                  <input
                    value={form.namaUsaha}
                    onChange={(e) => setForm({ ...form, namaUsaha: e.target.value })}
                    placeholder="Contoh: Warung Ayam Geprek Ibu Sari"
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c8d3de] text-sm focus:border-[#0b5f86] focus:outline-none"
                    required
                  />
                  <Building2 size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">Sektor Usaha</label>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, sektor: s })}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                        form.sektor === s ? "bg-[#0b5f86] text-white border-[#0b5f86]" : "bg-white text-[#4a6280] border-[#c8d3de]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">Kota / Kabupaten Usaha *</label>
                <CitySelect
                  value={form.lokasi}
                  onChange={(val) => setForm({ ...form, lokasi: val })}
                  placeholder="Pilih Kota / Kabupaten Usaha..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">Alamat Lengkap Kios / Toko</label>
                <textarea
                  rows={3}
                  value={form.alamat}
                  onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                  placeholder="Jl. Merdeka No. 12, Kelurahan X, Kecamatan Y"
                  className="w-full px-4 py-3 rounded-xl border border-[#c8d3de] text-sm focus:border-[#0b5f86] focus:outline-none"
                />
              </div>
            </div>

            {/* Section 2: Kontak & Legalitas NIB */}
            <div className="bg-white rounded-2xl p-6 border border-[#e3e9f0] shadow-card space-y-4">
              <h3 className="font-headline text-sm font-bold text-[#1b2a3a] flex items-center gap-2 border-b border-slate-100 pb-3">
                <FileText size={16} className="text-[#0b5f86]" /> Kontak & Legalitas Usaha
              </h3>

              <div>
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">Nama Pemilik Usaha (Owner)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.namaPemilik}
                    onChange={(e) => setForm({ ...form, namaPemilik: e.target.value })}
                    placeholder="Contoh: Ibu Sari / Pak Pur"
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c8d3de] text-sm focus:border-[#0b5f86] focus:outline-none font-medium"
                    required
                  />
                  <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">Email Terdaftar</label>
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
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">Nomor Telepon / WhatsApp</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-4 py-3 pl-10 rounded-xl border border-[#c8d3de] text-sm focus:border-[#0b5f86] focus:outline-none"
                  />
                  <Phone size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a6280] mb-1.5">NIB (Nomor Induk Berusaha)</label>
                <div className="relative">
                  <input
                    value={form.nib}
                    onChange={(e) => setForm({ ...form, nib: e.target.value })}
                    placeholder="13 Digit NIB (Opsional, dari OSS.go.id)"
                    className={`w-full px-4 py-3 pl-10 pr-4 rounded-xl border text-sm focus:border-[#0b5f86] focus:outline-none font-mono ${
                      form.nib ? "border-emerald-300 bg-emerald-50/40" : "border-[#c8d3de]"
                    }`}
                  />
                  <FileText size={17} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${form.nib ? "text-emerald-500" : "text-slate-400"}`} />
                </div>
                {form.nib ? (
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                      <ShieldCheck size={12} /> NIB terisi — skor kesiapan usaha Anda meningkat signifikan.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    💡 Pengisian NIB akan menaikkan Readiness Score usaha Anda secara signifikan.{" "}
                    <Link href="/umkm/upload" className="text-[#0b5f86] underline font-semibold">
                      Unggah dokumen NIB agar datanya dapat dibaca otomatis →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto bg-[#0b5f86] text-white font-bold px-8 py-3.5 rounded-xl text-sm hover:bg-[#0f73a3] transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Menyimpan perubahan..." : "Simpan perubahan"}
            </button>
          </div>
        </form>
      </DashboardPage>
    </>
  );
}
