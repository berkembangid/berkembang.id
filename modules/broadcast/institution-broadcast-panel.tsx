"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, MapPin, Megaphone, Send, Users } from "lucide-react";
import {
  DashboardPage, DashboardPanel, EmptyState, FeedbackBanner, MetricCard, PageHeader, PanelHeader, StatusBadge,
} from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { audienceLabel } from "@/modules/broadcast/broadcast-messages";

const BANDS = ["Rutin mencatat", "Mulai rutin", "Jarang mencatat", "Belum mulai"] as const;

type BroadcastRow = {
  id: string;
  message: string;
  recordingBand: string | null;
  legalComplete: boolean | null;
  eventDate: string | null;
  eventPlace: string | null;
  eventLink: string | null;
  status: "pending" | "approved" | "rejected";
  reviewReason: string | null;
  createdAt: string;
  deliveredAt: string | null;
  invited: number | null;
  invitedSuppressed: boolean;
  joined: number;
};

type Workspace = {
  region: string;
  quotaMonthly: number;
  quotaLeft: number;
  minCell: number;
  broadcasts: BroadcastRow[];
};

type Audience = { count: number | null; suppressed: boolean; region: string; minCell: number };
type Participant = { businessName: string; ownerName: string | null; sector: string; joinedAt: string };

const STATUS_LABEL: Record<BroadcastRow["status"], { text: string; tone: "attention" | "success" | "neutral" }> = {
  pending: { text: "Menunggu tinjauan", tone: "attention" },
  approved: { text: "Sudah terkirim", tone: "success" },
  rejected: { text: "Tidak disetujui", tone: "neutral" },
};

