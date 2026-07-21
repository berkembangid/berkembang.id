"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  Trophy,
  Building2,
  TrendingUp,
  Flame,
  User,
  X,
  ChevronDown,
  ChevronUp,
  ArrowUpRight
} from "lucide-react";

// Premium Activities list with detailed properties for interactive expansion
const ACTIVITIES = [
  {
    id: "act-1",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-100",
    title: "Catatan tersimpan: Ayam geprek 47 porsi",
    time: "2 jam lalu",
    type: "transaction_recorded",
    description: "Transaksi penjualan tercatat otomatis menggunakan fitur suara. Pemasukan bertambah Rp705.000.",
    details: {
      item: "Ayam Geprek",
      qty: "47 porsi",
      nominal: "Rp705.000",
      kategori: "Penjualan",
      metode: "Suara (AI Voice)"
    },
    actionText: "Lihat Transaksi",
    actionLink: "/umkm/riwayat"
  },
  {
    id: "act-2",
    icon: Trophy,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-100",
    title: "Level naik! Anda sekarang Level 2: Urus NIB",
    time: "Kemarin",
    type: "level_up",
    description: "Selamat! Anda naik ke Level 2. Langkah selanjutnya adalah melengkapi NIB (Nomor Induk Berusaha) untuk membuka akses pendanaan.",
    details: {
      level: "Level 2 (Urus NIB)",
      reward: "Akses ke Penawaran Mitra Kredit",
      progress: "33% selesai"
    },
    actionText: "Lengkapi NIB Sekarang",
    actionLink: "/umkm/profil"
  },
  {
    id: "act-3",
    icon: Building2,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-100",
    title: "Ada institusi yang tertarik melihat profil Anda",
    time: "3 hari lalu",
    type: "dossier_requested",
    description: "Bank Syariah Indonesia (BSI) sedang meninjau Kesiapan Kredit (Readiness Score) toko Anda untuk program bantuan modal kerja.",
    details: {
      institusi: "Bank Syariah Indonesia (BSI)",
      program: "Bantuan Modal Kerja UMKM",
      status: "Menunggu Berkas Tambahan"
    },
    actionText: "Kelola Akses Berkas",
    actionLink: "/umkm/profil"
  },
  {
    id: "act-4",
    icon: TrendingUp,
    color: "text-emerald-700",
    bg: "bg-emerald-50/50 border-emerald-100/50",
    title: "Readiness Score naik dari 45 ke 58",
    time: "5 hari lalu",
    type: "readiness_increased",
    description: "Skor kesiapan pendanaan Anda meningkat signifikan setelah melengkapi riwayat transaksi 5 hari berturut-turut.",
    details: {
      sebelum: "45 / 100",
      sesudah: "58 / 100",
      kategori: "Kolektivitas & Disiplin Pencatatan"
    },
    actionText: "Analisis Skor Kesiapan",
    actionLink: "/umkm/journey"
  },
  {
    id: "act-5",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-100",
    title: "Catatan tersimpan: Nasi goreng spesial",
    time: "6 hari lalu",
    type: "transaction_recorded",
    description: "Transaksi penjualan manual disimpan.",
    details: {
      item: "Nasi Goreng Spesial",
      qty: "12 porsi",
      nominal: "Rp180.000",
      kategori: "Penjualan",
      metode: "Input Manual"
    },
    actionText: "Lihat Transaksi",
    actionLink: "/umkm/riwayat"
  },
  {
    id: "act-6",
    icon: Flame,
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-100",
    title: "Streak 7 hari! Badge diperoleh 🎉",
    time: "1 minggu lalu",
    type: "streak_milestone",
    description: "Luar biasa! Anda mencatat transaksi berturut-turut selama 7 hari tanpa terputus. Badge 'Pencatat Setia' ditambahkan ke profil.",
    details: {
      streak: "7 Hari Aktif",
      badge: "Pencatat Setia",
      bonus: "+15 Kesiapan Pendanaan"
    },
    actionText: "Lihat Pencapaian",
    actionLink: "/umkm/journey"
  },
  {
    id: "act-7",
    icon: User,
    color: "text-indigo-600",
    bg: "bg-indigo-50 border-indigo-100",
    title: "Profil diperbarui: Foto usaha ditambahkan",
    time: "1 minggu lalu",
    type: "profile_updated",
    description: "Foto kios usaha berhasil diunggah. Foto usaha yang jelas meningkatkan kredibilitas Anda di mata mitra perbankan.",
    details: {
      file: "kios_sari_utama.jpg",
      kategori: "Profil Fisik Usaha",
      verifikasi: "Terverifikasi Sistem"
    },
    actionText: "Lihat Profil",
    actionLink: "/umkm/profil"
  }
];

