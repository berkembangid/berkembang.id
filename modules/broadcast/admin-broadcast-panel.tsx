"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Check, Clock3, MapPin, Megaphone, ShieldX, Users } from "lucide-react";
import {
  DashboardPage, DashboardPanel, EmptyState, FeedbackBanner, MetricCard, PageHeader, PanelHeader, StatusBadge,
} from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { audienceLabel } from "@/modules/broadcast/broadcast-messages";

type PendingRow = {
  id: string;
  institutionName: string;
  region: string;
  message: string;
  recordingBand: string | null;
  legalComplete: boolean | null;
  eventDate: string | null;
  eventPlace: string | null;
  eventLink: string | null;
  audienceEstimate: number;
  audienceNow: number;
  createdAt: string;
};

function umur(value: string): { text: string; tone: "neutral" | "attention" | "alert" } {
  const jam = Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000);
  if (jam < 24) return { text: `${Math.max(jam, 0)} jam menunggu`, tone: "neutral" };
  const hari = Math.floor(jam / 24);
  // Broadcast yang menunggu tiga hari membuat dinas menyimpulkan fiturnya mati,
  // lalu kembali menelepon satu-satu -- keadaan yang justru mau dihindari.
  return { text: `${hari} hari menunggu`, tone: hari >= 2 ? "alert" : "attention" };
}

function tanggal(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Antrean tinjauan broadcast.
 *
 * Umur permintaan ditampilkan lebih menonjol daripada isinya, dan itu
 * disengaja: yang membuat fitur ini gagal bukan keputusan yang salah,
 * melainkan keputusan yang tidak pernah diambil.
 */
export default function AdminBroadcastPanel() {
  const { confirmWithReason } = useConfirm();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/admin/broadcasts", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Antrean broadcast belum dapat dimuat.");
    setRows(body.data as PendingRow[]);
  }, []);

  // Ditunda satu putaran, idiom yang sama dengan kartu beranda lain: memanggil
  // `setState` langsung di dalam effect memicu render berantai.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().catch((error) => setLoadError(error instanceof Error ? error.message : "Antrean broadcast belum dapat dimuat."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function putuskan(row: PendingRow, approve: boolean) {
    // Menyetujui langsung MENGIRIM, dan pesan yang sudah sampai tidak bisa
    // ditarik. Karena itu akibatnya disebut dengan angkanya, bukan disamarkan
    // menjadi "lanjutkan?".
    const alasan = approve
      ? await confirmWithReason({
          title: `Setujui dan kirim ke ${row.audienceNow} usaha?`,
          description: `${row.institutionName} · ${row.region}. Pesannya langsung sampai ke beranda mereka dan tidak bisa ditarik kembali.`,
          confirmLabel: "Setujui dan kirim",
          cancelLabel: "Baca lagi",
          reasonLabel: "Alasan keputusan",
          reasonPlaceholder: "Contoh: sesuai kepentingan pembinaan, isi pesan wajar",
        })
      : await confirmWithReason({
          title: "Tidak setujui broadcast ini?",
          description: `Alasannya akan terbaca oleh ${row.institutionName}, jadi tulis yang bisa ditindaklanjuti.`,
          confirmLabel: "Simpan keputusan",
          cancelLabel: "Baca lagi",
          tone: "danger",
          reasonLabel: "Alasan",
          reasonPlaceholder: "Contoh: pesannya memuat ajakan di luar pendampingan usaha",
        });
    if (alasan === null) return;

    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broadcastId: row.id, approve, reason: alasan }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Keputusannya belum dapat disimpan.");
      notifySuccess(approve
        ? `Terkirim ke ${body.data.delivered} usaha.`
        : "Keputusan tersimpan, dan alasannya sudah terbaca lembaga.");
      await load();
    } catch (error) {
      notifyFromError(error, "Keputusannya belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <DashboardPage>
      <PageHeader title="Tinjauan broadcast" description="Tawaran pendampingan dari dinas, sebelum sampai ke UMKM." icon={Megaphone} />
      <FeedbackBanner tone="error" title="Antrean belum bisa dibuka">{loadError}</FeedbackBanner>
    </DashboardPage>;
  }

  const tertua = rows[0] ? umur(rows[0].createdAt) : null;

  return <DashboardPage>
    <PageHeader
      title="Tinjauan broadcast"
      description="Tawaran pendampingan dari dinas. Menyetujui berarti langsung mengirim — pesan yang sudah sampai tidak bisa ditarik."
      icon={Megaphone}
    />

    <section className="grid gap-3 sm:grid-cols-2">
      <MetricCard label="Menunggu tinjauan" value={String(rows.length)} helper="Seluruh lembaga" icon={Clock3}
        tone={rows.length > 0 ? "attention" : "success"} />
      <MetricCard label="Paling lama menunggu" value={tertua ? tertua.text : "—"}
        helper="Dinas yang menunggu terlalu lama akan kembali menelepon satu-satu" icon={Users}
        tone={tertua?.tone === "alert" ? "attention" : "neutral"} />
    </section>

    <DashboardPanel>
      <PanelHeader title="Antrean" description="Urut dari yang paling lama menunggu." />
      {rows.length === 0
        ? <div className="p-5 pt-0">
            <EmptyState icon={Check} title="Antrean bersih" description="Tidak ada broadcast yang menunggu keputusan." />
          </div>
        : <ul className="divide-y divide-[#eef2f6]">
            {rows.map((row) => {
              const usia = umur(row.createdAt);
              return (
                <li key={row.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={usia.tone === "alert" ? "alert" : usia.tone}>{usia.text}</StatusBadge>
                    <span className="text-xs font-bold text-[#1b2a3a]">{row.institutionName}</span>
                    <span className="text-[10px] font-medium text-[#6e859e]">{row.region}</span>
                  </div>

                  <p className="mt-2 whitespace-pre-line rounded-xl bg-[#f8fafc] p-3 text-xs leading-relaxed text-[#1b2a3a]">
                    {row.message}
                  </p>

                  <p className="mt-2 flex flex-wrap gap-3 text-[10px] font-medium text-[#6e859e]">
                    <span>Sasaran: {audienceLabel(row.recordingBand, row.legalComplete)}</span>
                    {row.eventDate && <span className="inline-flex items-center gap-1"><Calendar size={11} /> {tanggal(row.eventDate)}</span>}
                    {row.eventPlace && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {row.eventPlace}</span>}
                    {row.eventLink && <span className="break-all">{row.eventLink}</span>}
                  </p>

                  <p className="mt-2 text-xs text-[#1b2a3a]">
                    Akan sampai ke <strong className="font-bold">{row.audienceNow} usaha</strong> bila disetujui sekarang.
                    {row.audienceNow !== row.audienceEstimate && (
                      <span className="text-[#6e859e]"> Saat diajukan jumlahnya {row.audienceEstimate} — keadaan usaha berubah sejak itu.</span>
                    )}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void putuskan(row, true)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50">
                      <Check size={14} /> Setujui dan kirim
                    </button>
                    <button type="button" disabled={busy} onClick={() => void putuskan(row, false)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#c8d3de] px-4 text-xs font-bold text-[#34496a] disabled:opacity-50">
                      <ShieldX size={14} /> Tidak setujui
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>}
    </DashboardPanel>
  </DashboardPage>;
}
