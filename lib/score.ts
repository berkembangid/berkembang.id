export interface ReadinessScoreResult {
  legalitasScore: number;
  konsistensiScore: number;
  kelengkapanScore: number;
  aktivitasScore: number;
  dataPendukungScore: number;
  totalScore: number;
  breakdown: {
    key: string;
    label: string;
    score: number;
    bobot: string;
    weightNum: number;
    desc: string;
    color: string;
  }[];
  statusInfo: {
    label: string;
    color: string;
    badgeColor: string;
  };
}

export interface GapItem {
  id: string;
  title: string;
  severity: "kritis" | "penting" | "minor";
  category: string;
  gain: number;
  potential_gain?: number;
  desc: string;
  why: string;
  fix: string;
  linkHref?: string;
}

export const REQUIRED_DOCS = ["ktp", "nib", "npwp", "laporan_keuangan", "rekening_koran", "akta"];

export function getScoreLabel(score: number) {
  if (score >= 80) {
    return {
      label: "Sangat Baik & Siap Pengajuan",
      color: "bg-emerald-500",
      badgeColor: "text-emerald-700 bg-emerald-50 border-emerald-200"
    };
  }
  if (score >= 60) {
    return {
      label: "Cukup Baik (Syarat Dasar Terpenuhi)",
      color: "bg-blue-600",
      badgeColor: "text-blue-700 bg-blue-50 border-blue-200"
    };
  }
  if (score >= 40) {
    return {
      label: "Perlu Perbaikan Dokumen",
      color: "bg-amber-500",
      badgeColor: "text-amber-700 bg-amber-50 border-amber-200"
    };
  }
  return {
    label: "Belum Siap, Lengkapi Berkas",
    color: "bg-red-500",
    badgeColor: "text-red-700 bg-red-50 border-red-200"
  };
}

export function calculateReadinessScore(
  profile: any,
  txs: any[] = [],
  docTypes: Set<string> | string[] = new Set(),
  userMetadata: any = {}
): ReadinessScoreResult {
  const docTypeSet = docTypes instanceof Set ? docTypes : new Set(docTypes);

  // 1. Legalitas Score (25%)
  const hasNIB = Boolean(profile?.nib || userMetadata?.nib || docTypeSet.has("nib"));
  const hasName = Boolean(profile?.name || profile?.nama_usaha || userMetadata?.nama_usaha);
  let legalitasScore = 10;
  if (hasNIB && hasName) legalitasScore = 100;
  else if (hasNIB) legalitasScore = 75;
  else if (hasName) legalitasScore = 40;

  // 2. Konsistensi Data Score (20%)
  const txCount = txs.length;
  const konsistensiScore = Math.min(100, txCount * 10);

  // 3. Kelengkapan Dokumen Score (25%)
  const uploadedCount = REQUIRED_DOCS.filter((t) => docTypeSet.has(t)).length;
  const kelengkapanScore = Math.round((uploadedCount / REQUIRED_DOCS.length) * 100);

  // 4. Aktivitas Usaha Score (15%)
  const masuk = txs.filter((t: any) => t.type === "masuk").reduce((s: number, t: any) => s + Number(t.nominal), 0);
  const keluar = txs.filter((t: any) => t.type === "keluar").reduce((s: number, t: any) => s + Number(t.nominal), 0);
  let aktivitasScore = 0;
  if (masuk > 0) {
    const net = masuk - keluar;
    const ratio = net / masuk;
    aktivitasScore = Math.min(100, Math.max(20, Math.round(ratio * 100)));
  }

  // 5. Data Pendukung Score (15%)
  const hasLokasi = Boolean(profile?.lokasi || userMetadata?.lokasi);
  const hasSektor = Boolean(profile?.sektor_usaha || userMetadata?.sektor_usaha);
  const hasPhone = Boolean(profile?.phone || userMetadata?.phone);
  let dataPendukungScore = 20;
  if (hasLokasi && hasSektor && hasPhone) dataPendukungScore = 100;
  else if (hasLokasi || hasSektor) dataPendukungScore = 60;

  // Total Weighted Score (pas 100%)
  const totalScore = Math.round(
    legalitasScore * 0.25 +
    konsistensiScore * 0.20 +
    kelengkapanScore * 0.25 +
    aktivitasScore * 0.15 +
    dataPendukungScore * 0.15
  );

  const breakdown = [
    {
      key: "legalitas",
      label: "Legalitas",
      score: legalitasScore,
      bobot: "25%",
      weightNum: 0.25,
      desc: hasNIB ? "NIB terverifikasi" : "NIB belum diisi di profil",
      color: "#3b82f6",
    },
    {
      key: "konsistensi",
      label: "Konsistensi Data",
      score: konsistensiScore,
      bobot: "20%",
      weightNum: 0.20,
      desc: `${txCount} transaksi tercatat`,
      color: "#06b6d4",
    },
    {
      key: "kelengkapan",
      label: "Kelengkapan Dokumen",
      score: kelengkapanScore,
      bobot: "25%",
      weightNum: 0.25,
      desc: `${uploadedCount} dari ${REQUIRED_DOCS.length} dokumen terunggah`,
      color: "#f59e0b",
    },
    {
      key: "aktivitas",
      label: "Aktivitas Usaha",
      score: aktivitasScore,
      bobot: "15%",
      weightNum: 0.15,
      desc: masuk > 0 ? `Omzet tercatat Rp${masuk.toLocaleString("id-ID")}` : "Belum ada pencatatan omzet",
      color: "#10b981",
    },
    {
      key: "data_pendukung",
      label: "Data Pendukung",
      score: dataPendukungScore,
      bobot: "15%",
      weightNum: 0.15,
      desc: hasLokasi ? "Profil lokasi & sektor terisi" : "Lengkapi lokasi & sektor di profil",
      color: "#8b5cf6",
    },
  ];

  return {
    legalitasScore,
    konsistensiScore,
    kelengkapanScore,
    aktivitasScore,
    dataPendukungScore,
    totalScore,
    breakdown,
    statusInfo: getScoreLabel(totalScore),
  };
}

