"use client";

import { usePathname } from "next/navigation";

/**
 * Kosakata dua portal yang berbagi layar yang sama.
 *
 * Seluruh halaman investor membungkus modul lembaga. Dulu setiap modul
 * menebak portalnya sendiri (`pathname.startsWith("/investor")`, atau
 * `selected.portalKind`) dan sebagian besar kalimat tidak ditebak sama
 * sekali -- investor membaca "Temukan kandidat", "program Dinas", "kuota
 * dosir lembaga". Kini perbedaannya tinggal di satu tabel ini, dan
 * portalnya ditentukan oleh ALAMAT, bukan organisasi yang terpilih: layar
 * `/investor` selalu berbicara sebagai portal investor.
 */
export type PortalKey = "lembaga" | "investor";

export type PortalCopy = {
  key: PortalKey;
  base: "/lembaga" | "/investor";
  /** Sebutan singkat pemakainya: "lembaga", "investor". */
  actor: string;
  discoverLabel: string;
  discoverTitle: string;
  discoverDescription: string;
  /** Label tombol di layar kosong yang mengarah ke halaman Temukan/Katalog. */
  discoverCta: string;
  /** Kode tujuan yang tersimpan di permintaan izin. */
  purposeCode: string;
  purposeDefault: string;
  requestsTitle: string;
  dossiersTitle: string;
  savedTitle: string;
  organizationTitle: string;
  auditTitle: string;
};

export const PORTAL_COPY: Record<PortalKey, PortalCopy> = {
  lembaga: {
    key: "lembaga",
    base: "/lembaga",
    actor: "lembaga",
    discoverLabel: "Temukan",
    discoverTitle: "Kandidat pendanaan",
    discoverDescription: "Bandingkan kesiapan data usaha secara anonim. Tanpa skor, tanpa peringkat, tanpa rupiah — identitas terbuka hanya setelah pemiliknya setuju.",
    discoverCta: "Temukan kandidat",
    purposeCode: "program_review",
    purposeDefault: "Menilai kecocokan usaha untuk program pendampingan dan pembiayaan.",
    requestsTitle: "Permintaan akses",
    dossiersTitle: "Profil berizin",
    savedTitle: "Kandidat tersimpan",
    organizationTitle: "Organisasi & anggota",
    auditTitle: "Log audit",
  },
  investor: {
    key: "investor",
    base: "/investor",
    actor: "investor",
    discoverLabel: "Katalog UMKM",
    discoverTitle: "Katalog UMKM",
    discoverDescription: "Jelajahi usaha yang membuka diri untuk kemitraan, offtaking, dan investasi — identitasnya tersamar sampai pemilik setuju.",
    discoverCta: "Buka katalog",
    purposeCode: "partnership_review",
    purposeDefault: "Menilai kelayakan kemitraan bisnis, offtaking hasil produksi, atau investasi UMKM.",
    requestsTitle: "Pengajuan minat",
    dossiersTitle: "Profil berizin",
    savedTitle: "Kandidat tersimpan",
    organizationTitle: "Entitas & tim",
    auditTitle: "Log audit",
  },
};

export function portalFromPath(pathname: string): PortalCopy {
  return pathname.startsWith("/investor") ? PORTAL_COPY.investor : PORTAL_COPY.lembaga;
}

export function usePortal(): PortalCopy {
  return portalFromPath(usePathname());
}
