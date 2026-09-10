"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, Store, Save, Award, Calendar, FileText, 
  ReceiptText, ShieldCheck, CheckCircle2, AlertCircle, 
  Clock, ExternalLink, Download, Sparkles, Building2, 
  TrendingUp, TrendingDown, ArrowUpRight, Check, Ban
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";
import { runAdminOperation } from "@/modules/admin/operations";
import { notifySuccess } from "@/lib/notify";

const UMKM_SECTORS = ["Kuliner", "Fashion", "Pertanian", "Jasa", "Kerajinan", "Teknologi", "Lainnya"];

type ReadinessLevel = "MULAI" | "TEMBAGA" | "PERAK" | "EMAS";

const TIER_META: Record<ReadinessLevel, { name: string; badge: string; border: string; bg: string; description: string }> = {
  MULAI: {
    name: "Mulai",
    badge: "bg-slate-100 text-slate-700 border-slate-300",
    border: "border-slate-200",
    bg: "bg-slate-50",
    description: "Catatan keuangan baru dimulai. Tingkat berikutnya terbuka setelah 14 hari konsisten mencatat transaksi.",
  },
  TEMBAGA: {
    name: "Tembaga",
    badge: "bg-amber-50 text-amber-800 border-amber-300",
    border: "border-amber-200",
    bg: "bg-amber-50/50",
    description: "Catatan transaksi sudah aktif. Tingkat berikutnya membuka ringkasan laporan 3 bulan siap cetak.",
  },
  PERAK: {
    name: "Perak",
    badge: "bg-slate-100 text-slate-900 border-slate-400",
    border: "border-slate-300",
    bg: "bg-slate-100/60",
    description: "Laporan 3 bulan siap cetak tersedia. Tingkat berikutnya melengkapi verifikasi identitas & profil.",
  },
  EMAS: {
    name: "Emas",
    badge: "bg-yellow-50 text-yellow-800 border-yellow-400",
    border: "border-yellow-300",
    bg: "bg-yellow-50/60",
    description: "Catatan dan dokumen lengkap terverifikasi. Profil siap dilihat lembaga perbankan & mitra program.",
  },
};

function scoreColor(s: number) {
  if (s < 50) return "text-red-700 bg-red-50 border-red-200";
  if (s < 70) return "text-yellow-700 bg-yellow-50 border-yellow-200";
  if (s < 85) return "text-green-700 bg-green-50 border-green-200";
  return "text-emerald-800 bg-emerald-50 border-emerald-300";
}