export function detectUserGaps(
  profile: any,
  txs: any[] = [],
  docTypes: Set<string> | string[] = new Set(),
  userMetadata: any = {},
  customGaps?: any[]
): GapItem[] {
  if (customGaps && Array.isArray(customGaps) && customGaps.length > 0) {
    return customGaps.map((g, idx) => ({
      id: g.id || `gap-${idx}`,
      title: g.title || "Temuan Gap Kesiapan",
      severity: g.severity || "penting",
      category: g.category || "Kelengkapan",
      gain: g.gain || g.potential_gain || 8,
      potential_gain: g.gain || g.potential_gain || 8,
      desc: g.desc || g.description || "Perlu perbaikan berkas untuk menaikkan skor.",
      why: g.why || "Bank memverifikasi kelengkapan berkas untuk validasi kelayakan usaha.",
      fix: g.fix || "Lengkapi data dan dokumen terkait.",
      linkHref: g.linkHref || "/umkm/upload",
    }));
  }

  const docTypeSet = docTypes instanceof Set ? docTypes : new Set(docTypes);
  const gaps: GapItem[] = [];

  // 1. Check NIB
  const hasNIB = Boolean(profile?.nib || userMetadata?.nib || docTypeSet.has("nib"));
  if (!hasNIB) {
    gaps.push({
      id: "gap-nib",
      title: "NIB / Izin Usaha Tidak Ditemukan",
      severity: "kritis",
      category: "Legalitas",
      gain: 15,
      potential_gain: 15,
      desc: "Surat Izin Usaha Perdagangan atau NIB OSS belum terdeteksi dalam arsip dokumen usahamu.",
      why: "Lembaga keuangan dan bank mewajibkan NIB sebagai bukti bahwa usahamu beroperasi secara legal.",
      fix: "Daftarkan NIB melalui sistem OSS di oss.go.id secara gratis lalu unggah dokumennya.",
      linkHref: "/umkm/upload",
    });
  }

  // 2. Check KTP
  if (!docTypeSet.has("ktp")) {
    gaps.push({
      id: "gap-ktp",
      title: "KTP Pemilik Usaha Belum Diunggah",
      severity: "kritis",
      category: "Legalitas",
      gain: 12,
      potential_gain: 12,
      desc: "Foto KTP pemilik usaha belum terunggah untuk verifikasi identitas pemohon pinjaman.",
      why: "Verifikasi identitas KTP adalah syarat mutlak pembukaan rekening pinjaman dan pencocokan data.",
      fix: "Foto e-KTP dengan jelas dan unggah di menu Upload Dokumen.",
      linkHref: "/umkm/upload",
    });
  }

  // 3. Check NPWP
  if (!docTypeSet.has("npwp")) {
    gaps.push({
      id: "gap-npwp",
      title: "NPWP Usaha / Pribadi Belum Diunggah",
      severity: "kritis",
      category: "Kelengkapan Dokumen",
      gain: 10,
      potential_gain: 10,
      desc: "Dokumen NPWP belum terdeteksi dalam arsip berkas usaha.",
      why: "Pihak analis bank membutuhkan NPWP untuk verifikasi kepatuhan perpajakan dan histori usaha.",
      fix: "Unggah kartu NPWP fisik atau kartu e-NPWP dari DJP Online.",
      linkHref: "/umkm/upload",
    });
  }

  // 4. Check Transactions Frequency
  if (txs.length < 10) {
    gaps.push({
      id: "gap-txs",
      title: "Riwayat Transaksi Harian Masih Sedikit",
      severity: "penting",
      category: "Konsistensi Data",
      gain: 10,
      potential_gain: 10,
      desc: `Baru ${txs.length} transaksi tercatat. Minimal 10 transaksi untuk pembuktian keaktifan arus kas usaha.`,
      why: "Bank menilai stabilitas omzet dan kemampuan mengangsur dari konsistensi pencatatan transaksi harian.",
      fix: "Gunakan fitur Catat Suara AI setiap hari sehabis transaksi penjualan atau belanja stok.",
      linkHref: "/umkm/catat",
    });
  }

  // 5. Check Laporan Keuangan
  if (!docTypeSet.has("laporan_keuangan")) {
    gaps.push({
      id: "gap-lapkeu",
      title: "Laporan Keuangan / Arus Kas Belum Diunggah",
      severity: "penting",
      category: "Kelengkapan Dokumen",
      gain: 8,
      potential_gain: 8,
      desc: "Rekap laporan keuangan atau catatan pembukuan 3 bulan terakhir belum diunggah.",
      why: "Dokumen laporan keuangan menjadi dasar analisis rasio keuntungan dan perputaran modal kerja.",
      fix: "Unduh laporan arus kas dari platform atau unggah laporan keuangan mandiri.",
      linkHref: "/umkm/upload",
    });
  }

  // 6. Check Rekening Koran
  if (!docTypeSet.has("rekening_koran")) {
    gaps.push({
      id: "gap-rek-koran",
      title: "Rekening Koran Bank Belum Diunggah",
      severity: "penting",
      category: "Kelengkapan Dokumen",
      gain: 8,
      potential_gain: 8,
      desc: "Mutasi koran bank 3 bulan terakhir belum diunggah ke portal.",
      why: "Pihak analis bank memvalidasi arus kas masuk dan keluar dari mutasi asli rekening bank.",
      fix: "Unduh e-Statement PDF dari mobile banking dan unggah di menu Upload Dokumen.",
      linkHref: "/umkm/upload",
    });
  }

  // 7. Check Profile Location & Sector
  const hasLokasi = Boolean(profile?.lokasi || userMetadata?.lokasi);
  const hasSektor = Boolean(profile?.sektor_usaha || userMetadata?.sektor_usaha);
  if (!hasLokasi || !hasSektor) {
    gaps.push({
      id: "gap-profil",
      title: "Data Lokasi & Sektor Usaha Belum Lengkap",
      severity: "minor",
      category: "Data Pendukung",
      gain: 6,
      potential_gain: 6,
      desc: "Informasi kota lokasi usaha dan sektor bisnis di profil belum diisi lengkap.",
      why: "Data wilayah menentukan penempatan unit kerja bank terdekat untuk survei lapangan.",
      fix: "Lengkapi lokasi kota dan sektor usaha Anda di menu Profil.",
      linkHref: "/umkm/profil",
    });
  }

  return gaps;
}
