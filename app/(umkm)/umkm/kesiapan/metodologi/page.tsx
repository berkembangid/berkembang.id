"use client";

/**
 * "Cara kami menghitung" — tabel aturan apa adanya.
 *
 * Halaman ini adalah alasan tangga kesiapan boleh disebut terbuka. Sebuah
 * angka yang menilai usaha seseorang tanpa cara memeriksanya adalah kotak
 * hitam, dan kotak hitam yang menilai kelayakan adalah persis yang dilarang
 * POJK 29/2024. Karena itu isinya dibaca langsung dari konfigurasi terbit,
 * bukan ditulis ulang sebagai teks — kalau aturannya berubah, halaman ini
 * berubah sendiri.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, ScrollText } from "lucide-react";
import { DashboardPage, PageHeader } from "@/components/dashboard";

type Methodology = {
  formulaVersion: string;
  disclaimer: string;
  windows: {
    habitDays: number;
    qualityDays: number;
    evidenceDays: number;
    fullMonthLookback: number;
    fullMonthMinDays: number;
  };
  bigSpendIdr: number;
  levels: { level: string; name: string; meaning: string }[];
  bronze: Record<string, number>;
  components: {
    id: string;
    pillar: string;
    pillarTitle: string;
    partial: number | null;
    silver: number | null;
    gold: number | null;
  }[];
};

/** Nama komponen dalam bahasa pemilik; id-nya tetap ditampilkan untuk rujukan. */
const componentNames: Record<string, string> = {
  A1: "Hari mencatat dalam sebulan",
  A2: "Tutup kas dalam sebulan",
  A3: "Umur catatan",
  B1: "Catatan yang sudah diperiksa",
  B2: "Uang pribadi tercatat terpisah",
  B3: "Nota untuk belanja besar",
  B4: "Hitung sisa bahan",
  C1: "Izin wajib sektor",
  C2: "Kelengkapan profil",
  D1: "Kondisi awal usaha",
  D2: "Bulan penuh tercatat",
  D3: "Laporan yang pernah diterbitkan",
};

function threshold(value: number | null): string {
  if (value === null) return "—";
  // Nilai di bawah satu adalah proporsi; sisanya hitungan.
  return value < 1 ? `${Math.round(value * 100)}%` : String(value);
}

export default function MetodologiPage() {
  const [data, setData] = useState<Methodology | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/v1/readiness/methodology");
        const payload = (await response.json()) as { data?: Methodology };
        setData(payload.data ?? null);
      } catch {
        setData(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Cara kami menghitung"
        description="Seluruh aturan yang menentukan tingkat kesiapan usahamu, apa adanya."
        icon={ScrollText}
        actions={
          <Link
            href="/umkm/kesiapan"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#e3e9f0] bg-white px-3 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9]"
          >
            <ArrowLeft size={14} /> Kembali
          </Link>
        }
      />

      {!data ? (
        <p className="flex items-center gap-2 px-1 py-6 text-xs text-[#6e859e]">
          <LoaderCircle size={14} className="animate-spin" /> Memuat aturan…
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5">
            <h2 className="text-sm font-bold text-[#1b2a3a]">Empat tingkat</h2>
            <ul className="mt-3 space-y-2">
              {data.levels.map((level) => (
                <li key={level.level} className="rounded-xl bg-[#f3f6f9] px-3.5 py-2.5">
                  <p className="text-xs font-bold text-[#1b2a3a]">{level.name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#4a6280]">{level.meaning}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5">
            <h2 className="text-sm font-bold text-[#1b2a3a]">Dua belas hal yang dilihat</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">
              Semuanya dihitung dari catatan dan dokumen yang sudah ada. Tidak ada satu pun yang
              perlu kamu klaim sendiri. Hari mencatat dihitung dari {data.windows.habitDays} hari
              terakhir, mutu catatan dari {data.windows.qualityDays} hari terakhir, dan belanja
              besar berarti di atas Rp{data.bigSpendIdr.toLocaleString("id-ID")}.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-[#e3e9f0] text-[10px] uppercase tracking-wide text-[#6e859e]">
                    <th className="py-2 pr-3 font-bold">Yang dilihat</th>
                    <th className="py-2 pr-3 font-bold">Mulai terhitung</th>
                    <th className="py-2 pr-3 font-bold">Syarat Perak</th>
                    <th className="py-2 font-bold">Syarat Emas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.components.map((component) => (
                    <tr key={component.id} className="border-b border-[#f3f6f9] last:border-b-0">
                      <td className="py-2 pr-3">
                        <span className="font-bold text-[#1b2a3a]">
                          {componentNames[component.id] ?? component.id}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[#6e859e]">
                          {component.pillarTitle}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-[#4a6280]">{threshold(component.partial)}</td>
                      <td className="py-2 pr-3 tabular-nums text-[#4a6280]">{threshold(component.silver)}</td>
                      <td className="py-2 tabular-nums text-[#4a6280]">{threshold(component.gold)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#6e859e]">
              Bagian yang datanya memang belum ada — misalnya nota belanja besar pada usaha yang
              belum pernah belanja besar — tidak dihitung sebagai kekurangan dan tidak menahan
              tingkatmu.
            </p>
          </section>

          <section className="rounded-xl border border-[#e3e9f0] bg-[#f3f6f9] px-4 py-3 text-[12.5px] leading-relaxed text-[#4a6280]">
            {data.disclaimer} Versi aturan: {data.formulaVersion}. Aturan yang sudah terbit tidak
            pernah diubah diam-diam; perubahan selalu menjadi versi baru, sehingga penilaian lama
            tetap bisa dijelaskan.
          </section>
        </>
      )}
    </DashboardPage>
  );
}
