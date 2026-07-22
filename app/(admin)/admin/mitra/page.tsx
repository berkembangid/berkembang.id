"use client";

import { useState, useEffect } from "react";
import { Handshake, Plus, Edit, Users, MapPin, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Mitra {
  id: number;
  name: string;
  type: string;
  coverage: string;
  umkmManaged: number;
  active: boolean;
}

const DEFAULT_MITRA: Mitra[] = [
  { id: 1, name: "SMESCO Indonesia", type: "Pemerintah", coverage: "Nasional", umkmManaged: 234, active: true },
  { id: 2, name: "Komunitas UMKM Jaya", type: "LSM", coverage: "Jakarta", umkmManaged: 87, active: true },
  { id: 3, name: "GoUMKM Foundation", type: "NGO", coverage: "Multi-Kota", umkmManaged: 156, active: true },
];

export default function AdminMitraPage() {
  const [mitraList, setMitraList] = useState<Mitra[]>(DEFAULT_MITRA);
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
    try {
      const { data, error } = await supabase
        .from("mitra")
        .select("*")
        .order("id", { ascending: true });

      if (!error && data && data.length > 0) {
        const mapped: Mitra[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          coverage: item.coverage,
          umkmManaged: Number(item.umkm_managed) || 0,
          active: Boolean(item.active),
        }));
        setMitraList(mapped);
      }
    } catch (err) {
      console.warn("Failed to fetch mitra from Supabase:", err);
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await supabase.from("mitra").delete().eq("id", id);
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
        await supabase
          .from("mitra")
          .update({
            name: mitraName,
            type: mitraType,
            coverage: mitraCoverage,
            umkm_managed: umkmCountNum
          })
          .eq("id", editingMitra.id);

        setMitraList(mitraList.map(m => m.id === editingMitra.id ? { ...m, name: mitraName, type: mitraType, coverage: mitraCoverage, umkmManaged: umkmCountNum } : m));
      } else {
        const { data } = await supabase
          .from("mitra")
          .insert({
            name: mitraName,
            type: mitraType,
            coverage: mitraCoverage,
            umkm_managed: umkmCountNum,
            active: true
          })
          .select()
          .single();

        const newObj: Mitra = {
          id: data?.id || Date.now(),
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
        <button
          onClick={openAddModal}
          className="bg-[#001b85] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0e32c2] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Plus size={16} />
          Tambah Mitra
        </button>
      </div>

      {/* Grid List */}
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
              <button
                onClick={() => openEditModal(m)}
                className="text-xs font-bold text-[#001b85] border border-[#bac3ff] px-4 py-2 rounded-xl hover:bg-[#ececff] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit size={12} />
                Edit
              </button>
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

      {/* Add / Edit Mitra Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#141a34] text-base font-headline">
                {editingMitra ? "Edit Data Mitra" : "Tambah Mitra Baru"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveForm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Nama Organisasi / Komunitas</label>
                <input
                  type="text"
                  required
                  value={mitraName}
                  onChange={(e) => setMitraName(e.target.value)}
                  placeholder="Contoh: SMESCO Indonesia"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Tipe Organisasi</label>
                  <select
                    value={mitraType}
                    onChange={(e) => setMitraType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none bg-white"
                  >
                    <option value="Pemerintah">Pemerintah / BUMD</option>
                    <option value="LSM">LSM / Komunitas</option>
                    <option value="NGO">NGO / NPO</option>
                    <option value="Swasta">Corporate Social (CSR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Cakupan Wilayah</label>
                  <input
                    type="text"
                    value={mitraCoverage}
                    onChange={(e) => setMitraCoverage(e.target.value)}
                    placeholder="Nasional"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Jumlah UMKM Dampingan</label>
                <input
                  type="number"
                  min="0"
                  value={mitraUmkmCount}
                  onChange={(e) => setMitraUmkmCount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs focus:border-[#001b85] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#c5c5d7] text-[#444655] font-semibold text-xs hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#001b85] text-white font-bold text-xs hover:bg-[#0e32c2] transition-colors disabled:opacity-50 shadow-sm"
                >
                  {saving ? "Menyimpan..." : "Simpan Data Mitra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