function tanggal(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Ruang broadcast untuk dinas.
 *
 * Yang perlu dibaca dari layar ini, dan karena itu ditulis di layarnya sendiri
 * bukan hanya di kode: pesan ini tidak langsung terkirim. Dinas yang mengira
 * pesannya sudah sampai lalu menunggu peserta yang tidak pernah datang akan
 * menyimpulkan fiturnya mati -- lalu kembali menelepon satu-satu, yang justru
 * keadaan yang ingin dihindari.
 */
export default function InstitutionBroadcastPanel() {
  const { confirm } = useConfirm();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState("");
  const [band, setBand] = useState<string>("");
  const [legality, setLegality] = useState<string>("");
  const [message, setMessage] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventPlace, setEventPlace] = useState("");
  const [eventLink, setEventLink] = useState("");
  const [audience, setAudience] = useState<Audience | null>(null);
  const [busy, setBusy] = useState(false);
  const [openParticipants, setOpenParticipants] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/institution/broadcasts", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Daftar broadcast belum dapat dimuat.");
    setWorkspace(body.data as Workspace);
  }, []);

  // Ditunda satu putaran, idiom yang sama dengan kartu beranda lain: memanggil
  // `setState` langsung di dalam effect memicu render berantai.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().catch((error) => setLoadError(error instanceof Error ? error.message : "Daftar broadcast belum dapat dimuat."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Jumlah penerima dihitung ulang setiap sasarannya berubah, karena itu satu
  // hal yang paling menentukan isi pesannya.
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (band) params.set("mencatat", band);
    if (legality) params.set("legalitas", legality);
    fetch(`/api/v1/institution/broadcasts/audience?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => { if (ok) setAudience(body.data as Audience); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [band, legality]);

  async function kirim() {
    const sasaran = audienceLabel(band || null, legality === "lengkap" ? true : legality === "belum" ? false : null);
    const jumlah = audience?.suppressed
      ? "Jumlah penerimanya tidak ditampilkan karena kelompoknya kecil."
      : `Pesan ini akan sampai ke ${audience?.count ?? 0} usaha.`;

    const yes = await confirm({
      title: "Ajukan broadcast ini?",
      description: `Sasaran: ${sasaran}. ${jumlah} Pengelola Berkembang.id meninjaunya lebih dulu, dan pesannya baru terkirim setelah disetujui. Pesan yang sudah terkirim tidak bisa ditarik kembali.`,
      confirmLabel: "Ajukan",
      cancelLabel: "Periksa lagi",
    });
    if (!yes) return;

    setBusy(true);
    try {
      const response = await fetch("/api/v1/institution/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          recordingBand: band || null,
          legalComplete: legality === "lengkap" ? true : legality === "belum" ? false : null,
          eventDate: eventDate || null,
          eventPlace: eventPlace || null,
          eventLink: eventLink || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Broadcast belum dapat diajukan.");
      notifySuccess("Broadcast diajukan. Pengelola Berkembang.id akan meninjaunya.");
      setMessage(""); setEventDate(""); setEventPlace(""); setEventLink("");
      await load();
    } catch (error) {
      notifyFromError(error, "Broadcast belum dapat diajukan.");
    } finally {
      setBusy(false);
    }
  }

  async function bukaPeserta(id: string) {
    if (openParticipants === id) { setOpenParticipants(null); return; }
    try {
      const response = await fetch(`/api/v1/institution/broadcasts/${id}/participants`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Daftar peserta belum dapat dimuat.");
      setParticipants(body.data as Participant[]);
      setOpenParticipants(id);
    } catch (error) {
      notifyFromError(error, "Daftar peserta belum dapat dimuat.");
    }
  }

  if (loadError) {
    return <DashboardPage>
      <PageHeader title="Siaran pendampingan" description="Tawaran yang dikirim ke usaha berdasarkan keadaannya, bukan namanya." icon={Megaphone} />
      <FeedbackBanner tone="error" title="Ruang broadcast belum bisa dibuka">{loadError}</FeedbackBanner>
    </DashboardPage>;
  }

  const terlaluPendek = message.trim().length < 20;

  return <DashboardPage>
    <PageHeader
      title="Siaran pendampingan"
      description="Tawaran yang dikirim berdasarkan keadaan usaha, bukan namanya. Nama peserta muncul setelah mereka menekan ikut."
      icon={Megaphone}
    />

    <section className="grid gap-3 sm:grid-cols-2">
      <MetricCard
        label="Sisa kuota bulan ini"
        value={workspace ? `${workspace.quotaLeft} dari ${workspace.quotaMonthly}` : "—"}
        helper="Kuotanya kembali pada awal bulan berikutnya"
        icon={Send}
        tone={workspace && workspace.quotaLeft === 0 ? "attention" : "brand"}
      />
      <MetricCard
        label="Akan menerima pesan ini"
        value={audience ? (audience.suppressed ? "Tidak ditampilkan" : `${audience.count} usaha`) : "—"}
        helper={audience?.suppressed
          ? `Kelompok berisi kurang dari ${audience.minCell} usaha tidak melaporkan jumlahnya — pesannya tetap sampai`
          : "Dihitung ulang setiap sasarannya diubah"}
        icon={Users}
        tone="neutral"
      />
    </section>

    <DashboardPanel>
      <PanelHeader
        title="Tulis tawaran baru"
        description="Bawaannya semua usaha di wilayah Anda. Menyempitkan sasaran tidak menyentuh satu nama pun — yang disaring adalah keadaan, bukan orangnya."
      />
      <div className="grid gap-4 p-5 pt-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-[#1b2a3a]">Kebiasaan mencatat
            <select
              value={band}
              onChange={(event) => setBand(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-normal"
            >
              <option value="">Semua</option>
              {BANDS.map((row) => <option key={row} value={row}>{row}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-[#1b2a3a]">Kelengkapan legalitas
            <select
              value={legality}
              onChange={(event) => setLegality(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-normal"
            >
              <option value="">Semua</option>
              <option value="lengkap">Legalitas lengkap</option>
              <option value="belum">Legalitas belum lengkap</option>
            </select>
          </label>
        </div>

        <label className="text-xs font-bold text-[#1b2a3a]">Pesan Anda
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="Contoh: Pendampingan pembukuan gratis, Sabtu 20 September, Balai Kota. Bawa catatan penjualan sebulan terakhir."
            className="mt-1.5 w-full rounded-xl border border-[#c8d3de] bg-white p-3 text-xs font-normal leading-relaxed"
          />
          <span className="mt-1 block text-[10px] font-medium text-[#6e859e]">
            {message.trim().length} dari 1.000 huruf{terlaluPendek && " · minimal 20 huruf"}
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-[#1b2a3a]">Tanggal acara (opsional)
            <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-normal" />
          </label>
          <label className="text-xs font-bold text-[#1b2a3a]">Tempat (opsional)
            <input value={eventPlace} onChange={(event) => setEventPlace(event.target.value)} maxLength={160}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-normal" />
          </label>
          <label className="text-xs font-bold text-[#1b2a3a]">Tautan pendaftaran (opsional)
            <input value={eventLink} onChange={(event) => setEventLink(event.target.value)} maxLength={300}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-normal" />
          </label>
        </div>

        <FeedbackBanner tone="info" title="Pesan ini tidak langsung terkirim">
          Pengelola Berkembang.id meninjaunya lebih dulu. Setelah disetujui, pesannya langsung sampai ke
          beranda usaha yang menjadi sasaran — dan nama mereka baru terlihat oleh Anda setelah mereka
          menekan &ldquo;Saya ikut&rdquo;.
        </FeedbackBanner>

        <button
          type="button"
          onClick={() => void kirim()}
          disabled={busy || terlaluPendek || (workspace?.quotaLeft ?? 0) === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#0b5f86] px-5 text-xs font-bold text-white disabled:opacity-50"
        >
          <Send size={15} /> {busy ? "Mengajukan..." : "Ajukan broadcast"}
        </button>
      </div>
    </DashboardPanel>

    <DashboardPanel>
      <PanelHeader title="Broadcast yang pernah diajukan" description="Beserta berapa yang menerima dan berapa yang menyatakan ikut." />
      {!workspace || workspace.broadcasts.length === 0
        ? <div className="p-5 pt-0">
            <EmptyState icon={Megaphone} title="Belum ada broadcast" description="Tawaran pertama Anda akan muncul di sini setelah diajukan." />
          </div>
        : <ul className="divide-y divide-[#eef2f6]">
            {workspace.broadcasts.map((row) => (
              <li key={row.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={STATUS_LABEL[row.status].tone}>{STATUS_LABEL[row.status].text}</StatusBadge>
                  <span className="text-[10px] font-medium text-[#6e859e]">
                    {audienceLabel(row.recordingBand, row.legalComplete)} · diajukan {tanggal(row.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#1b2a3a]">{row.message}</p>
                {(row.eventDate || row.eventPlace) && <p className="mt-1.5 flex flex-wrap gap-3 text-[10px] font-medium text-[#6e859e]">
                  {row.eventDate && <span className="inline-flex items-center gap-1"><Calendar size={11} /> {tanggal(row.eventDate)}</span>}
                  {row.eventPlace && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {row.eventPlace}</span>}
                </p>}
                {row.status === "rejected" && row.reviewReason && (
                  <p className="mt-2 text-xs text-[#5c3700]">Catatan pengelola: {row.reviewReason}</p>
                )}
                {row.status === "approved" && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-semibold text-[#1b2a3a]">
                      {row.invitedSuppressed ? "Jumlah penerima tidak ditampilkan" : `${row.invited} menerima`}
                    </span>
                    <span className="font-semibold text-[#0a5c42]">{row.joined} menyatakan ikut</span>
                    {row.joined > 0 && (
                      <button type="button" onClick={() => void bukaPeserta(row.id)} className="font-bold text-[#0b5f86] underline underline-offset-2">
                        {openParticipants === row.id ? "Sembunyikan peserta" : "Lihat peserta"}
                      </button>
                    )}
                  </div>
                )}
                {openParticipants === row.id && (
                  <ul className="mt-3 divide-y divide-[#eef2f6] rounded-xl border border-[#e3e9f0]">
                    {participants.map((person) => (
                      <li key={person.businessName} className="px-3 py-2 text-xs">
                        <span className="font-semibold text-[#1b2a3a]">{person.businessName}</span>
                        <span className="text-[#6e859e]"> · {person.ownerName ?? "Pemilik belum mengisi nama"} · {person.sector}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>}
    </DashboardPanel>

    {workspace && <p className="text-xs text-[#6e859e]">
      Kelompok yang berisi kurang dari {workspace.minCell} usaha tidak melaporkan jumlah penerimanya.
      Pesannya tetap sampai; yang ditahan hanya angkanya, supaya kelompok sekecil itu tidak menjadi
      cara menunjuk usaha tertentu.
    </p>}
  </DashboardPage>;
}
