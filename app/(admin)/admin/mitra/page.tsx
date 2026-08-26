"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Handshake, Plus, Edit, Users, MapPin, Trash2, X, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { runAdminOperation } from "@/modules/admin/operations";

interface Mitra {
  id: string;
  name: string;
  type: string;
  coverage: string;
  umkmManaged: number;
  active: boolean;
}

export default function AdminMitraPage() {
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMitra, setEditingMitra] = useState<Mitra | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [mitraName, setMitraName] = useState("");
  const [mitraType, setMitraType] = useState("LSM");
  const [mitraCoverage, setMitraCoverage] = useState("Nasional");
  const [mitraUmkmCount, setMitraUmkmCount] = useState("50");

  useEffect(() => {
    fetchMitra();
  }, []);

  async function fetchMitra() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mitra")
        .select("*")
        .order("id", { ascending: true });

      if (!error && data) {
        const mapped: Mitra[] = data.map((item: Record<string, unknown>) => ({
          id: String(item.id),
          name: String(item.name ?? "Mitra"),
          type: String(item.type ?? "LSM"),
          coverage: String(item.coverage ?? "Nasional"),
          umkmManaged: Number(item.umkm_managed) || 0,
          active: Boolean(item.active),
        }));
        setMitraList(mapped);
      }
    } catch (err) {
      console.warn("Failed to fetch mitra:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await runAdminOperation({ action: "delete_mitra", id });
      setMitraList(mitraList.filter(m => m.id !== id));
    } catch (err) {
      console.error("Error deleting mitra:", err);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mitraName) return;
    setSaving(true);

    const umkmCountNum = Number(mitraUmkmCount) || 0;

    try {
      if (editingMitra) {
        await runAdminOperation({
          action: "save_mitra",
          id: editingMitra.id,
          name: mitraName,
          type: mitraType,
          coverage: mitraCoverage,
          umkmManaged: umkmCountNum,
          active: editingMitra.active,
        });

        setMitraList(mitraList.map(m => m.id === editingMitra.id ? { ...m, name: mitraName, type: mitraType, coverage: mitraCoverage, umkmManaged: umkmCountNum } : m));
      } else {
        const result = await runAdminOperation({
          action: "save_mitra",
          name: mitraName,
          type: mitraType,
          coverage: mitraCoverage,
          umkmManaged: umkmCountNum,
          active: true,
        });
        if (!result.id) throw new Error("Mitra belum tersimpan.");

        const newObj: Mitra = {
          id: result.id,
          name: mitraName,
          type: mitraType,
          coverage: mitraCoverage,
          umkmManaged: umkmCountNum,
          active: true
        };
        setMitraList([...mitraList, newObj]);
      }

      setShowModal(false);
      setEditingMitra(null);
      setMitraName("");
    } catch (err) {
      console.error("Error saving mitra:", err);
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = () => {
    setEditingMitra(null);
    setMitraName("");
    setMitraType("LSM");
    setMitraCoverage("Nasional");
    setMitraUmkmCount("50");
    setShowModal(true);
  };

  const openEditModal = (m: Mitra) => {
    setEditingMitra(m);
    setMitraName(m.name);
    setMitraType(m.type);
    setMitraCoverage(m.coverage);
    setMitraUmkmCount(m.umkmManaged.toString());
    setShowModal(true);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Mitra Komunitas</h1>
          <p className="text-sm text-slate-500 mt-1">Pendamping, LSM, dan komunitas penggerak UMKM mikro daerah</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchMitra}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={openAddModal}
            className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus size={16} />
            Tambah Mitra
          </button>
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Memuat data mitra...
        </div>
      ) : mitraList.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
          Belum ada data mitra terdaftar. Klik &quot;Tambah Mitra&quot; untuk menambahkan.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {mitraList.map((m) => (
            <div key={m.id} className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Handshake size={24} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-[#141a34] text-base truncate">{m.name}</h3>
                    <span className="text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {m.type}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-slate-500 mt-3 font-medium flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400" />
                      {m.coverage}
                    </span>
                    <span className="flex items-center gap-1 text-[#001b85]">
                      <Users size={12} className="text-[#001b85]/70" />
                      {m.umkmManaged} UMKM Dampingan
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 justify-end">
                <Link
                  href={`/admin/mitra/${m.id}`}
                  className="text-xs font-bold text-[#001b85] border border-[#bac3ff] px-4 py-2 rounded-xl hover:bg-[#ececff] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit size={12} />
                  Detail / Edit
                </Link>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-xs font-bold text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Mitra Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingMitra ? "Edit Data Mitra" : "Tambah Mitra Baru"}
        subtitle="Pendamping dan komunitas penggerak UMKM"
        icon={<Handshake size={22} />}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveForm} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nama Organisasi / Komunitas *</label>
            <input
              type="text"
              required
              value={mitraName}
              onChange={(e) => setMitraName(e.target.value)}
              placeholder="Contoh: SMESCO Indonesia"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Tipe Organisasi</label>
              <select
                value={mitraType}
                onChange={(e) => setMitraType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
              >
                <option value="Pemerintah">Pemerintah / BUMD</option>
                <option value="LSM">LSM / Komunitas</option>
                <option value="NGO">NGO / NPO</option>
                <option value="Swasta">Corporate Social (CSR)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Cakupan Wilayah</label>
              <input
                type="text"
                value={mitraCoverage}
                onChange={(e) => setMitraCoverage(e.target.value)}
                placeholder="Nasional"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Jumlah UMKM Dampingan</label>
            <input
              type="number"
              min="0"
              value={mitraUmkmCount}
              onChange={(e) => setMitraUmkmCount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white font-medium"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-xs hover:bg-[#0e32c2] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {saving ? "Menyimpan..." : "Simpan Data Mitra"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
