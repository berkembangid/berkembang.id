"use client";

import Link from "next/link";
import { AccountDataPanel } from "@/components/warung/AccountDataPanel";
import { profileSectorOptions } from "@/modules/accounting/sector-mapping";
import { LegalitySummary } from "@/components/warung/LegalitySummary";
import Image from "next/image";
import { useState, useEffect } from "react";
import { User, Mail, Building2, Phone, Save, FileText, Camera, LogOut, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";
import OwnerConsentPanel from "@/modules/consent/owner-consent-panel";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";

/**
 * Pilihan sektor datang dari tabel pemetaan, bukan daftar tersendiri.
 * Daftar yang berdiri sendiri di layar akan bergeser dari tabel yang
 * menentukan template kategorinya, dan pergeseran itu tidak akan terlihat
 * sampai ada pemilik yang kategorinya terasa asing.
 */
const SECTORS = profileSectorOptions;

/** Pilihan jumlah karyawan; nilainya sama dengan CHECK di `0045`. */
const HEADCOUNTS = [
  { value: "sendiri", label: "Saya sendiri" },
  { value: "1-4", label: "1–4 orang" },
  { value: "5-19", label: "5–19 orang" },
] as const;

/** Kanal penjualan memberi makan kesiapan "asal pesanan". */
const CHANNELS = [
  { value: "warung", label: "Warung / kios" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "marketplace", label: "Marketplace" },
  { value: "media_sosial", label: "Media sosial" },
] as const;

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
  deletion_scheduled_for?: string | null;
  bentuk_usaha?: string | null;
  tahun_mulai_usaha?: number | null;
  jumlah_karyawan?: string | null;
  kanal_penjualan?: string[] | null;
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-[#1b2a3a]">{label}</label>
      {children}
      {hint && <p className="text-[10px] leading-relaxed text-[#6e859e]">{hint}</p>}
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  multi = false,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | T[];
  multi?: boolean;
  onChange: (next: T | T[]) => void;
}) {
  function isActive(v: T) {
    return Array.isArray(value) ? value.includes(v) : value === v;
  }
  function toggle(v: T) {
    if (!multi) { onChange(v); return; }
    const arr = Array.isArray(value) ? value : [];
    onChange(isActive(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            isActive(opt.value)
              ? "bg-[#0b5f86] text-white border-[#0b5f86]"
              : "bg-white text-[#4a6280] border-[#c8d3de] hover:border-[#0b5f86] hover:text-[#0b5f86]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function ProfilPage() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [deletionScheduledFor, setDeletionScheduledFor] = useState<string | null>(null);

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
    bentukUsaha: "perorangan" as "perorangan" | "badan_usaha",
    tahunMulai: "",
    jumlahKaryawan: "",
    kanalPenjualan: [] as string[],
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
            bentukUsaha: dbProfile?.bentuk_usaha === "badan_usaha" ? "badan_usaha" : "perorangan",
            tahunMulai: dbProfile?.tahun_mulai_usaha ? String(dbProfile.tahun_mulai_usaha) : "",
            jumlahKaryawan: dbProfile?.jumlah_karyawan || "",
            kanalPenjualan: dbProfile?.kanal_penjualan || [],
          });

          if (avatar) setPreviewAvatar(avatar);
          setDeletionScheduledFor(dbProfile?.deletion_scheduled_for ?? null);
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
          bentuk_usaha: form.bentukUsaha,
          tahun_mulai_usaha: form.tahunMulai ? Number(form.tahunMulai) : null,
          jumlah_karyawan: form.jumlahKaryawan || null,
          kanal_penjualan: form.kanalPenjualan,
          updated_at: new Date().toISOString(),
        });

      if (upsertError) {
        throw new Error("Profil belum berhasil disimpan. Silakan coba lagi.");
      }

      setForm((prev) => ({ ...prev, avatarUrl: finalAvatarUrl }));
      setMessage({ type: "success", text: "Profil berhasil disimpan." });
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

  const initials = (form.namaUsaha || form.namaPemilik || "U").charAt(0).toUpperCase();

  return (
    <>
      <DashboardPage width="compact">
        <PageHeader
          title="Profil usaha"
          description="Informasi usaha Anda — lengkapi agar dokumen dan laporan mudah dikenali."
          icon={Building2}
          actions={
            <button
              onClick={handleSignOut}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#c8d3de] bg-white px-4 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9] transition-colors"
            >
              <LogOut size={14} /> Keluar
            </button>
          }
        />

        {message && (
          <FeedbackBanner tone={message.type === "success" ? "success" : "error"} live>
            {message.text}
          </FeedbackBanner>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Identity card */}
          <div className="flex items-center gap-4 rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-[0_4px_16px_rgba(27,42,58,.04)]">
            <div className="relative shrink-0">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#d6eefa] text-xl font-extrabold text-[#0b5f86] overflow-hidden">
                {previewAvatar ? (
                  <Image src={previewAvatar} alt="Foto profil" width={64} height={64} unoptimized className="h-full w-full object-cover" />
                ) : initials}
              </div>
              <label htmlFor="avatar-upload" className="absolute -bottom-1 -right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-[#0b5f86] text-white shadow-md hover:bg-[#0f73a3] transition-colors" title="Ganti foto">
                <Camera size={12} />
                <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[#1b2a3a]">{form.namaUsaha || "Nama usaha belum diisi"}</p>
              <p className="truncate text-xs text-[#6e859e]">{form.namaPemilik || "Nama pemilik"} · {form.sektor}</p>
              <p className="truncate text-[10px] text-[#9fb0c2]">{form.email}</p>
            </div>
          </div>

          {/* Sections */}
          <div className="grid gap-4 md:grid-cols-2">

            {/* Usaha */}
            <section className="rounded-2xl border border-[#e3e9f0] bg-white shadow-[0_4px_16px_rgba(27,42,58,.04)]">
              <div className="flex items-center gap-2 border-b border-[#f0f4f8] px-5 py-4">
                <Building2 size={15} className="text-[#0b5f86]" />
                <h2 className="text-xs font-bold text-[#1b2a3a]">Informasi usaha</h2>
              </div>
              <div className="space-y-4 p-5">
                <FormField label="Nama usaha">
                  <input
                    required
                    value={form.namaUsaha}
                    onChange={(e) => setForm({ ...form, namaUsaha: e.target.value })}
                    placeholder="Contoh: Warung Ayam Geprek Ibu Sari"
                    className="w-full rounded-xl border border-[#c8d3de] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#0b5f86]"
                  />
                </FormField>

                <FormField label="Sektor usaha">
                  <ChipGroup
                    options={SECTORS.map((s) => ({ value: s, label: s }))}
                    value={form.sektor}
                    onChange={(v) => setForm({ ...form, sektor: v as string })}
                  />
                </FormField>

                <FormField label="Bentuk usaha" hint="Menentukan dokumen mana yang diminta di halaman Dokumen.">
                  <ChipGroup
                    options={[
                      { value: "perorangan", label: "Usaha perorangan" },
                      { value: "badan_usaha", label: "Badan usaha (PT/CV)" },
                    ] as const}
                    value={form.bentukUsaha}
                    onChange={(v) => setForm({ ...form, bentukUsaha: v as "perorangan" | "badan_usaha" })}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Tahun mulai usaha">
                    <input
                      value={form.tahunMulai}
                      onChange={(e) => setForm({ ...form, tahunMulai: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                      inputMode="numeric"
                      placeholder="2019"
                      className="w-full rounded-xl border border-[#c8d3de] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#0b5f86]"
                    />
                  </FormField>

                  <FormField label="Jumlah orang bekerja">
                    <ChipGroup
                      options={HEADCOUNTS}
                      value={form.jumlahKaryawan}
                      onChange={(v) => setForm({ ...form, jumlahKaryawan: form.jumlahKaryawan === v ? "" : v as string })}
                    />
                  </FormField>
                </div>

                <FormField label="Pembeli datang dari mana" hint="Boleh lebih dari satu.">
                  <ChipGroup
                    options={CHANNELS}
                    value={form.kanalPenjualan}
                    multi
                    onChange={(v) => setForm({ ...form, kanalPenjualan: v as string[] })}
                  />
                </FormField>

                <FormField label="Kota / kabupaten usaha">
                  <CitySelect
                    value={form.lokasi}
                    onChange={(val) => setForm({ ...form, lokasi: val })}
                    placeholder="Pilih kota..."
                    required
                  />
                </FormField>

                <FormField label="Alamat lengkap">
                  <textarea
                    rows={2}
                    value={form.alamat}
                    onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                    placeholder="Jl. Merdeka No. 12, Kelurahan X"
                    className="w-full rounded-xl border border-[#c8d3de] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#0b5f86] resize-none"
                  />
                </FormField>
              </div>
            </section>

            {/* Kontak & Legalitas */}
            <div className="space-y-4">
              <section className="rounded-2xl border border-[#e3e9f0] bg-white shadow-[0_4px_16px_rgba(27,42,58,.04)]">
                <div className="flex items-center gap-2 border-b border-[#f0f4f8] px-5 py-4">
                  <User size={15} className="text-[#0b5f86]" />
                  <h2 className="text-xs font-bold text-[#1b2a3a]">Kontak</h2>
                </div>
                <div className="space-y-4 p-5">
                  <FormField label="Nama pemilik usaha">
                    <div className="relative">
                      <input
                        required
                        value={form.namaPemilik}
                        onChange={(e) => setForm({ ...form, namaPemilik: e.target.value })}
                        placeholder="Contoh: Ibu Sari"
                        className="w-full rounded-xl border border-[#c8d3de] py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#0b5f86]"
                      />
                      <User size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9fb0c2]" />
                    </div>
                  </FormField>

                  <FormField label="Email terdaftar">
                    <div className="relative">
                      <input
                        disabled
                        value={form.email}
                        className="w-full rounded-xl border border-[#e3e9f0] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-sm text-[#6e859e] cursor-not-allowed"
                      />
                      <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9fb0c2]" />
                    </div>
                  </FormField>

                  <FormField label="Nomor WhatsApp / telepon">
                    <div className="relative">
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="081234567890"
                        className="w-full rounded-xl border border-[#c8d3de] py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#0b5f86]"
                      />
                      <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9fb0c2]" />
                    </div>
                  </FormField>
                </div>
              </section>

              {/* Legalitas */}
              <section className="rounded-2xl border border-[#e3e9f0] bg-white shadow-[0_4px_16px_rgba(27,42,58,.04)]">
                <div className="flex items-center justify-between border-b border-[#f0f4f8] px-5 py-4">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-[#0b5f86]" />
                    <h2 className="text-xs font-bold text-[#1b2a3a]">Legalitas usaha</h2>
                  </div>
                  <Link href="/umkm/upload" className="flex items-center gap-1 text-[10px] font-bold text-[#0b5f86] hover:underline">
                    Kelola dokumen <ChevronRight size={11} />
                  </Link>
                </div>
                <div className="p-5">
                  {/* NIB tidak lagi diketik di sini — sumber kebenaran tunggal: berkas di halaman Dokumen. */}
                  <LegalitySummary />
                </div>
              </section>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end pb-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-8 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0f73a3] disabled:opacity-50 sm:w-auto"
            >
              <Save size={15} />
              {saving ? "Menyimpan..." : "Simpan perubahan"}
            </button>
          </div>
        </form>

        {/* Data & Privasi — di bawah form agar tidak mengganggu alur utama */}
        <section aria-labelledby="privasi-akun" className="space-y-3 border-t border-[#f0f4f8] pt-4">
          <div>
            <h2 id="privasi-akun" className="text-xs font-bold text-[#1b2a3a]">Data & akun Anda</h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#6e859e]">
              Catatan usaha ini milik Anda. Anda boleh membawanya pergi kapan saja.
            </p>
          </div>
          <OwnerConsentPanel />
          <AccountDataPanel scheduledFor={deletionScheduledFor} />
        </section>
      </DashboardPage>
    </>
  );
}
