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
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";

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
  B5: "Rekening usaha terpisah",
  C1: "Izin wajib sektor",
  C2: "Kelengkapan profil",
  D1: "Kondisi awal usaha",
  D2: "Bulan penuh tercatat",
  D3: "Laporan yang pernah diterbitkan",
};

/** Anak tangga B5 bukan hitungan apa pun, jadi angkanya tidak berarti di layar. */
const anakTanggaRekening: Record<number, string> = { 1: "tercatat", 2: "berbukti" };

function threshold(value: number | null, id?: string): string {
  if (value === null) return "—";
  if (id === "B5") return anakTanggaRekening[value] ?? String(value);
  // Nilai di bawah satu adalah proporsi; sisanya hitungan.
  return value < 1 ? `${Math.round(value * 100)}%` : String(value);
}

export default function MetodologiPage() {
  const [data, setData] = useState<Methodology | null>(null);
  // Gagal dibedakan dari "sedang memuat". Dulu keduanya sama-sama `null`, jadi
  // satu pemuatan yang gagal membuat roda berputar selamanya.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/v1/readiness/methodology");
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as { data?: Methodology };
        if (!payload.data) throw new Error("empty");
        setData(payload.data);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Cara kami menghitung"
        description="Seluruh aturan yang menentukan tingkat kesiapan usaha Anda, apa adanya."
        icon={ScrollText}
        actions={
          <Link
            href="/umkm/perjalanan"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-umkm-line bg-white px-3 text-xs font-bold text-umkm-muted hover:bg-umkm-surface-muted"
          >
            <ArrowLeft size={14} /> Kembali
          </Link>
        }
      />

      {!data && failed ? (
        <FeedbackBanner tone="error" title="Aturan belum dapat dimuat">
          Periksa sambungan internet, lalu coba lagi.{" "}
          <button
            type="button"
            onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}
            className="inline-flex min-h-11 items-center font-bold underline"
          >
            Coba lagi
          </button>
        </FeedbackBanner>
      ) : !data ? (
        <p role="status" className="flex items-center gap-2 px-1 py-6 text-xs text-umkm-subtle">
          <LoaderCircle size={14} className="animate-spin" /> Memuat aturan…
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-umkm-line bg-white p-5">
            <h2 className="text-sm font-bold text-umkm-ink">Empat tingkat</h2>
            <ul className="mt-3 space-y-2">
              {data.levels.map((level) => (
                <li key={level.level} className="rounded-xl bg-umkm-surface-muted px-3.5 py-2.5">
                  <p className="text-xs font-bold text-umkm-ink">{level.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-umkm-muted">{level.meaning}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-umkm-line bg-white p-5">
            <h2 className="text-sm font-bold text-umkm-ink">Tiga belas hal yang dilihat</h2>
            <p className="mt-1 text-xs leading-relaxed text-umkm-subtle">
              Hampir semuanya dihitung dari catatan dan dokumen yang sudah ada. Satu-satunya yang
              Anda nyatakan sendiri adalah rekening usaha — dan pernyataan itu baru terhitung penuh
              setelah ada berkasnya. Hari mencatat dihitung dari {data.windows.habitDays} hari
              terakhir, mutu catatan dari {data.windows.qualityDays} hari terakhir, dan belanja
              besar berarti di atas Rp{data.bigSpendIdr.toLocaleString("id-ID")}.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-umkm-line text-[11px] uppercase tracking-wide text-umkm-subtle">
                    <th className="py-2 pr-3 font-bold">Yang dilihat</th>
                    <th className="py-2 pr-3 font-bold">Mulai terhitung</th>
                    <th className="py-2 pr-3 font-bold">Syarat Perak</th>
                    <th className="py-2 font-bold">Syarat Emas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.components.map((component) => (
                    <tr key={component.id} className="border-b border-umkm-surface-muted last:border-b-0">
                      <td className="py-2 pr-3">
                        <span className="font-bold text-umkm-ink">
                          {componentNames[component.id] ?? component.id}
                        </span>
                        <span className="mt-0.5 block text-xs text-umkm-subtle">
                          {component.pillarTitle}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-umkm-muted">{threshold(component.partial, component.id)}</td>
                      <td className="py-2 pr-3 tabular-nums text-umkm-muted">{threshold(component.silver, component.id)}</td>
                      <td className="py-2 tabular-nums text-umkm-muted">{threshold(component.gold, component.id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-umkm-subtle">
              Bagian yang datanya memang belum ada — misalnya nota belanja besar pada usaha yang
              belum pernah belanja besar — tidak dihitung sebagai kekurangan dan tidak menahan
              tingkat Anda.
            </p>
          </section>

          <section className="rounded-xl border border-umkm-line bg-umkm-surface-muted px-4 py-3 text-[12.5px] leading-relaxed text-umkm-muted">
            {data.disclaimer} Versi aturan: {data.formulaVersion}. Aturan yang sudah terbit tidak
            pernah diubah diam-diam; perubahan selalu menjadi versi baru, sehingga penilaian lama
            tetap bisa dijelaskan.
          </section>
        </>
      )}
    </DashboardPage>
  );
}