const TYPE_LABELS: Record<string, string> = {
  transaction_recorded: "Catatan",
  level_up: "Level",
  dossier_requested: "Institusi",
  readiness_increased: "Readiness",
  streak_milestone: "Streak",
  profile_updated: "Profil",
};

const FILTER_TO_TYPE_MAP: Record<string, string> = {
  "Catatan": "transaction_recorded",
  "Level": "level_up",
  "Institusi": "dossier_requested",
  "Readiness": "readiness_increased",
  "Streak": "streak_milestone",
  "Profil": "profile_updated",
};

const DETAIL_KEY_LABELS: Record<string, string> = {
  item: "Barang / Jasa",
  qty: "Kuantitas",
  nominal: "Nominal",
  kategori: "Kategori",
  metode: "Metode Input",
  level: "Tingkat Baru",
  reward: "Hadiah Level",
  progress: "Kelengkapan",
  institusi: "Nama Lembaga",
  program: "Program",
  status: "Status Berkas",
  sebelum: "Skor Awal",
  sesudah: "Skor Baru",
  streak: "Jumlah Hari",
  badge: "Lencana",
  bonus: "Poin Tambahan",
  file: "Nama Berkas",
  verifikasi: "Verifikasi"
};

export default function AktivitasPage() {
  const [selectedFilter, setSelectedFilter] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedActId, setExpandedActId] = useState<string | null>(null);

  // Memoized search and filter logic
  const filteredActivities = useMemo(() => {
    return ACTIVITIES.filter((act) => {
      // 1. Filter by category badge
      if (selectedFilter !== "Semua") {
        const targetType = FILTER_TO_TYPE_MAP[selectedFilter];
        if (act.type !== targetType) return false;
      }

      // 2. Filter by search query
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesTitle = act.title.toLowerCase().includes(query);
        const matchesDesc = act.description.toLowerCase().includes(query);
        const matchesDetails = Object.values(act.details).some((val) =>
          val.toLowerCase().includes(query)
        );
        return matchesTitle || matchesDesc || matchesDetails;
      }

      return true;
    });
  }, [selectedFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#fbf8ff]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-5 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30 shadow-sm">
        <Link href="/umkm" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#ececff] transition-colors">
          <ArrowLeft size={20} className="text-[#444655]" />
        </Link>
        <h1 className="font-headline text-base font-bold text-[#141a34]">Aktivitas & Riwayat</h1>
        <div className="w-10" />
      </header>

      {/* Mini Stats Summary */}
      <div className="px-5 pt-4 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3 border border-[#e5e7ff] shadow-card flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-400 uppercase font-mono-label">Total Riwayat</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-[#001b85]">{filteredActivities.length}</span>
            <span className="text-[10px] text-slate-400">item</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-[#e5e7ff] shadow-card flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-400 uppercase font-mono-label">Streak</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-[#006a6a]">5</span>
            <span className="text-[10px] text-slate-400">hari 🔥</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-[#e5e7ff] shadow-card flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-400 uppercase font-mono-label">Readiness</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-emerald-600">58</span>
            <span className="text-[10px] text-slate-400">/100</span>
          </div>
        </div>
      </div>

      {/* Search Input Box */}
      <div className="px-5 pt-4 pb-1">
        <div className="relative flex items-center bg-white border border-[#e5e7ff] focus-within:border-[#001b85] rounded-xl px-3.5 py-2.5 transition-all shadow-sm">
          <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setExpandedActId(null);
            }}
            placeholder="Cari aktivitas atau transaksi..."
            className="w-full bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-slate-400 hover:text-[#001b85] transition-colors p-0.5 rounded-full hover:bg-slate-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Filter Scroll */}
      <div className="px-5 py-3 flex gap-2 overflow-x-auto hide-scrollbar">
        {["Semua", "Catatan", "Level", "Readiness", "Streak", "Institusi", "Profil"].map((f) => {
          const isActive = selectedFilter === f;
          return (
            <button
              key={f}
              onClick={() => {
                setSelectedFilter(f);
                setExpandedActId(null);
              }}
              className={`flex-shrink-0 text-xs font-semibold px-4.5 py-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-[#001b85] text-white shadow-sm border border-[#001b85]"
                  : "bg-white border border-[#e5e7ff] text-[#444655] hover:bg-[#ececff]/50 hover:text-[#001b85] hover:border-[#001b85]"
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Main Timeline Content */}
      <main className="px-5 py-3 relative pb-20">
        {filteredActivities.length > 0 ? (
          <div className="relative">
            {/* Timeline Vertical Connector Track Line */}
            <div className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-[#334ed9] via-[#001b85]/30 to-slate-200" />

            <div className="space-y-4">
              {filteredActivities.map((act, i) => {
                const isExpanded = expandedActId === act.id;
                return (
                  <div
                    key={act.id}
                    className="relative flex gap-4 pl-11 animate-fade-in-up"
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    {/* Circle Node Icon */}
                    <div className={`absolute left-0.5 top-1.5 z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border transition-transform duration-300 ${act.bg}`}>
                      <act.icon size={15} className={act.color} />
                    </div>

                    {/* Interactive Activity Card Box */}
                    <div
                      onClick={() => setExpandedActId(isExpanded ? null : act.id)}
                      className={`flex-1 bg-white rounded-2xl p-4 border shadow-card hover:shadow-card-md hover:border-[#001b85] transition-all duration-200 cursor-pointer select-none ${
                        isExpanded ? "border-[#001b85] ring-1 ring-[#001b85]/10" : "border-[#e5e7ff]"
                      }`}
                    >
                      {/* Meta information row */}
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[9px] bg-[#ececff] text-[#001b85] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono-label">
                          {TYPE_LABELS[act.type]}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{act.time}</span>
                      </div>

                      {/* Event Title */}
                      <h3 className="text-xs font-bold text-[#141a34] mt-1.5 leading-snug">
                        {act.title}
                      </h3>

                      {/* Snippet summary (hidden when expanded) */}
                      {!isExpanded && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                          {act.description}
                        </p>
                      )}

                      {/* Detailed Information (visible when expanded) */}
                      {isExpanded && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 animate-fade-in space-y-3">
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            {act.description}
                          </p>

                          {/* Data Details Key Value Table */}
                          <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                            {Object.entries(act.details).map(([key, val]) => (
                              <div key={key} className="flex flex-col">
                                <span className="text-slate-400 font-semibold">{DETAIL_KEY_LABELS[key] || key}</span>
                                <span className="font-bold text-slate-700 mt-0.5">{val}</span>
                              </div>
                            ))}
                          </div>

                          {/* Action Button Link */}
                          {act.actionText && (
                            <div className="flex justify-end pt-1">
                              <Link
                                href={act.actionLink}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 bg-[#001b85] hover:bg-[#0e32c2] text-white text-[10px] font-bold px-3.5 py-2 rounded-xl shadow-sm transition-all uppercase tracking-wider"
                              >
                                <span>{act.actionText}</span>
                                <ArrowUpRight size={11} strokeWidth={2.5} />
                              </Link>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Small Bottom Toggle Indicator */}
                      <div className="flex justify-center mt-2 -mb-2">
                        <div className="text-slate-300 hover:text-slate-500 transition-colors">
                          {isExpanded ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Empty State Illustration */
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-card flex flex-col items-center justify-center animate-fade-in my-6">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3 border border-slate-100">
              <Search size={18} />
            </div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-headline">Aktivitas Tidak Ditemukan</h3>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[200px] leading-relaxed">
              Tidak ada riwayat aktivitas yang cocok dengan pencarian atau filter Anda.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedFilter("Semua");
              }}
              className="mt-4 text-[10px] font-bold text-[#001b85] hover:text-[#0e32c2] uppercase tracking-wider border border-[#001b85] px-3.5 py-1.5 rounded-xl hover:bg-[#ececff]/50 transition-colors cursor-pointer"
            >
              Reset Pencarian
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
