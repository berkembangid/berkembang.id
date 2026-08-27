export type ReadinessComponentStatus = "scored" | "data_insufficient" | "not_applicable";

export type ReadinessComponentView = {
  code: string;
  label: string;
  status: ReadinessComponentStatus;
  score: number | null;
  maxScore: number;
  confidence: number;
  freshness: "fresh" | "aging" | "stale";
  evidenceCount: number;
  explanation: string;
  nextAction: string | null;
  quality: "verified" | "confirmed" | "recorded";
};

export type ReadinessMissionView = {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  status: "available" | "in_progress" | "completed" | "dismissed" | "expired";
  impact: number;
  effort: "low" | "medium" | "high";
  href: string;
};

export type ReadinessView = {
  snapshotId: string;
  ruleVersion: string;
  score: number;
  previousScore: number | null;
  scoreChange: number | null;
  changeReason: string;
  calculatedAt: string;
  disclaimer: string;
  components: ReadinessComponentView[];
  primaryMission: ReadinessMissionView | null;
  missions: ReadinessMissionView[];
};

export const readinessLabels: Record<string, string> = {
  transaction_recording: "Kebiasaan mencatat transaksi",
  basic_legality: "Legalitas dasar usaha",
  utilities: "Biaya rutin usaha",
  digital_footprint: "Asal pesanan",
  digital_payments: "Pembayaran digital",
  complete_profile: "Kelengkapan profil",
  certificates_training: "Izin dan sertifikat pendukung",
};

export const missionLinks: Record<string, string> = {
  record_transactions: "/umkm/catat",
  upload_nib: "/umkm/upload",
  complete_profile: "/umkm/profil",
  use_digital_payment: "/umkm/catat",
  record_utilities: "/umkm/catat",
  record_sales_channel: "/umkm/catat",
  upload_certificate: "/umkm/upload",
};
