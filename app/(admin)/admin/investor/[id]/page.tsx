"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Briefcase, ArrowLeft, Save, Building, Mail, Phone, User, MapPin } from "lucide-react";
import CitySelect from "@/components/CitySelect";
import { notifyFromError, notifySuccess } from "@/lib/notify";

export default function InvestorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState("Investor Modal Ventura");
  const [pic, setPic] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("Jakarta");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  useEffect(() => {
    if (idParam) {
      fetchDetail();
    }
  }, [idParam]);

  async function fetchDetail() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/investors/${encodeURIComponent(idParam)}`);
      if (!res.ok) throw new Error("Gagal memuat detail investor");
      const data = await res.json();
      setName(data.name || "");
      setType(data.type || "Investor Modal Ventura");
      setPic(data.pic || "");
      setEmail(data.email || "");
      setPhone(data.phone || "");
      setLocation(data.location || "Jakarta");
      setStatus(data.status === "active" ? "active" : "inactive");
    } catch (err) {
      notifyFromError(err, "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/investors/${encodeURIComponent(idParam)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          pic: pic.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          location: location.trim() || "Indonesia",
          status,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Gagal menyimpan perubahan");
      }

      notifySuccess("Data investor berhasil diperbarui");
      router.push("/admin/investor");
    } catch (err) {
      notifyFromError(err, "Gagal memperbarui");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-slate-200/60 text-center text-xs text-slate-400 font-medium">
        Memuat detail investor...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/investor")}
          className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          title="Kembali ke daftar"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-headline text-2xl font-bold text-[#1b2a3a]">
            Detail Investor / Offtaker
          </h1>
          <p className="text-xs text-slate-500">Edit informasi profil mitra dan status keaktifan</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Nama Perusahaan / Lembaga Investor *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama perusahaan"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
                <Building size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Jenis Mitra *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
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
              <label className="block text-xs font-bold text-slate-600 mb-1">Status Keaktifan</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nama PIC / Kontak</label>
              <div className="relative">
                <input
                  type="text"
                  value={pic}
                  onChange={(e) => setPic(e.target.value)}
                  placeholder="Nama kontak person"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Lokasi Kota</label>
              <CitySelect
                value={location}
                onChange={(val) => setLocation(val)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Email Kontak</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@perusahaan.com"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">No. WhatsApp</label>
              <div className="relative">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08123456789"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => router.push("/admin/investor")}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#0b5f86] text-white font-bold text-xs hover:bg-[#0f73a3] transition-colors flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
