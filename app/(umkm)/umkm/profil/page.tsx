"use client";

import Link from "next/link";
import { AccountDataPanel } from "@/components/warung/AccountDataPanel";
import { profileSectorOptions } from "@/modules/accounting/sector-mapping";
import { LegalitySummary } from "@/components/warung/LegalitySummary";
import { BusinessAccountSummary } from "@/components/warung/BusinessAccountSummary";
import Image from "next/image";
import { useState, useEffect, useId } from "react";
import { User, Mail, Building2, Phone, Save, FileText, Camera, ChevronRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { notifyFailure, notifySuccess, notifyWarning } from "@/lib/notify";
import { PROFILE_UPDATED_EVENT, type ProfileUpdatedDetail } from "../../user-avatar";

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

/**
 * Empat bagian yang sama dengan komponen kesiapan C2 -- angka di sini dan di
 * halaman Perjalanan tidak boleh berbeda.
 */
function profileCompleteness(form: { tahunMulai: string; alamat: string; phone: string; kanalPenjualan: string[] }) {
  const parts = [
    { label: "tahun mulai usaha", filled: /^\d{4}$/.test(form.tahunMulai) },
    { label: "alamat", filled: form.alamat.trim().length > 0 },
    { label: "nomor WhatsApp", filled: form.phone.trim().length > 0 },
    { label: "asal pembeli", filled: form.kanalPenjualan.length > 0 },
  ];
  return { total: parts.length, filled: parts.filter((part) => part.filled).length, missing: parts.filter((part) => !part.filled).map((part) => part.label) };
}

/** Salah isi yang paling sering: tahun salah ketik dan nomor terlalu pendek. */
function profileProblem(form: { tahunMulai: string; phone: string }): string | null {
  const year = Number(form.tahunMulai);
  const thisYear = new Date().getFullYear();
  if (form.tahunMulai && (year < 1950 || year > thisYear)) return `Tahun mulai usaha harus antara 1950 dan ${thisYear}.`;
  const digits = form.phone.replace(/[^\d]/g, "");
  if (form.phone.trim() && (digits.length < 9 || digits.length > 15)) return "Nomor WhatsApp terlihat belum lengkap. Tulis seperti 081234567890.";
  return null;
}

/**
 * Label yang benar-benar terhubung.
 *
 * `htmlFor` untuk satu isian: label lama berdiri sendiri, jadi pembaca layar
 * mengumumkan kotak tanpa nama dan mengetuk labelnya tidak memfokuskan apa
 * pun. Tanpa `htmlFor` isinya kumpulan pilihan (chip), yang diberi nama
 * sebagai satu kelompok -- label tidak boleh membungkus tombol, karena
 * mengetuk labelnya akan ikut menekan chip pertama.
 */
function FormField({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const hintId = hint ? `${htmlFor ?? generatedId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-xs font-bold text-umkm-ink">{label}</label>
      ) : (
        <p id={labelId} className="text-xs font-bold text-umkm-ink">{label}</p>
      )}
      {htmlFor ? children : <div role="group" aria-labelledby={labelId} aria-describedby={hintId}>{children}</div>}
      {hint && <p id={hintId} className="text-xs leading-relaxed text-umkm-subtle">{hint}</p>}
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
          aria-pressed={isActive(opt.value)}
          onClick={() => toggle(opt.value)}
          className={`inline-flex min-h-11 items-center text-xs font-semibold px-4 rounded-full border transition-colors ${
            isActive(opt.value)
              ? "bg-umkm-brand text-white border-umkm-brand"
              : "bg-white text-umkm-muted border-umkm-line-strong hover:border-umkm-brand hover:text-umkm-brand"
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

  // Null berarti belum dibaca; `true`/`false` baru berarti jawabannya. Tanpa
  // keadaan ketiga ini, perkenalan berkelip muncul sesaat pada setiap pemilik
  // sebelum profilnya selesai dibaca.

  /**
   * Formulir baru boleh disimpan setelah profilnya selesai dibaca.
   *
   * Sebelum terbaca, isian masih nilai bawaan (sektor « Kuliner », kolom
   * kosong). Menekan Simpan pada saat itu -- atau setelah pembacaannya gagal
   * -- menimpa profil asli dengan nilai bawaan tersebut.
   */
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  // Isi formulir saat terakhir dimuat atau disimpan, untuk tahu ada yang berubah.
  const [savedSnapshot, setSavedSnapshot] = useState("");

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoadState("failed");
          return;
        }
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) {
          setLoadState("failed");
          return;
        }
        const dbProfile = profileRow as ProfileRecord | null;
        const namaUsaha = dbProfile?.nama_usaha || user.user_metadata?.nama_usaha || "";
        const namaPemilik = dbProfile?.nama_pemilik || dbProfile?.name || user.user_metadata?.nama_pemilik || user.user_metadata?.name || "";
        const sektor = dbProfile?.sektor_usaha || user.user_metadata?.sektor_usaha || "Kuliner";
        const lokasi = dbProfile?.lokasi || user.user_metadata?.lokasi || "";
        const phone = dbProfile?.phone || user.user_metadata?.phone || "";
        const nib = dbProfile?.nib || user.user_metadata?.nib || "";
        const alamat = dbProfile?.alamat || user.user_metadata?.alamat || "";
        const avatar = dbProfile?.avatar_url || user.user_metadata?.avatar_url || "";

        const loaded = {
          email: user.email || "",
          namaPemilik: namaPemilik,
          namaUsaha: namaUsaha || dbProfile?.name || "",
          sektor: sektor,
          lokasi: lokasi,
          alamat: alamat,
          phone: phone,
          nib: nib,
          avatarUrl: avatar,
          bentukUsaha: (dbProfile?.bentuk_usaha === "badan_usaha" ? "badan_usaha" : "perorangan") as "perorangan" | "badan_usaha",
          tahunMulai: dbProfile?.tahun_mulai_usaha ? String(dbProfile.tahun_mulai_usaha) : "",
          jumlahKaryawan: dbProfile?.jumlah_karyawan || "",
          kanalPenjualan: dbProfile?.kanal_penjualan || [],
        };
        setForm(loaded);
        setSavedSnapshot(JSON.stringify(loaded));

        if (avatar) setPreviewAvatar(avatar);
        setDeletionScheduledFor(dbProfile?.deletion_scheduled_for ?? null);
        setLoadState("ready");
      } catch {
        setLoadState("failed");
      }
    }
    void loadUserProfile();
  }, [reloadKey]);

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
    if (loadState !== "ready") return;
    const problem = profileProblem(form);
    if (problem) { notifyWarning(problem); return; }
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        notifyWarning("Sesi habis. Silakan masuk kembali.");
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
          // Alamat dulu hanya masuk metadata akun. Formulir membaca
          // `profiles.alamat` lebih dulu, jadi alamat yang diubah terlihat
          // kembali ke nilai lama -- dan kesiapan C2 tidak pernah naik.
          alamat: form.alamat,
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

      setForm((prev) => {
        const next = { ...prev, avatarUrl: finalAvatarUrl };
        setSavedSnapshot(JSON.stringify(next));
        return next;
      });
      setSelectedFile(null);
      // Sidebar dan header membaca profil sekali saat dibuka; beri tahu mereka.
      window.dispatchEvent(new CustomEvent<ProfileUpdatedDetail>(PROFILE_UPDATED_EVENT, {
        detail: { name: form.namaPemilik || form.namaUsaha, businessName: form.namaUsaha, avatarUrl: finalAvatarUrl || null },
      }));
      notifySuccess("Profil usaha tersimpan", {
        description: "Nama ini yang muncul di laporan dan berkas yang Anda bagikan.",
      });
    } catch (err: unknown) {
      console.error("Save profile error");
      notifyFailure(err instanceof Error ? err.message : "Profil belum berhasil disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const initials = (form.namaUsaha || form.namaPemilik || "U").charAt(0).toUpperCase();
  const dirty = loadState === "ready" && (selectedFile !== null || JSON.stringify(form) !== savedSnapshot);
  const completeness = profileCompleteness(form);

  // Perubahan yang belum disimpan tidak boleh hilang karena satu ketukan
  // tombol kembali. Formulirnya panjang, dan tombol Simpan ada di dasarnya.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <>
      <DashboardPage width="compact">
        <PageHeader
          title="Profil usaha"
          description="Informasi usaha Anda — lengkapi agar dokumen dan laporan mudah dikenali. Foto izin boleh diunggah nanti."
          icon={Building2}
        />

        {loadState === "failed" && (
          <FeedbackBanner tone="error" title="Profil belum dapat dimuat">
            Isian di bawah belum tentu isi profil Anda, jadi tombol Simpan dimatikan supaya tidak menimpanya.{" "}
            <button
              type="button"
              onClick={() => { setLoadState("loading"); setReloadKey((key) => key + 1); }}
              className="inline-flex min-h-11 items-center font-bold underline"
            >
              Coba muat lagi
            </button>
          </FeedbackBanner>
        )}
        {loadState === "ready" && completeness.filled < completeness.total && (
          <section aria-label="Kelengkapan profil" className="rounded-2xl border border-umkm-brand-line bg-umkm-brand-soft p-4">
            <p className="text-sm font-bold text-umkm-ink">Profil terisi {completeness.filled} dari {completeness.total} bagian</p>
            <p className="mt-0.5 text-xs text-umkm-muted">Belum diisi: {completeness.missing.join(", ")}. Lembaga membaca bagian ini lebih dulu.</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Kelengkapan profil" aria-valuemin={0} aria-valuemax={completeness.total} aria-valuenow={completeness.filled}>
              <div className="h-full rounded-full bg-umkm-brand" style={{ width: `${(completeness.filled / completeness.total) * 100}%` }} />
            </div>
          </section>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          {/* Identity card */}
          <div className="flex items-center gap-4 rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_4px_16px_rgba(27,42,58,.04)]">
            <div className="relative shrink-0">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-umkm-brand-tint text-xl font-extrabold text-umkm-brand overflow-hidden">
                {previewAvatar ? (
                  <Image src={previewAvatar} alt="Foto profil" width={64} height={64} unoptimized className="h-full w-full object-cover" />
                ) : initials}
              </div>
              {/* Lingkaran 28px yang terlihat, di dalam sasaran sentuh 44px. */}
              <label htmlFor="avatar-upload" className="group absolute -bottom-3 -right-3 grid size-11 cursor-pointer place-items-center" aria-label="Ganti foto profil">
                <span className="grid size-7 place-items-center rounded-full bg-umkm-brand text-white shadow-md transition-colors group-hover:bg-umkm-brand-hover">
                  <Camera size={12} />
                </span>
                <input id="avatar-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
              </label>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-umkm-ink">{form.namaUsaha || "Nama usaha belum diisi"}</p>
              <p className="truncate text-xs text-umkm-subtle">{form.namaPemilik || "Nama pemilik"} · {form.sektor}</p>
              <p className="truncate text-xs text-umkm-subtle">{form.email}</p>
            </div>
          </div>

          {/* Sections */}
          <div className="grid gap-4 md:grid-cols-2">

            {/* Usaha */}
            <section className="rounded-2xl border border-umkm-line bg-white shadow-[0_4px_16px_rgba(27,42,58,.04)]">
              <div className="flex items-center gap-2 border-b border-umkm-line-soft px-5 py-4">
                <Building2 size={15} className="text-umkm-brand" />
                <h2 className="text-xs font-bold text-umkm-ink">Informasi usaha</h2>
              </div>
              <div className="space-y-4 p-5">
                <FormField label="Nama usaha" htmlFor="profil-nama-usaha">
                  <input
                    required
                    id="profil-nama-usaha"
                    value={form.namaUsaha}
                    onChange={(e) => setForm({ ...form, namaUsaha: e.target.value })}
                    placeholder="Contoh: Warung Ayam Geprek Ibu Sari"
                    className="w-full rounded-xl border border-umkm-line-strong px-3 py-3 text-sm outline-none transition-colors focus:border-umkm-brand"
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
                  <FormField label="Tahun mulai usaha" htmlFor="profil-tahun-mulai">
                    <input
                      id="profil-tahun-mulai"
                      value={form.tahunMulai}
                      onChange={(e) => setForm({ ...form, tahunMulai: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                      inputMode="numeric"
                      placeholder="2019"
                      className="w-full rounded-xl border border-umkm-line-strong px-3 py-3 text-sm outline-none transition-colors focus:border-umkm-brand"
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

                <FormField label="Kota / kabupaten usaha" htmlFor="profil-kota">
                  <CitySelect
                    id="profil-kota"
                    value={form.lokasi}
                    onChange={(val) => setForm({ ...form, lokasi: val })}
                    placeholder="Pilih kota..."
                    required
                  />
                </FormField>

                <FormField label="Alamat lengkap" htmlFor="profil-alamat">
                  <textarea
                    rows={2}
                    id="profil-alamat"
                    value={form.alamat}
                    onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                    placeholder="Jl. Merdeka No. 12, Kelurahan X"
                    className="w-full rounded-xl border border-umkm-line-strong px-3 py-3 text-sm outline-none transition-colors focus:border-umkm-brand resize-none"
                  />
                </FormField>
              </div>
            </section>

            {/* Kontak & Legalitas */}
            <div className="space-y-4">
              <section className="rounded-2xl border border-umkm-line bg-white shadow-[0_4px_16px_rgba(27,42,58,.04)]">
                <div className="flex items-center gap-2 border-b border-umkm-line-soft px-5 py-4">
                  <User size={15} className="text-umkm-brand" />
                  <h2 className="text-xs font-bold text-umkm-ink">Kontak</h2>
                </div>
                <div className="space-y-4 p-5">
                  <FormField label="Nama pemilik usaha" htmlFor="profil-nama-pemilik">
                    <div className="relative">
                      <input
                        required
                        id="profil-nama-pemilik"
                        value={form.namaPemilik}
                        onChange={(e) => setForm({ ...form, namaPemilik: e.target.value })}
                        placeholder="Contoh: Ibu Sari"
                        className="w-full rounded-xl border border-umkm-line-strong py-3 pl-9 pr-3 text-sm outline-none transition-colors focus:border-umkm-brand"
                      />
                      <User size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-umkm-faint" />
                    </div>
                  </FormField>

                  <FormField label="Email terdaftar" htmlFor="profil-email">
                    <div className="relative">
                      <input
                        disabled
                        id="profil-email"
                        value={form.email}
                        className="w-full rounded-xl border border-umkm-line bg-umkm-surface py-3 pl-9 pr-3 text-sm text-umkm-subtle cursor-not-allowed"
                      />
                      <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-umkm-faint" />
                    </div>
                  </FormField>

                  <FormField label="Nomor WhatsApp / telepon" htmlFor="profil-telepon">
                    <div className="relative">
                      <input
                        type="tel"
                        id="profil-telepon"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="081234567890"
                        className="w-full rounded-xl border border-umkm-line-strong py-3 pl-9 pr-3 text-sm outline-none transition-colors focus:border-umkm-brand"
                      />
                      <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-umkm-faint" />
                    </div>
                  </FormField>
                </div>
              </section>

              {/* Legalitas */}
              <section className="rounded-2xl border border-umkm-line bg-white shadow-[0_4px_16px_rgba(27,42,58,.04)]">
                <div className="flex items-center justify-between border-b border-umkm-line-soft px-5 py-4">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-umkm-brand" />
                    <h2 className="text-xs font-bold text-umkm-ink">Legalitas usaha</h2>
                  </div>
                  <Link href="/umkm/profil/dokumen" className="-mr-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-bold text-umkm-brand hover:bg-umkm-surface-muted">
                    Kelola dokumen <ChevronRight size={11} />
                  </Link>
                </div>
                <div className="space-y-4 p-5">
                  {/* NIB tidak lagi diketik di sini — sumber kebenaran tunggal: berkas di halaman Dokumen. */}
                  <LegalitySummary />
                  {/* Rekening usaha duduk di sini, bukan di Laporan: ia bagian
                      dari « usaha saya seperti apa », sama seperti izin. */}
                  <div>
                    <label className="mb-2 block text-xs font-bold text-umkm-muted">Pemisahan uang usaha</label>
                    <BusinessAccountSummary />
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Menempel di dasar layar ponsel (di atas bilah menu), supaya
              Simpan terlihat tanpa menggulir ke ujung formulir. */}
          <div className="sticky bottom-24 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-umkm-canvas/95 px-1 py-2 backdrop-blur md:static md:bottom-auto md:bg-transparent md:backdrop-blur-none">
            {dirty && <p role="status" className="mr-auto text-xs font-semibold text-umkm-warning">Ada perubahan yang belum disimpan</p>}
            <button
              type="submit"
              disabled={saving || loadState !== "ready"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-umkm-brand px-8 text-sm font-bold text-white shadow-sm transition-colors hover:bg-umkm-brand-hover disabled:opacity-50 sm:w-auto"
            >
              <Save size={15} />
              {saving ? "Menyimpan..." : loadState === "loading" ? "Memuat profil..." : "Simpan perubahan"}
            </button>
          </div>
        </form>

        {/* Data & Privasi — di bawah form agar tidak mengganggu alur utama */}
        <section aria-labelledby="privasi-akun" className="space-y-3 border-t border-umkm-line-soft pt-4">
          <div>
            <h2 id="privasi-akun" className="text-xs font-bold text-umkm-ink">Data & akun Anda</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-umkm-subtle">
              Catatan usaha ini milik Anda. Anda boleh membawanya pergi kapan saja.
            </p>
          </div>
          {/* Izin lembaga, program, dan dinas pembina pindah ke tab sendiri:
              dulu tersebar di puncak dan dasar halaman ini, di bawah tombol
              Simpan, dan tidak pernah terbaca sebagai satu hal. */}
          <Link
            href="/umkm/profil/izin"
            className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-umkm-line bg-white p-4 hover:bg-umkm-surface"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand"><ShieldCheck size={17} aria-hidden /></span>
              <span>
                <span className="block text-sm font-bold text-umkm-ink">Izin & program</span>
                <span className="block text-xs text-umkm-subtle">Siapa yang bisa melihat data usaha Anda, dan cara mencabutnya.</span>
              </span>
            </span>
            <ChevronRight size={16} aria-hidden className="shrink-0 text-umkm-subtle" />
          </Link>
          <AccountDataPanel scheduledFor={deletionScheduledFor} />
        </section>
      </DashboardPage>
    </>
  );
}
