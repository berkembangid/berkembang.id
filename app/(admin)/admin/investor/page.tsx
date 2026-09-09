"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Briefcase,
  Plus,
  Search,
  RefreshCw,
  Edit,
  Trash2,
  MapPin,
  Mail,
  Phone,
  User,
  Building,
} from "lucide-react";
import Modal from "@/components/Modal";
import CitySelect from "@/components/CitySelect";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";

interface Investor {
  id: string;
  name: string;
  pic: string;
  type: string;
  email: string;
  phone: string;
  location: string;
  status: string;
  createdAt: string;
}

export default function AdminInvestorPage() {
  const { confirm } = useConfirm();
  const [investorList, setInvestorList] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states for new Investor / Offtaker
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Investor Modal Ventura");
  const [newPic, setNewPic] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocation, setNewLocation] = useState("Jakarta");

  useEffect(() => {
    fetchInvestors();
  }, []);

  async function fetchInvestors() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/investors");
      if (res.ok) {
        const json = await res.json();
        setInvestorList(json.items || []);
      } else {
        notifyFromError(new Error("Gagal memuat data investor"), "Gagal memuat data investor");
      }
    } catch (err) {
      console.warn("Error fetching investors:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);

    try {
      const res = await fetch("/api/admin/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          pic: newPic.trim() || undefined,
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          location: newLocation.trim() || "Indonesia",
          status: "active",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Gagal menambahkan investor");
      }

      notifySuccess(`Data ${newName.trim()} berhasil ditambahkan`);
      setShowModal(false);
      setNewName("");
      setNewPic("");
      setNewEmail("");
      setNewPhone("");
      fetchInvestors();
    } catch (err) {
      console.error("Error adding investor:", err);
      notifyFromError(err, "Gagal menambahkan investor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (investor: Investor) => {
    const yes = await confirm({
      title: `Hapus ${investor.name}?`,
      description: "Data akan dinonaktifkan dari daftar aktif mitra investor / offtaker.",
      confirmLabel: "Hapus",
      cancelLabel: "Batal",
      tone: "danger",
    });
    if (!yes) return;

    try {
      const res = await fetch(`/api/admin/investors/${encodeURIComponent(investor.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus");

      setInvestorList((prev) => prev.filter((i) => i.id !== investor.id));
      notifySuccess(`${investor.name} berhasil dihapus dari daftar`);
    } catch (err) {
      notifyFromError(err, "Gagal menghapus data");
    }
  };

  const filtered = investorList.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.pic.toLowerCase().includes(search.toLowerCase()) ||
      i.type.toLowerCase().includes(search.toLowerCase()) ||
      i.location.toLowerCase().includes(search.toLowerCase()) ||
      i.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#1b2a3a]">
            Data Investor & Offtaker
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Mitra pendanaan modal, angel investor, dan offtaker penyerapan komoditas UMKM
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchInvestors}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#0b5f86] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0f73a3] transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus size={16} />
            Tambah Investor / Offtaker
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
              placeholder="Cari nama perusahaan, PIC, tipe kemitraan, atau lokasi..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200/80 text-sm focus:border-[#0b5f86] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f3f2ff] border-b border-[#e3e9f0]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#4a6280] uppercase tracking-wide">
                  Perusahaan / Investor
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#4a6280] uppercase tracking-wide">
                  Kontak / PIC
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#4a6280] uppercase tracking-wide">
                  Jenis Mitra
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#4a6280] uppercase tracking-wide">
                  Lokasi
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#4a6280] uppercase tracking-wide">
                  Email / Kontak
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#4a6280] uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-[#4a6280] uppercase tracking-wide">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-slate-400 font-medium">
                    Memuat data investor & offtaker...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-slate-400 font-medium">
                    Belum ada data investor atau offtaker terdaftar.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-[#f3f2ff] hover:bg-[#f5fbf8] transition-colors"
                  >
                    <td className="px-4 py-3 font-bold text-[#1b2a3a]">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-lg bg-[#eef8fd] text-[#0b5f86] grid place-items-center shrink-0">
                          <Briefcase size={14} />
                        </div>
                        <span>{inv.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#4a6280] font-medium">{inv.pic}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#f0fdf4] text-emerald-700 border border-emerald-200">
                        {inv.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#4a6280] text-xs">{inv.location}</td>
                    <td className="px-4 py-3 text-[#4a6280] text-xs">{inv.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          inv.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {inv.status === "active" ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/investor/${encodeURIComponent(inv.id)}`}
                          className="text-[11px] font-bold text-[#0b5f86] border border-[#bac3ff] px-3 py-1 rounded-lg hover:bg-[#eef8fd] transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Edit size={11} />
                          Detail / Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(inv)}
                          className="text-[11px] font-bold text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Hapus / Nonaktifkan"
                        >
                          <Trash2 size={11} />
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Investor Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Tambah Investor / Offtaker"
        subtitle="Daftarkan mitra modal atau penyerapan komoditas baru"
        icon={<Briefcase size={22} />}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddInvestor} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Nama Perusahaan / Investor *
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Contoh: PT Agraria Nusantara Capital"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Jenis Mitra *</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              >
                <option value="Investor Modal Ventura">Modal Ventura (VC)</option>
                <option value="Offtaker / Pembeli Komoditas">Offtaker / Pembeli</option>
                <option value="Angel Investor">Angel Investor</option>
                <option value="Impact Fund">Impact Fund</option>
                <option value="Korporasi / Ritel">Korporasi / Ritel</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Lokasi Kota</label>
              <CitySelect
                value={newLocation}
                onChange={(val) => setNewLocation(val)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Nama PIC / Kontak Person
            </label>
            <input
              type="text"
              value={newPic}
              onChange={(e) => setNewPic(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Email Kontak</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="investor@perusahaan.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">No. WhatsApp</label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="08123456789"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              />
            </div>
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
              className="flex-1 py-2.5 rounded-xl bg-[#0b5f86] text-white font-bold text-xs hover:bg-[#0f73a3] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {saving ? "Menyimpan..." : "Simpan Investor"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
