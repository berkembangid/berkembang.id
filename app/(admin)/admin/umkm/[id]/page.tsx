"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Store, Save, ShieldAlert, CheckCircle2, Award, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";

const UMKM_SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

function scoreColor(s: number) {
  if (s < 50) return "text-red-600 bg-red-50 border-red-200";
  if (s < 70) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (s < 85) return "text-green-600 bg-green-50 border-green-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-300";
}

export default function UMKMDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [sektor, setSektor] = useState("Kuliner");
  const [lokasi, setLokasi] = useState("Depok");
  const [email, setEmail] = useState("");
  const [score, setScore] = useState(50);
  const [oldScore, setOldScore] = useState(50);
  const [konsistensiDays, setKonsistensiDays] = useState(1);
  const [status, setStatus] = useState("active");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (idParam) {
      fetchDetail();
    }
  }, [idParam]);

  async function fetchDetail() {
    setLoading(true);
    setErrorMsg("");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", idParam)
        .single();

      if (error || !data) {
        setErrorMsg("Data UMKM tidak ditemukan di database.");
      } else {
        const bName = data.nama_usaha || data.name || "Usaha UMKM";
        const oName = data.name && data.name !== bName ? data.name : (data.email ? data.email.split("@")[0] : "Pemilik Usaha");
        
        setBusinessName(bName);
        setOwnerName(oName);
        setSektor(data.sektor_usaha || "Kuliner");
        setLokasi(data.lokasi || "Depok");
        setEmail(data.email || "");
        const currentScore = Number(data.readiness_score) || 50;
        setScore(currentScore);
        setOldScore(currentScore);
        setKonsistensiDays(Number(data.konsistensi_days) || 1);
        setStatus(data.status || "active");
      }
    } catch (err: any) {
      console.error("Error fetching UMKM detail:", err);
      setErrorMsg("Gagal memuat detail data UMKM.");
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;

    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          nama_usaha: businessName.trim(),
          name: ownerName.trim(),
          sektor_usaha: sektor,
          lokasi: lokasi.trim(),
          email: email.trim(),
          readiness_score: score,
          konsistensi_days: konsistensiDays,
          status,
        })
        .eq("id", idParam);

      if (error) throw error;

      // Log score override if score was modified
      if (score !== oldScore) {
        const reasonText = overrideReason.trim() || "Override skor manual oleh admin";
        await supabase.from("audit_logs").insert({
          user_email: "admin@berkembang.id",
          action: "OVERRIDE_SCORE",
          details: `UMKM ID #${idParam} (${businessName}): Skor diubah ${oldScore} -> ${score}. Alasan: ${reasonText}`,
          status: "success",
        });
        setOldScore(score);
      } else {
        await supabase.from("audit_logs").insert({
          user_email: "admin@berkembang.id",
          action: "UPDATE_UMKM_DETAIL",
          details: `Perubahan data UMKM #${idParam}: ${businessName}`,
          status: "success",
        });
      }

      setSuccessMsg("Data UMKM berhasil diperbarui!");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      console.error("Error saving UMKM:", err);
      setErrorMsg(err.message || "Terjadi kesalahan saat menyimpan data.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl mx-auto">
      {/* Header & Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/admin/umkm")}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#001b85] transition-colors bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          Kembali ke Daftar UMKM
        </button>
        <span className="text-xs text-slate-400 font-mono">ID: {idParam}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6 md:p-8">
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold">
              <Store size={28} />
            </div>
            <div>
              <h1 className="font-headline text-xl md:text-2xl font-extrabold text-[#141a34]">
                Detail & Edit Profil UMKM
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola data profil, sektor usaha, dan kelayakan readiness score
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${scoreColor(score)}`}>
              Score: {score}/100
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            Memuat data UMKM dari database...
          </div>
        ) : errorMsg && !businessName ? (
          <div className="py-8 text-center text-xs text-red-500 font-medium">
            {errorMsg}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {successMsg && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <CheckCircle2 size={16} />
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold animate-fade-in">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nama Usaha / Toko *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Contoh: Kopi Wijaya"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nama Pemilik (Owner)
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Nama Pemilik"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Sektor Usaha
                </label>
                <select
                  value={sektor}
                  onChange={(e) => setSektor(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                >
                  {UMKM_SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Kota / Lokasi Usaha
                </label>
                <CitySelect
                  value={lokasi}
                  onChange={(val) => setLokasi(val)}
                  placeholder="Pilih Kota / Kabupaten..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Email Akun UMKM
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@umkm.id"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Konsistensi Pencatatan (Hari)
                </label>
                <input
                  type="number"
                  min="1"
                  value={konsistensiDays}
                  onChange={(e) => setKonsistensiDays(Number(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                />
              </div>
            </div>

            {/* Score Override Section */}
            <div className="bg-[#f8faff] rounded-2xl p-5 border border-[#dbe4ff] space-y-4">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-[#001b85]" />
                <h3 className="font-bold text-[#141a34] text-sm font-headline">
                  Penyesuaian Score Kesiapan (Readiness Score)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Skor Kesiapan KUR (0 - 100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={score}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setScore(val);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#bac3ff] text-sm font-bold text-[#001b85] focus:outline-none bg-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Alasan Override Skor (Tercatat di Audit Log)
                  </label>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Contoh: Dokumen agunan & bukti omset lengkap"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push("/admin/umkm")}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-xs hover:bg-[#0e32c2] transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Save size={14} />
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