function formatRupiah(num: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDateIndo(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

interface TransactionItem {
  id: string;
  item: string;
  direction: string;
  amount_idr: number;
  category: string;
  transaction_date: string;
  payment_method: string | null;
}

interface DocumentItem {
  id: string;
  name: string;
  doc_type: string;
  doc_class: string;
  status: string;
  created_at: string;
  file_url: string | null;
  storage_path: string | null;
}

interface AccessRequestItem {
  id: string;
  institution_name: string;
  purpose_description: string;
  status: string;
  requested_scopes: string[];
  requested_duration_days: number;
  created_at: string;
}

interface ConsentGrantItem {
  id: string;
  institution_name: string;
  status: string;
  scopes: string[];
  expires_at: string | null;
  granted_at: string;
}

export default function UMKMDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id as string;

  const [activeTab, setActiveTab] = useState<"profil" | "laporan" | "catatan" | "dokumen" | "akses">("profil");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Profil Form State
  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [sektor, setSektor] = useState("Kuliner");
  const [lokasi, setLokasi] = useState("Depok");
  const [alamat, setAlamat] = useState("");
  const [phone, setPhone] = useState("");
  const [nib, setNib] = useState("");
  const [email, setEmail] = useState("");
  const [bentukUsaha, setBentukUsaha] = useState("perorangan");
  const [tahunMulai, setTahunMulai] = useState<number | null>(null);
  const [score, setScore] = useState(50);
  const [oldScore, setOldScore] = useState(50);
  const [konsistensiDays, setKonsistensiDays] = useState(1);
  const [status, setStatus] = useState("active");
  const [overrideReason, setOverrideReason] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  // Tier & Readiness State
  const [tierLevel, setTierLevel] = useState<ReadinessLevel>("MULAI");
  const [tierSince, setTierSince] = useState<string | null>(null);

  // Data Keuangan & Transaksi
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  // Dokumen
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  // Akses & Permintaan Lembaga
  const [accessRequests, setAccessRequests] = useState<AccessRequestItem[]>([]);
  const [activeGrants, setActiveGrants] = useState<ConsentGrantItem[]>([]);

  async function fetchDetail() {
    setLoading(true);
    setErrorMsg("");
    try {
      // 1. Resolve Profile or Business
      const { data: directProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", idParam)
        .maybeSingle();

      let targetProfile = directProfile;
      let resolvedBusinessId: string | null = null;
      let resolvedProfileId: string | null = null;

      if (targetProfile) {
        resolvedProfileId = targetProfile.id;
        const { data: bus } = await supabase
          .from("businesses")
          .select("*")
          .eq("legacy_profile_id", targetProfile.id)
          .maybeSingle();
        if (bus) resolvedBusinessId = bus.id;
      } else {
        const { data: busData } = await supabase
          .from("businesses")
          .select("*")
          .eq("id", idParam)
          .maybeSingle();

        if (busData) {
          resolvedBusinessId = busData.id;
          if (busData.legacy_profile_id) {
            resolvedProfileId = busData.legacy_profile_id;
            const { data: linkedProfile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", busData.legacy_profile_id)
              .maybeSingle();
            targetProfile = linkedProfile;
          }

          if (!targetProfile) {
            setBusinessName(busData.name || "Usaha UMKM");
            setOwnerName(busData.legal_name || busData.name || "Pemilik Usaha");
            setSektor(busData.sector || "Kuliner");
            setLokasi(busData.location || "Depok");
            setAlamat(busData.address || "");
            setPhone(busData.phone || "");
            setNib(busData.nib || "");
            setStatus(busData.status || "active");
          }
        }
      }

      setProfileId(resolvedProfileId);
      setBusinessId(resolvedBusinessId);

      if (targetProfile) {
        const bName = targetProfile.nama_usaha || targetProfile.name || "Usaha UMKM";
        const oName =
          targetProfile.nama_pemilik ||
          (targetProfile.name && targetProfile.name !== bName
            ? targetProfile.name
            : targetProfile.email
              ? targetProfile.email.split("@")[0]
              : "Pemilik Usaha");

        setBusinessName(bName);
        setOwnerName(oName);
        setSektor(targetProfile.sektor_usaha || "Kuliner");
        setLokasi(targetProfile.lokasi || "Depok");
        setAlamat(targetProfile.alamat || "");
        setPhone(targetProfile.phone || "");
        setNib(targetProfile.nib || "");
        setEmail(targetProfile.email || "");
        setBentukUsaha(targetProfile.bentuk_usaha || "perorangan");
        setTahunMulai(targetProfile.tahun_mulai_usaha || null);
        const currentScore = Number(targetProfile.readiness_score) || 50;
        setScore(currentScore);
        setOldScore(currentScore);
        setKonsistensiDays(Number(targetProfile.konsistensi_days) || 1);
        setStatus(targetProfile.status || "active");
      }

      // 2. Fetch Readiness Tier State
      if (resolvedBusinessId) {
        const { data: tierData } = await supabase
          .from("business_readiness_state")
          .select("level, level_since")
          .eq("business_id", resolvedBusinessId)
          .maybeSingle();

        if (tierData && tierData.level) {
          setTierLevel(tierData.level as ReadinessLevel);
          setTierSince(tierData.level_since);
        }
      }

      // 3. Fetch Transactions Summary & Recent List
      const txQuery = supabase
        .from("transactions")
        .select("id, item, direction, amount_idr, category, transaction_date, payment_method")
        .order("transaction_date", { ascending: false })
        .limit(100);

      if (resolvedBusinessId) {
        txQuery.or(`business_id.eq.${resolvedBusinessId},user_id.eq.${resolvedProfileId}`);
      } else if (resolvedProfileId) {
        txQuery.eq("user_id", resolvedProfileId);
      }

      const { data: txList } = await txQuery;
      if (txList) {
        setTransactions(txList as TransactionItem[]);
        let inc = 0;
        let exp = 0;
        txList.forEach((t) => {
          if (t.direction === "income") inc += Number(t.amount_idr) || 0;
          if (t.direction === "expense") exp += Number(t.amount_idr) || 0;
        });
        setTotalIncome(inc);
        setTotalExpense(exp);
        setTransactionCount(txList.length);
      }

      // 4. Fetch Documents
      const docQuery = supabase
        .from("documents")
        .select("id, name, doc_type, doc_class, status, created_at, file_url, storage_path")
        .order("created_at", { ascending: false });

      if (resolvedBusinessId) {
        docQuery.or(`business_id.eq.${resolvedBusinessId},user_id.eq.${resolvedProfileId}`);
      } else if (resolvedProfileId) {
        docQuery.eq("user_id", resolvedProfileId);
      }

      const { data: docList } = await docQuery;
      if (docList) {
        setDocuments(docList as DocumentItem[]);
      }

      // 5. Fetch Access Requests & Grants
      if (resolvedBusinessId) {
        const { data: requests } = await supabase
          .from("dossier_requests")
          .select(`
            id, purpose_code, purpose_description, status, requested_scopes, 
            requested_duration_days, created_at,
            institutions(name)
          `)
          .eq("business_id", resolvedBusinessId)
          .order("created_at", { ascending: false });

        if (requests) {
          const mappedReq: AccessRequestItem[] = requests.map((r: any) => ({
            id: r.id,
            institution_name: r.institutions?.name || "Lembaga",
            purpose_description: r.purpose_description || "-",
            status: r.status,
            requested_scopes: r.requested_scopes || [],
            requested_duration_days: r.requested_duration_days || 14,
            created_at: r.created_at,
          }));
          setAccessRequests(mappedReq);
        }

        const { data: grants } = await supabase
          .from("consent_grants")
          .select(`
            id, status, scopes, expires_at, granted_at,
            institutions(name)
          `)
          .eq("business_id", resolvedBusinessId)
          .order("granted_at", { ascending: false });

        if (grants) {
          const mappedGrants: ConsentGrantItem[] = grants.map((g: any) => ({
            id: g.id,
            institution_name: g.institutions?.name || "Lembaga",
            status: g.status,
            scopes: g.scopes || [],
            expires_at: g.expires_at,
            granted_at: g.granted_at,
          }));
          setActiveGrants(mappedGrants);
        }
      }
    } catch (err: unknown) {
      console.error("Error fetching UMKM detail:", err);
      setErrorMsg("Gagal memuat detail data UMKM.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (idParam) {
      void fetchDetail();
    }
  }, [idParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;

    setSaving(true);
    setErrorMsg("");

    try {
      const reasonText =
        score !== oldScore
          ? overrideReason.trim() || `Override skor ${oldScore} -> ${score}`
          : "Pembaruan detail UMKM";

      const targetSaveId = profileId || idParam;
      await runAdminOperation({
        action: "save_umkm",
        id: targetSaveId,
        ownerName: ownerName.trim(),
        businessName: businessName.trim(),
        sector: sektor,
        location: lokasi.trim(),
        email: email.trim(),
        score,
        consistencyDays: konsistensiDays,
        status,
        reason: reasonText,
      });

      if (profileId) {
        await supabase
          .from("profiles")
          .update({
            alamat: alamat.trim() || null,
            phone: phone.trim() || null,
            nib: nib.trim() || null,
            bentuk_usaha: bentukUsaha,
            tahun_mulai_usaha: tahunMulai || null,
          })
          .eq("id", profileId);
      }

      if (businessId) {
        await supabase
          .from("businesses")
          .update({
            name: businessName.trim(),
            sector: sektor,
            location: lokasi.trim(),
            address: alamat.trim() || null,
            phone: phone.trim() || null,
            nib: nib.trim() || null,
            status: status === "active" ? "active" : "inactive",
          })
          .eq("id", businessId);
      }

      setOldScore(score);
      notifySuccess("Data profil UMKM berhasil disimpan.");
    } catch (err: unknown) {
      console.error("Error saving UMKM:", err);
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.");
    } finally {
      setSaving(false);
    }
  };

  const currentTier = TIER_META[tierLevel] || TIER_META.MULAI;
  const netCashflow = totalIncome - totalExpense;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Top Breadcrumb & ID */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/admin/umkm")}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#0b5f86] transition-colors bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          Kembali ke Daftar UMKM
        </button>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>ID Usaha: {businessId || idParam}</span>
        </div>
      </div>

      {/* Hero Card Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center font-bold shrink-0 border border-sky-100 shadow-sm">
              <Store size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="font-headline text-2xl font-black text-[#1b2a3a]">
                  {businessName || "Detail Profil UMKM"}
                </h1>
                <span className={`px-3 py-0.5 rounded-full text-xs font-extrabold border ${
                  status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                }`}>
                  {status === "active" ? "Aktif" : "Non-Aktif"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium flex items-center gap-2">
                <span>Pemilik: <strong className="text-slate-700">{ownerName || "-"}</strong></span>
                <span>•</span>
                <span>Sektor: <strong className="text-slate-700">{sektor}</strong></span>
                <span>•</span>
                <span>Kota: <strong className="text-slate-700">{lokasi}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Tier Badge */}
            <div className={`px-4 py-2 rounded-xl border ${currentTier.badge} flex items-center gap-2 shadow-xs`}>
              <Award size={18} />
              <div>
                <p className="text-[10px] uppercase tracking-wider font-extrabold opacity-75">Tingkat Kesiapan</p>
                <p className="text-xs font-black">Tier {currentTier.name}</p>
              </div>
            </div>

            {/* Score Badge */}
            <div className={`px-4 py-2 rounded-xl border ${scoreColor(score)} flex items-center gap-2 shadow-xs`}>
              <Sparkles size={18} />
              <div>
                <p className="text-[10px] uppercase tracking-wider font-extrabold opacity-75">Readiness Score</p>
                <p className="text-xs font-black">{score} / 100</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Highlights Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 text-xs">
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1">Total Pemasukan Tercatat</span>
            <span className="font-extrabold text-slate-800 text-sm text-emerald-700 font-mono">
              {formatRupiah(totalIncome)}
            </span>
          </div>
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1">Total Pengeluaran</span>
            <span className="font-extrabold text-slate-800 text-sm text-red-600 font-mono">
              {formatRupiah(totalExpense)}
            </span>
          </div>
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1">Arus Kas Bersih</span>
            <span className={`font-extrabold text-sm font-mono ${netCashflow >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
              {formatRupiah(netCashflow)}
            </span>
          </div>
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1">Konsistensi Mencatat</span>
            <span className="font-extrabold text-slate-800 text-sm">
              {konsistensiDays} Hari
            </span>
          </div>
        </div>

        {/* Tier Information Alert */}
        <div className={`mt-5 p-4 rounded-xl border ${currentTier.border} ${currentTier.bg} flex items-start gap-3`}>
          <Award size={18} className="text-[#0b5f86] shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 leading-relaxed">
            <strong>Status Tier Kesiapan ({currentTier.name}):</strong> {currentTier.description}
            {tierSince && <span className="block mt-1 text-[11px] text-slate-500 font-medium">Mencapai tingkat ini sejak: {formatDateIndo(tierSince)}</span>}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab("profil")}
          className={`px-4 py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "profil"
              ? "border-[#0b5f86] text-[#0b5f86]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Store size={15} />
          Profil & Usaha
        </button>

        <button
          onClick={() => setActiveTab("catatan")}
          className={`px-4 py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "catatan"
              ? "border-[#0b5f86] text-[#0b5f86]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <ReceiptText size={15} />
          Buku Kas & Catatan ({transactionCount})
        </button>

        <button
          onClick={() => setActiveTab("dokumen")}
          className={`px-4 py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "dokumen"
              ? "border-[#0b5f86] text-[#0b5f86]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <FileText size={15} />
          Dokumen & Arsip ({documents.length})
        </button>

        <button
          onClick={() => setActiveTab("akses")}
          className={`px-4 py-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "akses"
              ? "border-[#0b5f86] text-[#0b5f86]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Building2 size={15} />
          Akses Lembaga ({accessRequests.length + activeGrants.length})
        </button>
      </div>

      {/* Tab 1: Profil & Form */}
      {activeTab === "profil" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6 md:p-8">
          <h2 className="font-headline text-lg font-bold text-[#1b2a3a] mb-1">
            Data Legalitas & Operasional Usaha
          </h2>
          <p className="text-xs text-slate-500 mb-6">
            Admin dapat meninjau dan memperbarui informasi identitas UMKM serta mengatur manual penyesuaian skor.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {errorMsg && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold animate-fade-in">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nama Usaha / Merek Dagang *
                </label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Contoh: Kopi Wijaya"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
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
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Sektor Usaha
                </label>
                <select
                  value={sektor}
                  onChange={(e) => setSektor(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                >
                  {UMKM_SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Kota / Wilayah Usaha
                </label>
                <CitySelect
                  value={lokasi}
                  onChange={(val) => setLokasi(val)}
                  placeholder="Pilih Kota / Kabupaten..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nomor Induk Berusaha (NIB)
                </label>
                <input
                  type="text"
                  value={nib}
                  onChange={(e) => setNib(e.target.value)}
                  placeholder="Contoh: 1234567890123"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nomor Kontak / WhatsApp
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="081234567890"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Alamat Lengkap Tempat Usaha
                </label>
                <input
                  type="text"
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  placeholder="Jl. Margonda Raya No. 45, RT 01/RW 02"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Email Akun Terdaftar
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@umkm.id"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
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
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
              </div>
            </div>

            {/* Score Adjustment */}
            <div className="bg-[#f8faff] rounded-2xl p-5 border border-[#dbe4ff] space-y-4 mt-6">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-[#0b5f86]" />
                <h3 className="font-bold text-[#1b2a3a] text-sm font-headline">
                  Penyesuaian Skor Kesiapan KUR (Readiness Score)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Skor Kesiapan (0 - 100)
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
                    className="w-full px-4 py-2.5 rounded-xl border border-[#bac3ff] text-sm font-bold text-[#0b5f86] focus:outline-none bg-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Alasan Override Skor (Tercatat di Riwayat Audit)
                  </label>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Contoh: Dokumen agunan & bukti omset lengkap"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push("/admin/umkm")}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#0b5f86] text-white font-bold text-xs hover:bg-[#0f73a3] transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Save size={14} />
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Catatan Transaksi */}
      {activeTab === "catatan" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="font-headline text-lg font-bold text-[#1b2a3a]">
                Riwayat Transaksi & Buku Kas
              </h2>
              <p className="text-xs text-slate-500">
                Pencatatan kas masuk dan kas keluar harian yang dimasukkan oleh pelaku usaha.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 font-bold">
                Masuk: {formatRupiah(totalIncome)}
              </span>
              <span className="text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 font-bold">
                Keluar: {formatRupiah(totalExpense)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-3 px-3 font-bold">Tanggal</th>
                  <th className="text-left py-3 px-3 font-bold">Uraian Transaksi</th>
                  <th className="text-left py-3 px-3 font-bold">Kategori</th>
                  <th className="text-left py-3 px-3 font-bold">Metode</th>
                  <th className="text-right py-3 px-3 font-bold">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Belum ada catatan transaksi yang dimasukkan.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {formatDateIndo(tx.transaction_date)}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 max-w-xs truncate">
                        {tx.item || "Transaksi tanpa keterangan"}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {tx.category || "Umum"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 capitalize">
                        {tx.payment_method || "Tunai"}
                      </td>
                      <td className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap ${
                        tx.direction === "income" ? "text-emerald-700" : "text-rose-600"
                      }`}>
                        {tx.direction === "income" ? "+" : "-"} {formatRupiah(tx.amount_idr)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Dokumen & Arsip */}
      {activeTab === "dokumen" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6">
          <div className="mb-4">
            <h2 className="font-headline text-lg font-bold text-[#1b2a3a]">
              Dokumen & Bukti Pendukung
            </h2>
            <p className="text-xs text-slate-500">
              Dokumen identitas, legalitas (NIB, NPWP), serta laporan keuangan hasil generate sistem.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.length === 0 ? (
              <div className="col-span-2 py-10 text-center text-slate-400 text-xs">
                Belum ada dokumen yang diunggah oleh UMKM ini.
              </div>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#0b5f86] shrink-0">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                        {doc.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Jenis: <strong className="uppercase">{doc.doc_type}</strong> • Diunggah: {formatDateIndo(doc.created_at)}
                      </p>
                      <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        doc.status === "verified"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {doc.status === "verified" ? "Terverifikasi" : "Menunggu Verifikasi"}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Permintaan Akses Lembaga */}
      {activeTab === "akses" && (
        <div className="space-y-6">
          {/* Active Grants */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6">
            <h2 className="font-headline text-lg font-bold text-[#1b2a3a] mb-1">
              Akses Profil yang Sedang Aktif
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Lembaga mitra yang telah disetujui untuk melihat identitas dan ringkasan keuangan UMKM ini.
            </p>

            {activeGrants.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">
                Tidak ada izin akses profil yang aktif saat ini.
              </div>
            ) : (
              <div className="space-y-3">
                {activeGrants.map((grant) => (
                  <div key={grant.id} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-xs font-bold text-emerald-950">{grant.institution_name}</p>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        Masa aktif s/d {grant.expires_at ? formatDateIndo(grant.expires_at) : "Permanen"}
                      </p>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {grant.scopes.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-emerald-800 border border-emerald-200">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                      Aktif
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past / Pending Requests */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6">
            <h2 className="font-headline text-lg font-bold text-[#1b2a3a] mb-1">
              Riwayat Permintaan Akses Lembaga
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Daftar ketertarikan yang diajukan oleh lembaga perbankan atau pendamping program.
            </p>

            {accessRequests.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">
                Belum ada permohonan akses dari institusi manapun.
              </div>
            ) : (
              <div className="space-y-3">
                {accessRequests.map((req) => (
                  <div key={req.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{req.institution_name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">• {formatDateIndo(req.created_at)}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        <strong>Tujuan:</strong> {req.purpose_description}
                      </p>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {req.requested_scopes.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded text-[10px] font-medium bg-white text-slate-700 border border-slate-200">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      req.status === "approved"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : req.status === "rejected"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {req.status === "approved" ? "Disetujui" : req.status === "rejected" ? "Ditolak" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
