import Link from "next/link";
import { ArrowLeft, Building2, EyeOff, Map, ShieldCheck, Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { selectedInstitutionFromCookies } from "@/lib/api/institution";
import {
  DashboardPage, DashboardPanel, EmptyState, FeedbackBanner, MetricCard, PageHeader, PanelHeader,
} from "@/components/dashboard";

/**
 * Ringkasan wilayah untuk dinas, dan daftar di belakang setiap angkanya.
 *
 * SELURUH aturannya ada di `dinas_region_summary()` dan
 * `dinas_region_drilldown()`: batas wilayah, kewenangan, dan sel minimum 5.
 * Halaman ini tidak menyaring, tidak menjumlahkan, dan tidak menyembunyikan apa
 * pun sendiri -- ia menggambar apa yang diberikan kedua fungsi itu. Aturan yang
 * hidup di React bukan aturan: penyaring bisa dikirim langsung ke API, dan layar
 * bisa dilewati.
 *
 * KENAPA BUKAN SATU ANGKA KESEHATAN.
 *
 * Dua sumbu digambar bersebelahan dan tidak pernah dijumlahkan. Satu angka
 * tunggal atas sebuah usaha adalah penilaian kelayakan, dan itu garis yang
 * produk ini tidak lewati (POJK 29/2024). Yang berguna justru silangannya:
 * "rutin mencatat tetapi legalitas belum lengkap" adalah kohort yang paling
 * jelas tindakannya, dan itu tidak terlihat dari salah satu sumbu saja.
 */

const RECORDING_BANDS = ["Rutin mencatat", "Mulai rutin", "Jarang mencatat", "Belum mulai"] as const;

type Band = { band: string; count: number | null; suppressed: boolean };
type Cell = { recording: string; legality: string; count: number | null; suppressed: boolean };

type AnonymousRow = {
  candidateCode: string; sector: string; readinessLevel: string;
  recordingActivity: string; legalComplete: boolean;
};
type AffiliatedRow = {
  businessName: string; ownerName: string | null; sector: string; readinessLevel: string;
  recordingActivity: string; legalComplete: boolean;
};

type Summary =
  | { state: "forbidden" }
  | { state: "unavailable" }
  | { state: "regionUnknown" }
  | {
      state: "ready";
      region: string; total: number; affiliated: number;
      recording: Band[]; legality: Band[]; matrix: Cell[];
      minCell: number; canDrillDown: boolean;
    };

type Drilldown =
  | { state: "unavailable" }
  | {
      state: "ready";
      region: string;
      affiliated: AffiliatedRow[]; affiliatedTotal: number;
      anonymous: AnonymousRow[]; anonymousTotal: number | null;
      anonymousSuppressed: boolean; cap: number; minCell: number;
    };

async function loadSummary(): Promise<Summary> {
  try {
    const client = await createServerSupabaseClient({ institutionId: await selectedInstitutionFromCookies() });
    const { data, error } = await client.rpc("dinas_region_summary");
    if (error) {
      return error.message.includes("BUKAN_LEMBAGA_BERWILAYAH")
        ? { state: "forbidden" }
        : { state: "unavailable" };
    }
    const payload = data as Record<string, unknown> | null;
    if (!payload) return { state: "unavailable" };
    if (payload.regionKnown !== true) return { state: "regionUnknown" };
    return {
      state: "ready",
      region: String(payload.region ?? ""),
      total: Number(payload.total ?? 0),
      affiliated: Number(payload.affiliated ?? 0),
      recording: (payload.recording ?? []) as Band[],
      legality: (payload.legality ?? []) as Band[],
      matrix: (payload.matrix ?? []) as Cell[],
      minCell: typeof payload.minCell === "number" ? payload.minCell : 5,
      canDrillDown: payload.canDrillDown === true,
    };
  } catch {
    return { state: "unavailable" };
  }
}

async function loadDrilldown(band: string | null, legalComplete: boolean | null): Promise<Drilldown> {
  try {
    const client = await createServerSupabaseClient({ institutionId: await selectedInstitutionFromCookies() });
    const { data, error } = await client.rpc("dinas_region_drilldown", {
      p_recording_band: band ?? undefined,
      p_legal_complete: legalComplete ?? undefined,
    });
    if (error) return { state: "unavailable" };
    const payload = data as Record<string, unknown> | null;
    if (!payload || payload.regionKnown !== true) return { state: "unavailable" };
    return {
      state: "ready",
      region: String(payload.region ?? ""),
      affiliated: (payload.affiliated ?? []) as AffiliatedRow[],
      affiliatedTotal: Number(payload.affiliatedTotal ?? 0),
      anonymous: (payload.anonymous ?? []) as AnonymousRow[],
      anonymousTotal: typeof payload.anonymousTotal === "number" ? payload.anonymousTotal : null,
      anonymousSuppressed: payload.anonymousSuppressed === true,
      cap: Number(payload.cap ?? 100),
      minCell: typeof payload.minCell === "number" ? payload.minCell : 5,
    };
  } catch {
    return { state: "unavailable" };
  }
}

/** `Legalitas lengkap` ⇄ `lengkap`, supaya alamatnya bisa dibaca orang. */
function legalityParam(band: string): string {
  return band === "Legalitas lengkap" ? "lengkap" : "belum";
}

function drilldownHref(band: string | null, legality: string | null): string {
  const params = new URLSearchParams();
  if (band) params.set("mencatat", band);
  if (legality) params.set("legalitas", legality);
  return `/lembaga/wilayah?${params.toString()}`;
}

function shellHeader(region: string | null) {
  return <PageHeader
    title={region ? `Ringkasan wilayah · ${region}` : "Ringkasan wilayah"}
    description="Jumlah usaha per keadaan. Tanpa nama usaha, tanpa nama pemilik, dan tanpa angka rupiah."
    icon={Map}
  />;
}

/** Sel yang disembunyikan tidak digambar sebagai nol -- nol adalah kabar lain. */
function BandRows({ rows, total, canDrillDown, hrefFor }: {
  rows: Band[]; total: number; canDrillDown: boolean;
  hrefFor: (band: string) => string;
}) {
  return (
    <ul className="divide-y divide-[#eef2f6]">
      {rows.map((row) => {
        const share = row.count !== null && total > 0 ? (row.count / total) * 100 : null;
        const value = row.suppressed
          // Tidak ditulis "kurang dari {minCell}": baris bisa disembunyikan
          // sebagai pelengkap dan bernilai berapa saja (lihat tabel silang di
          // bawah). Menyebut batasnya justru membocorkan isinya.
          ? <span className="inline-flex items-center gap-1 font-medium text-[#6e859e]"><EyeOff size={12} aria-hidden />Disembunyikan untuk melindungi identitas</span>
          : <>{row.count} usaha{share !== null && <span className="ml-1.5 font-medium text-[#6e859e]">{share.toFixed(0)}%</span>}</>;
        return (
          <li key={row.band} className="px-5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              {canDrillDown
                ? <Link href={hrefFor(row.band)} className="text-xs font-medium text-[#0b5f86] underline decoration-[#addcf4] underline-offset-2 hover:decoration-[#0b5f86]">{row.band}</Link>
                : <p className="text-xs font-medium text-[#1b2a3a]">{row.band}</p>}
              <p className="shrink-0 text-xs font-semibold tabular-nums text-[#1b2a3a]">{value}</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef2f6]">
              {share !== null && <div className="h-full rounded-full bg-[#1590c7]" style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DrilldownView({ data, band, legality }: {
  data: Drilldown; band: string | null; legality: string | null;
}) {
  const scope = [band, legality].filter(Boolean).join(" · ") || "Seluruh wilayah";

  if (data.state === "unavailable") {
    return <DashboardPage>
      {shellHeader(null)}
      <FeedbackBanner tone="error" title="Daftarnya belum bisa dibuka sekarang">
        Kembali ke angkanya dan coba sekali lagi. Kalau tetap begini, beri tahu pengelola Berkembang.id.
      </FeedbackBanner>
      <Link href="/lembaga/wilayah" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5f86]"><ArrowLeft size={14} /> Kembali ke angka wilayah</Link>
    </DashboardPage>;
  }

  return <DashboardPage>
    {shellHeader(data.region)}
    <Link href="/lembaga/wilayah" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b5f86]"><ArrowLeft size={14} /> Kembali ke angka wilayah</Link>
    <p className="text-xs text-[#6e859e]">Menampilkan: <strong className="font-bold text-[#1b2a3a]">{scope}</strong></p>

    <DashboardPanel>
      <PanelHeader
        title={`Memilih lembaga Anda sebagai pembina · ${data.affiliatedTotal}`}
        description="Pemiliknya sendiri yang memilih, dan bisa mencabutnya kapan saja. Tidak ada nomor kontak dan tidak ada angka rupiah di sini — keduanya menuntut izin terpisah."
      />
      {data.affiliated.length === 0
        ? <p className="px-5 pb-5 text-xs text-[#6e859e]">Belum ada usaha di kelompok ini yang memilih lembaga Anda sebagai pembina.</p>
        : <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[32rem] border-collapse text-xs">
              <thead><tr>
                {["Usaha", "Pemilik", "Bidang", "Kebiasaan mencatat", "Legalitas"].map((head) => (
                  <th key={head} scope="col" className="border-b border-[#e3e9f0] px-2 pb-2 text-left font-medium text-[#6e859e]">{head}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.affiliated.map((row) => (
                  <tr key={row.businessName}>
                    <td className="border-b border-[#eef2f6] px-2 py-2.5 font-semibold text-[#1b2a3a]">{row.businessName}</td>
                    <td className="border-b border-[#eef2f6] px-2 py-2.5 text-[#1b2a3a]">{row.ownerName ?? "Belum diisi"}</td>
                    <td className="border-b border-[#eef2f6] px-2 py-2.5 text-[#6e859e]">{row.sector}</td>
                    <td className="border-b border-[#eef2f6] px-2 py-2.5 text-[#6e859e]">{row.recordingActivity}</td>
                    <td className="border-b border-[#eef2f6] px-2 py-2.5 text-[#6e859e]">{row.legalComplete ? "Lengkap" : "Belum lengkap"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.affiliatedTotal > data.cap && <p className="mt-3 text-xs text-[#6e859e]">Menampilkan {data.cap} pertama dari {data.affiliatedTotal}.</p>}
          </div>}
    </DashboardPanel>

    <DashboardPanel>
      <PanelHeader
        title={data.anonymousSuppressed ? "Belum memilih pembina" : `Belum memilih pembina · ${data.anonymousTotal}`}
        description="Usaha yang belum memilih lembaga pembina tampil sebagai kode, selamanya — bukan sampai diminta. Siaran pendampingan adalah cara menjangkau mereka tanpa perlu identitasnya."
      />
      {data.anonymousSuppressed
        ? <div className="px-5 pb-5">
            <FeedbackBanner tone="info" title="Daftarnya tidak ditampilkan untuk kelompok ini">
              Kelompok yang berisi kurang dari {data.minCell} usaha yang belum memilih pembina tidak
              menampilkan barisnya, dan jumlahnya juga tidak — menyebut jumlahnya sama dengan menunjuk
              usahanya. Kelompok yang berpasangan dengannya ikut ditahan supaya angkanya tidak bisa
              dihitung dengan pengurangan, jadi kelompok ini belum tentu kecil. Pilih kelompok yang
              lebih luas untuk melihat daftarnya.
            </FeedbackBanner>
          </div>
        : data.anonymous.length === 0
          ? <p className="px-5 pb-5 text-xs text-[#6e859e]">Tidak ada usaha di kelompok ini yang belum memilih pembina.</p>
          : <div className="overflow-x-auto px-5 pb-5">
              <table className="w-full min-w-[30rem] border-collapse text-xs">
                <thead><tr>
                  {["Kode", "Bidang", "Kebiasaan mencatat", "Legalitas"].map((head) => (
                    <th key={head} scope="col" className="border-b border-[#e3e9f0] px-2 pb-2 text-left font-medium text-[#6e859e]">{head}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.anonymous.map((row) => (
                    <tr key={row.candidateCode}>
                      <td className="border-b border-[#eef2f6] px-2 py-2.5 font-semibold tabular-nums text-[#1b2a3a]">{row.candidateCode}</td>
                      <td className="border-b border-[#eef2f6] px-2 py-2.5 text-[#6e859e]">{row.sector}</td>
                      <td className="border-b border-[#eef2f6] px-2 py-2.5 text-[#6e859e]">{row.recordingActivity}</td>
                      <td className="border-b border-[#eef2f6] px-2 py-2.5 text-[#6e859e]">{row.legalComplete ? "Lengkap" : "Belum lengkap"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(data.anonymousTotal ?? 0) > data.cap && <p className="mt-3 text-xs text-[#6e859e]">Menampilkan {data.cap} pertama dari {data.anonymousTotal}.</p>}
            </div>}
    </DashboardPanel>
  </DashboardPage>;
}

export default async function RegionSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawBand = typeof params.mencatat === "string" ? params.mencatat : null;
  const rawLegality = typeof params.legalitas === "string" ? params.legalitas : null;

  // Alamat yang tidak dikenal diperlakukan sebagai tanpa penyaring, bukan
  // diteruskan ke fungsi lalu dijawab galat. Kewenangannya tetap dijaga di
  // dalam fungsi; ini hanya soal tidak menakuti orang dengan pesan galat
  // untuk alamat yang salah ketik.
  const band = rawBand && (RECORDING_BANDS as readonly string[]).includes(rawBand) ? rawBand : null;
  const legality = rawLegality === "lengkap" || rawLegality === "belum" ? rawLegality : null;

  const summary = await loadSummary();

  if (summary.state === "forbidden") {
    return <DashboardPage>
      {shellHeader(null)}
      <EmptyState
        icon={ShieldCheck}
        title="Layar ini untuk dinas dengan wilayah kerja"
        description="Lembaga Anda bekerja dengan usaha yang memberi izin satu per satu, bukan dengan angka seluruh kota. Usaha yang bisa Anda ajak ada di layar Temukan."
        action={{ label: "Buka Temukan kandidat", href: "/lembaga" }}
      />
    </DashboardPage>;
  }

  if (summary.state === "unavailable") {
    return <DashboardPage>
      {shellHeader(null)}
      <FeedbackBanner tone="error" title="Angkanya belum bisa dihitung sekarang">
        Muat ulang halaman ini sebentar lagi. Kalau tetap begini, beri tahu pengelola Berkembang.id.
      </FeedbackBanner>
    </DashboardPage>;
  }

  // Wilayah yang belum diisi dibedakan dari kota yang memang kosong. Dasbor
  // yang menampilkan nol untuk keduanya membuat pengelola mengira platformnya
  // kosong, padahal datanyalah yang belum lengkap -- dan orang yang paling
  // bisa melaporkan itu justru yang sedang membuka layar ini.
  if (summary.state === "regionUnknown") {
    return <DashboardPage>
      {shellHeader(null)}
      <FeedbackBanner tone="attention" title="Wilayah kerja lembaga belum diisi">
        Angka di layar ini dibatasi wilayah kerja, jadi wilayahnya harus terisi lebih dulu. Hubungi
        pengelola Berkembang.id untuk mengisikan kota atau kabupaten lembaga Anda. Selama kosong,
        layar ini tidak menampilkan angka apa pun — bukan karena tidak ada usaha di wilayah Anda.
      </FeedbackBanner>
    </DashboardPage>;
  }

  const { region, total, affiliated, recording, legality: legalityBands, matrix, minCell, canDrillDown } = summary;

  // Drill-down hanya dibuka bila kewenangannya memang ada. Pemeriksaan
  // sesungguhnya tetap di dalam fungsinya; ini menghindari memanggil sesuatu
  // yang sudah pasti menolak.
  if (canDrillDown && (band || legality)) {
    const data = await loadDrilldown(band, legality === null ? null : legality === "lengkap");
    return <DrilldownView data={data} band={band} legality={legality === "lengkap" ? "Legalitas lengkap" : legality === "belum" ? "Legalitas belum lengkap" : null} />;
  }

  if (total === 0) {
    return <DashboardPage>
      {shellHeader(region)}
      <EmptyState
        icon={Users}
        title={`Belum ada usaha tercatat di ${region}`}
        description="Begitu pemilik usaha di wilayah Anda mulai mencatat di Berkembang.id, angkanya muncul di sini dengan sendirinya."
      />
    </DashboardPage>;
  }

  return <DashboardPage>
    {shellHeader(region)}

    <section className="grid gap-3 sm:grid-cols-2">
      <MetricCard label={`Usaha tercatat di ${region}`} value={String(total)} helper="Yang sudah mulai memakai Berkembang.id" icon={Users} tone="brand" />
      <MetricCard
        label="Memilih lembaga Anda sebagai pembina"
        value={String(affiliated)}
        helper={affiliated > 0 ? "Namanya muncul saat angka di bawah diklik" : "Belum ada yang memilih, jadi semua angka di sini anonim"}
        icon={Building2}
        tone={affiliated > 0 ? "success" : "neutral"}
      />
    </section>

    {canDrillDown
      ? <p className="text-xs text-[#6e859e]">Setiap angka di bawah bisa diklik untuk melihat daftarnya.</p>
      : <FeedbackBanner tone="info" title="Lembaga Anda melihat angkanya, bukan daftarnya">
          Kewenangan lembaga Anda berhenti pada agregat wilayah. Itu memang cukup untuk memetakan
          keadaan dan menyusun program, dan tidak menuntut dasar hukum tambahan karena tidak ada satu
          pun data pribadi yang dibuka.
        </FeedbackBanner>}

    <div className="grid gap-4 xl:grid-cols-2">
      <DashboardPanel>
        <PanelHeader title="Kebiasaan mencatat" description="Berapa banyak hari usaha itu mencatat dalam 30 hari terakhir." />
        <BandRows rows={recording} total={total} canDrillDown={canDrillDown} hrefFor={(band) => drilldownHref(band, null)} />
      </DashboardPanel>
      <DashboardPanel>
        <PanelHeader title="Kelengkapan legalitas" description="Lengkap berarti tiga jenis dokumen izin yang masih berlaku sudah ada." />
        <BandRows rows={legalityBands} total={total} canDrillDown={canDrillDown} hrefFor={(band) => drilldownHref(null, legalityParam(band))} />
      </DashboardPanel>
    </div>

    <DashboardPanel>
      <PanelHeader
        title="Kebiasaan mencatat dibanding legalitas"
        description="Dua keadaan itu tidak pernah dijumlahkan menjadi satu nilai. Yang berguna adalah silangannya: usaha yang rutin mencatat tetapi legalitasnya belum lengkap paling jelas butuh apa."
      />
      <div className="overflow-x-auto p-5 pt-0">
        <table className="w-full min-w-[28rem] border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className="border-b border-[#e3e9f0] pb-2 pr-3 text-left font-medium text-[#6e859e]">Kebiasaan mencatat</th>
              {legalityBands.map((row) => (
                <th key={row.band} scope="col" className="border-b border-[#e3e9f0] px-3 pb-2 text-right font-medium text-[#6e859e]">{row.band}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recording.map((row) => (
              <tr key={row.band}>
                <th scope="row" className="border-b border-[#eef2f6] py-2.5 pr-3 text-left font-medium text-[#1b2a3a]">{row.band}</th>
                {legalityBands.map((legalityRow) => {
                  const cell = matrix.find((item) => item.recording === row.band && item.legality === legalityRow.band);
                  // Tidak ditulis "< 5". Sel bisa tersembunyi sebagai
                  // PELENGKAP -- untuk menahan pengurangan dari jumlah
                  // barisnya -- dan sel seperti itu bisa bernilai apa saja,
                  // nol maupun enam. Menuliskannya "< 5" akan salah. Dan
                  // membedakan kedua sebab di layar justru membocorkan: tahu
                  // sebuah sel tersembunyi "karena kecil" sama dengan tahu
                  // isinya 1 sampai 4.
                  const value = cell?.suppressed
                    ? <span className="inline-flex items-center gap-1 text-[#9fb0c2]" title="Tidak ditampilkan untuk melindungi kelompok kecil"><EyeOff size={11} aria-hidden /><span aria-hidden>—</span><span className="sr-only">Disembunyikan untuk melindungi identitas</span></span>
                    : <span className="font-semibold text-[#1b2a3a]">{cell?.count ?? 0}</span>;
                  return (
                    <td key={legalityRow.band} className="border-b border-[#eef2f6] px-3 py-2.5 text-right tabular-nums">
                      {canDrillDown
                        ? <Link href={drilldownHref(row.band, legalityParam(legalityRow.band))} className="underline decoration-[#c8d3de] underline-offset-2 hover:decoration-[#0b5f86]">{value}</Link>
                        : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardPanel>

    <FeedbackBanner tone="info" title={`Sebagian angka ditandai — dan itu disengaja`}>
      Kelompok yang berisi kurang dari {minCell} usaha tidak menampilkan jumlahnya: di kelompok
      sekecil itu, menyebut jumlahnya sama dengan menunjuk usahanya, karena orang yang mengenal
      wilayah Anda sudah bisa menduga yang mana. Pasangannya di baris atau kolom yang sama ikut
      ditandai supaya angkanya tidak bisa dihitung dengan pengurangan — jadi angka yang ditandai
      tidak selalu berarti kecil. Usaha yang memilih lembaga Anda sebagai pembina tidak ikut
      dibatasi: identitasnya sudah terbuka atas izin pemiliknya sendiri.
    </FeedbackBanner>
  </DashboardPage>;
}
