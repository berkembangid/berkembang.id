"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, Coins, Gauge, LoaderCircle, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyFromError } from "@/lib/notify";

type Lamp = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  measurable: boolean;
  tone: "ok" | "warn" | "alert" | "idle";
  detail: string;
};

type Quality = {
  sinceDays: number;
  captureTotal: number;
  pathMix: Record<string, number>;
  latencyP50Ms: number;
  latencyP95Ms: number;
  amountViolations: number;
  failedCaptures: number;
};

type Cost = {
  sinceDays: number;
  providers: Array<{
    provider: string;
    model: string;
    runs: number;
    prompt_tokens: number;
    completion_tokens: number;
    failures: number;
  }>;
  errors24h: number;
  queueP95Ms: number;
  dailyTokens: Array<{ hari: string; tokens: number }>;
};

/** Lima menit, sesuai spek §1.4. Hanya baris kesehatan yang menyegarkan sendiri. */
const HEALTH_REFRESH_MS = 5 * 60 * 1000;

const PATH_LABEL: Record<string, string> = {
  TEXT_ONLY: "Ketik",
  WHISPER: "Suara",
  OCR: "Foto nota",
  TIDAK_DIKETAHUI: "Belum bertanda",
};

/**
 * Warna nada.
 *
 * MERAH HANYA UNTUK `alert`, dan `alert` hanya diberikan fungsi basis data
 * kepada kegagalan sistem. Sakelar yang sengaja dimatikan tidak pernah merah;
 * kalau ia merah, orang berhenti membedakan "kami mematikannya" dari
 * "sesuatu rusak".
 */
const TONE_CLASS: Record<Lamp["tone"], string> = {
  ok: "border-[#a9ebd0] bg-[#edfbf5] text-[#0b7a55]",
  warn: "border-[#f0d9a8] bg-[#fdf8ee] text-[#8a6412]",
  alert: "border-[#f0c8c8] bg-[#fdf1f3] text-[#b4304a]",
  idle: "border-[#e3e9f0] bg-slate-50 text-slate-500",
};

