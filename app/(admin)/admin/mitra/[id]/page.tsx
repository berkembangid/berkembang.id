"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Handshake, Save, Shield, ShieldAlert, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { runAdminOperation } from "@/modules/admin/operations";

export default function MitraDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState("LSM");
  const [coverage, setCoverage] = useState("Nasional");
  const [umkmManaged, setUmkmManaged] = useState("50");
  const [active, setActive] = useState(true);

  async function fetchDetail() {
    setLoading(true);
    setErrorMsg("");
    try {
      const { data, error } = await supabase
        .from("mitra")
        .select("*")
        .eq("id", idParam)
        .single();

      if (error || !data) {
        setErrorMsg("Data mitra tidak ditemukan di database.");
      } else {
        setName(data.name || "");
        setType(data.type || "LSM");
        setCoverage(data.coverage || "Nasional");
        setUmkmManaged(String(data.umkm_managed || 0));
        setActive(Boolean(data.active ?? true));
      }
    } catch (err: unknown) {
      console.error("Error fetching detail:", err);
      setErrorMsg("Gagal memuat detail data mitra.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (idParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote load
      void fetchDetail();
    }
  }, [idParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    const managedNum = Number(umkmManaged) || 0;

    try {
      await runAdminOperation({
        action: "save_mitra",
        id: idParam,
        name: name.trim(),
        type,
        coverage: coverage.trim(),
        umkmManaged: managedNum,
        active,
      });

      setSuccessMsg("Data mitra berhasil diperbarui!");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: unknown) {
      console.error("Error saving mitra:", err);
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl mx-auto">
      {/* Header & Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/admin/mitra")}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#001b85] transition-colors bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          Kembali ke Daftar Mitra
        </button>
        <span className="text-xs text-slate-400 font-mono">ID: {idParam}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Handshake size={28} />
          </div>
          <div>
            <h1 className="font-headline text-xl md:text-2xl font-extrabold text-[#141a34]">
              Detail & Edit Mitra Komunitas
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur cakupan wilayah, tipe mitra, dan jumlah UMKM binaan
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            Memuat data mitra dari database...
          </div>
        ) : errorMsg && !name ? (
          <div className="py-8 text-center text-xs text-red-500 font-medium">
            {errorMsg}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
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
                  Nama Organisasi / Komunitas *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: SMESCO Indonesia"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Tipe Organisasi *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                >
                  <option value="Pemerintah">Pemerintah / BUMD</option>
                  <option value="LSM">LSM / Komunitas</option>
                  <option value="NGO">NGO / NPO</option>
                  <option value="Swasta">Corporate Social (CSR)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Cakupan Wilayah Dampingan
                </label>
                <input
                  type="text"
                  value={coverage}
                  onChange={(e) => setCoverage(e.target.value)}
                  placeholder="Contoh: Nasional / Jawa Barat / Depok"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Jumlah UMKM Dampingan
                </label>
                <input
                  type="number"
                  min="0"
                  value={umkmManaged}
                  onChange={(e) => setUmkmManaged(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Status Keaktifan
                </label>
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                    active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {active ? <Shield size={14} /> : <ShieldAlert size={14} />}
                    {active ? "Mitra Aktif" : "Mitra Nonaktif"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider underline">Ubah</span>
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push("/admin/mitra")}
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
