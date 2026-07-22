"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Check, X, ShieldAlert, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface UMKMProfile {
  id: string;
  name: string;      // Owner name
  usaha: string;     // Business name (Nama Usaha)
  sektor: string;
  lokasi: string;
  score: number;
  konsistensi: number;
  status: string;
}

function scoreColor(s: number) {
  if (s < 50) return "text-red-600 bg-red-50 border-red-200";
  if (s < 70) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (s < 85) return "text-green-600 bg-green-50 border-green-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-300";
}

export default function AdminUMKMPage() {
  const [umkmList, setUmkmList] = useState<UMKMProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editScore, setEditScore] = useState<{ id: string; score: number; oldScore: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states for new UMKM
  const [newName, setNewName] = useState("");
  const [newUsaha, setNewUsaha] = useState("");
  const [newSektor, setNewSektor] = useState("Kuliner");
  const [newLokasi, setNewLokasi] = useState("Depok");
  const [newScore, setNewScore] = useState("50");

  useEffect(() => {
    fetchUMKMFromSupabase();
  }, []);

  async function fetchUMKMFromSupabase() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching profiles:", error.message);
      }

      if (data && data.length > 0) {
        // Filter profiles that have a nama_usaha OR role 'umkm' OR null role
        const umkmRows = data.filter((p: any) => p.role === "umkm" || p.nama_usaha || !p.role);

        const now = new Date();
        const mapped: UMKMProfile[] = umkmRows.map((p: any, idx: number) => {
          const createdDate = p.created_at ? new Date(p.created_at) : now;
          const ageDays = Math.max(1, Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));
          const konsistensiVal = Number(p.konsistensi_days) > 0 ? Number(p.konsistensi_days) : ageDays;

          const businessName = p.nama_usaha || p.name || `Usaha UMKM #${idx + 1}`;
          const ownerName = p.name && p.name !== businessName ? p.name : (p.email ? p.email.split("@")[0] : "Pemilik Usaha");

          return {
            id: p.id || String(idx + 1),
            name: ownerName,
            usaha: businessName,
            sektor: p.sektor_usaha || "Kuliner",
            lokasi: p.lokasi || "Depok",
            score: Number(p.readiness_score) || 50,
            konsistensi: konsistensiVal,
            status: p.status || "active"
          };
        });
        setUmkmList(mapped);
      } else {
        setUmkmList([]);
      }
    } catch (err) {
      console.warn("Failed to fetch UMKM profiles:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleSaveOverrideScore = async () => {
    if (!editScore) return;
    setSaving(true);

    const { id, score, oldScore } = editScore;
    const reasonText = overrideReason.trim() || "Penyesuaian manual oleh admin";

    try {
      // 1. Update profiles table
      await supabase
        .from("profiles")
        .update({ readiness_score: score })
        .eq("id", id);

      // 2. Insert into audit_logs table
      await supabase.from("audit_logs").insert({
        user_email: "admin@berkembang.id",
        action: "OVERRIDE_SCORE",
        details: `UMKM ID #${id}, skor: ${oldScore}->${score}, alasan: ${reasonText}`,
        status: "success",
      });

      // Local state update
      setUmkmList(umkmList.map((u) => (u.id === id ? { ...u, score } : u)));
    } catch (err) {
      console.error("Error saving score override:", err);
    } finally {
      setSaving(false);
      setEditScore(null);
      setOverrideReason("");
    }
  };

  const handleAddUMKM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newUsaha) return;
    setSaving(true);

    const scoreNum = Number(newScore) || 50;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          name: newName,
          nama_usaha: newUsaha,
          sektor_usaha: newSektor,
          lokasi: newLokasi,
          readiness_score: scoreNum,
          konsistensi_days: 1,
          role: "umkm",
          status: "active"
        })
        .select()
        .single();

      const newEntry: UMKMProfile = {
        id: data?.id || String(Date.now()),
        name: newName,
        usaha: newUsaha,
        sektor: newSektor,
        lokasi: newLokasi,
        score: scoreNum,
        konsistensi: 1,
        status: "active"
      };

      // Also log to audit logs
      await supabase.from("audit_logs").insert({
        user_email: "admin@berkembang.id",
        action: "CREATE_UMKM",
        details: `Pendaftaran UMKM Baru: ${newUsaha} (${newName})`,
        status: "success",
      });

      setUmkmList([newEntry, ...umkmList]);
      setShowAddModal(false);
      setNewName("");
      setNewUsaha("");
    } catch (err) {
      console.error("Error adding UMKM:", err);
    } finally {
      setSaving(false);
    }
  };

  const filtered = umkmList.filter(
    (u) =>
      u.usaha.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.sektor.toLowerCase().includes(search.toLowerCase()) ||
      u.lokasi.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Manajemen UMKM</h1>
          <p className="text-sm text-slate-500 mt-1">Data lengkap dan override skor kesiapan bagi seluruh ekosistem UMKM</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUMKMFromSupabase}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus size={16} />
            Tambah UMKM
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-200/60">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama usaha, pemilik, atau sektor..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200/80 text-sm focus:border-[#001b85] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f3f2ff] border-b border-[#e5e7ff]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Nama Usaha</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Pemilik (Owner)</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Sektor</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Lokasi</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Score</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Konsistensi</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#444655] uppercase tracking-wide">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-xs text-slate-400 font-medium">
                    Memuat data UMKM...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-xs text-slate-400 font-medium">
                    Belum ada data UMKM terdaftar.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const sc = scoreColor(u.score);
                  return (
                    <tr key={u.id} className="border-t border-[#f3f2ff] hover:bg-[#fbf8ff] transition-colors">
                      <td className="px-4 py-3 font-bold text-[#141a34]">{u.usaha}</td>
                      <td className="px-4 py-3 text-[#444655] font-medium">{u.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#ececff] text-[#001b85]">{u.sektor}</span>
                      </td>
                      <td className="px-4 py-3 text-[#444655] text-xs">{u.lokasi}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${sc}`}>{u.score}</span>
                      </td>
                      <td className="px-4 py-3 text-[#444655]">{u.konsistensi} hari</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          u.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {u.status === "active" ? "Aktif" : "Tidak Aktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setEditScore({ id: u.id, score: u.score, oldScore: u.score })}
                            className="text-[11px] font-bold text-[#001b85] border border-[#bac3ff] px-2.5 py-1 rounded-lg hover:bg-[#ececff] transition-colors cursor-pointer"
                          >
                            Edit Score
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Score Override Modal */}
      {editScore && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 animate-fade-in-up">
            <h3 className="font-bold text-[#141a34] text-base font-headline">Override Readiness Score</h3>
            <p className="text-xs text-[#444655] mt-1 mb-4">Perubahan akan langsung disimpan dan dicatat di Audit Log.</p>
            <label className="block text-xs font-bold text-slate-500 mb-1">Skor Kesiapan Baru (0-100)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={editScore.score}
              onChange={(e) => setEditScore({ ...editScore, score: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-sm font-bold text-[#001b85] focus:border-[#001b85] focus:outline-none mb-3"
            />
            <label className="block text-xs font-bold text-slate-500 mb-1">Alasan Override (Wajib)</label>
            <textarea
              rows={2}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Contoh: Hasil verifikasi berkas legalitas NIB fisik lulus."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none mb-4 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditScore(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#c5c5d7] text-[#444655] font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveOverrideScore}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-xs hover:bg-[#0e32c2] transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {saving ? "Menyimpan..." : "Simpan Override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New UMKM Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#141a34] text-base font-headline">Tambah Data UMKM Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddUMKM} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Nama Usaha</label>
                <input
                  type="text"
                  required
                  value={newUsaha}
                  onChange={(e) => setNewUsaha(e.target.value)}
                  placeholder="Contoh: Warung Nasi Goreng Pak Pur"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Nama Pemilik / Owner</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Pak Pur"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Sektor Usaha</label>
                  <select
                    value={newSektor}
                    onChange={(e) => setNewSektor(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none bg-white"
                  >
                    <option value="Kuliner">Kuliner</option>
                    <option value="Fashion">Fashion</option>
                    <option value="Pertanian">Pertanian</option>
                    <option value="Kerajinan">Kerajinan</option>
                    <option value="Jasa">Jasa & Perdagangan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Lokasi Kota</label>
                  <input
                    type="text"
                    value={newLokasi}
                    onChange={(e) => setNewLokasi(e.target.value)}
                    placeholder="Depok"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Skor Kesiapan Awal (0-100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newScore}
                  onChange={(e) => setNewScore(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs font-bold text-[#001b85] focus:border-[#001b85] focus:outline-none"
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#c5c5d7] text-[#444655] font-semibold text-xs hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-xs hover:bg-[#0e32c2] transition-colors disabled:opacity-50 shadow-sm"
                >
                  {saving ? "Menyimpan..." : "Simpan Data UMKM"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