function formatMs(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} dtk` : `${Math.round(value)} ms`;
}

function formatCount(value: number) {
  return value.toLocaleString("id-ID");
}

/**
 * Ruang Mesin — baris kesehatan, kualitas AI, dan biaya.
 *
 * Tab Produk (DAU, corong, kohort) sengaja belum ada di sini: ia bersandar pada
 * rollup harian, dan proyek ini belum punya penjadwal apa pun. Menampilkannya
 * dengan angka yang dihitung mendadak saat tab dibuka akan membuat "tren 30
 * hari" berarti "tren sejak halaman ini dimuat". Urutan speknya sendiri
 * menaruh Produk setelah ketiga hal di halaman ini.
 *
 * ANGKA YANG TIDAK ADA SUMBERNYA DITULIS "BELUM DIUKUR", bukan diisi contoh.
 * Dasbor yang pernah sekali saja menampilkan angka karangan tidak akan pernah
 * lagi dipercaya untuk angka yang benar.
 */
export default function RuangMesinPage() {
  const [lamps, setLamps] = useState<Lamp[]>([]);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [cost, setCost] = useState<Cost | null>(null);
  const [tab, setTab] = useState<"quality" | "cost">("quality");
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadHealth = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_health_row");
    if (error) {
      setLoadError("Baris kesehatan belum dapat dibaca. Periksa peran akun Anda.");
      return;
    }
    setLoadError("");
    setLamps((data as unknown as Lamp[]) ?? []);
    setLastRefresh(new Date());
  }, []);

  const loadPanels = useCallback(async () => {
    const [qualityResult, costResult] = await Promise.all([
      supabase.rpc("admin_ai_quality", { p_days: days }),
      supabase.rpc("admin_cost_row", { p_days: days }),
    ]);
    if (!qualityResult.error) setQuality(qualityResult.data as unknown as Quality);
    if (!costResult.error) setCost(costResult.data as unknown as Cost);
  }, [days]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      await Promise.all([loadHealth(), loadPanels()]);
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHealth, loadPanels]);

  // Hanya baris kesehatan yang menyegarkan sendiri. Tab lain menunggu diminta:
  // menyegarkannya diam-diam membuat angka bergeser di bawah mata orang yang
  // sedang membacanya.
  useEffect(() => {
    const interval = window.setInterval(() => void loadHealth(), HEALTH_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadHealth]);

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([loadHealth(), loadPanels()]);
    } catch (cause) {
      notifyFromError(cause, "Dasbor belum dapat dimuat ulang.");
    } finally {
      setRefreshing(false);
    }
  }

  const pathTotal = quality ? Object.values(quality.pathMix).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-extrabold text-[#1b2a3a] md:text-3xl">Ruang Mesin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Apakah mesinnya sehat, apakah pipeline-nya dipercaya, dan berapa tagihannya.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={refreshing}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9] disabled:opacity-50"
        >
          <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} /> Muat ulang
        </button>
      </div>

      {loadError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {loadError}
        </p>
      )}

      {/* ── Baris kesehatan ─────────────────────────────────────────── */}
      <section aria-label="Baris kesehatan">
        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-[#e3e9f0] bg-white p-10 text-sm text-slate-500">
            <LoaderCircle size={18} className="animate-spin" /> Memeriksa mesin…
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {lamps.map((lamp) => (
              <article key={lamp.key} className={`rounded-2xl border p-3.5 ${TONE_CLASS[lamp.tone] ?? TONE_CLASS.idle}`}>
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{lamp.label}</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">
                  {!lamp.measurable || lamp.value === null
                    ? "—"
                    : lamp.unit === "percent"
                      ? `${lamp.value}%`
                      : formatCount(lamp.value)}
                </p>
                <p className="mt-1 text-[11px] leading-snug opacity-90">
                  {lamp.measurable ? lamp.detail : `Belum diukur — ${lamp.detail}`}
                </p>
              </article>
            ))}
          </div>
        )}
        {lastRefresh && (
          <p className="mt-2 text-[11px] text-slate-400">
            Diperbarui {new Intl.DateTimeFormat("id-ID", { timeStyle: "medium" }).format(lastRefresh)} · menyegarkan sendiri tiap 5 menit
          </p>
        )}
      </section>

      {/* ── Tab ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tampilan dasbor" className="flex gap-1 rounded-xl border border-[#e3e9f0] bg-white p-1">
          {([
            { id: "quality", label: "Kualitas AI", Icon: Gauge },
            { id: "cost", label: "Biaya & mesin", Icon: Coins },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
                tab === item.id ? "bg-[#eef8fd] text-[#0b5f86]" : "text-[#6e859e] hover:bg-[#f3f6f9]"
              }`}
            >
              <item.Icon size={14} /> {item.label}
            </button>
          ))}
        </nav>

        <div className="flex gap-1 rounded-xl border border-[#e3e9f0] bg-white p-1">
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`min-h-10 rounded-lg px-3 text-xs font-bold ${
                days === value ? "bg-[#0b5f86] text-white" : "text-[#6e859e] hover:bg-[#f3f6f9]"
              }`}
            >
              {value} hari
            </button>
          ))}
        </div>
      </div>

      {/* ── Kualitas AI ────────────────────────────────────────────── */}
      {tab === "quality" && quality && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Capture" value={formatCount(quality.captureTotal)} hint={`${quality.sinceDays} hari terakhir`} />
            <Kpi label="Ucapan sampai draf (p50)" value={formatMs(quality.latencyP50Ms)} hint="Setengah selesai lebih cepat dari ini" />
            <Kpi label="Ucapan sampai draf (p95)" value={formatMs(quality.latencyP95Ms)} hint="Yang paling lambat pun di bawah ini" />
            <Kpi
              label="Nominal dari model"
              value={formatCount(quality.amountViolations)}
              hint={quality.amountViolations === 0 ? "Nol. Semua angka lahir dari parser." : "Perlu diperiksa sekarang"}
              tone={quality.amountViolations === 0 ? "ok" : "alert"}
            />
          </div>

          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-card sm:p-5">
            <h2 className="text-sm font-bold text-[#1b2a3a]">Bauran jalur catat</h2>
            <p className="mt-0.5 text-xs text-slate-500">Berapa banyak yang lewat ketik, suara, dan foto nota.</p>
            {pathTotal === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Belum ada capture pada rentang ini.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {Object.entries(quality.pathMix)
                  .sort(([, left], [, right]) => right - left)
                  .map(([path, count]) => (
                    <div key={path}>
                      <div className="flex justify-between gap-3 text-xs">
                        <span className="font-semibold text-[#4a6280]">{PATH_LABEL[path] ?? path}</span>
                        <span className="font-bold tabular-nums text-[#1b2a3a]">
                          {formatCount(count)} · {Math.round((count / pathTotal) * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#eef2f6]">
                        <div
                          className="h-full rounded-full bg-[#1590c7]"
                          style={{ width: `${Math.max(3, Math.round((count / pathTotal) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <NotMeasured
            title="Belum diukur"
            items={[
              ["Simpan tanpa edit", "Menuntut perbandingan draf dengan hasil akhir; perbandingan itu belum disimpan."],
              ["Edit nominal vs kategori", "Sumber yang sama dengan di atas."],
              ["Alasan draf butuh isian", "Alasannya belum dicatat sebagai kolom tersendiri."],
            ]}
          />
        </div>
      )}

      {/* ── Biaya & mesin ──────────────────────────────────────────── */}
      {tab === "cost" && cost && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi
              label="Token AI"
              value={formatCount(cost.dailyTokens.reduce((sum, day) => sum + Number(day.tokens), 0))}
              hint={`${cost.sinceDays} hari terakhir, seluruh platform`}
            />
            <Kpi
              label="Kegagalan penyedia 24 jam"
              value={formatCount(cost.errors24h)}
              hint={cost.errors24h === 0 ? "Bersih" : "Periksa panel penyedia"}
              tone={cost.errors24h === 0 ? "ok" : cost.errors24h >= 10 ? "alert" : "warn"}
            />
            <Kpi label="Umur antrean (p95)" value={formatMs(cost.queueP95Ms)} hint="Dari masuk antrean sampai dikerjakan" />
          </div>

          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-card sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#1b2a3a]">
              <Activity size={15} className="text-slate-400" /> Pemakaian per model
            </h2>
            {cost.providers.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Belum ada pemanggilan pada rentang ini.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="pb-2 font-bold">Penyedia</th>
                      <th className="pb-2 font-bold">Model</th>
                      <th className="pb-2 text-right font-bold">Panggilan</th>
                      <th className="pb-2 text-right font-bold">Token</th>
                      <th className="pb-2 text-right font-bold">Gagal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f6]">
                    {cost.providers.map((row) => (
                      <tr key={`${row.provider}-${row.model}`}>
                        <td className="py-2 font-semibold text-[#1b2a3a]">{row.provider}</td>
                        <td className="py-2 font-mono text-[11px] text-slate-500">{row.model}</td>
                        <td className="py-2 text-right tabular-nums">{formatCount(row.runs)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatCount(Number(row.prompt_tokens) + Number(row.completion_tokens))}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${row.failures > 0 ? "font-bold text-[#b4304a]" : ""}`}>
                          {formatCount(row.failures)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <NotMeasured
            title="Belum diukur"
            items={[
              ["Biaya dalam rupiah", "Tarif per token berbeda per model dan berubah tanpa memberi tahu. Yang kita ukur token; mengalikannya pekerjaan yang tahu tarif hari ini."],
              ["Penyimpanan per rak", "Ukuran bucket tidak terbaca dari basis data."],
              ["PDF diterbitkan", "Penerbitan PDF belum dicatat sebagai peristiwa."],
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "plain" | "ok" | "warn" | "alert";
}) {
  const toneClass =
    tone === "ok" ? "text-[#0b7a55]" : tone === "alert" ? "text-[#b4304a]" : tone === "warn" ? "text-[#8a6412]" : "text-[#1b2a3a]";
  return (
    <article className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>
    </article>
  );
}

/**
 * Daftar metrik yang belum punya sumber.
 *
 * Ditampilkan, bukan disembunyikan. Metrik yang hilang diam-diam akan
 * ditanyakan lagi tiga bulan lagi oleh orang yang mengira kita lupa; metrik
 * yang tertulis "belum diukur" beserta alasannya menjawab pertanyaan itu
 * sebelum ditanyakan.
 */
function NotMeasured({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <section className="rounded-2xl border border-dashed border-[#c8d3de] bg-slate-50/60 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-slate-600">{title}</h2>
      <ul className="mt-2 space-y-2">
        {items.map(([name, why]) => (
          <li key={name} className="text-xs leading-relaxed">
            <span className="font-bold text-slate-700">{name}</span>
            <span className="text-slate-500"> — {why}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
