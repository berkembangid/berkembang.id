"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarCheck, CheckCircle2, ChevronRight, CircleEllipsis, FileText, Mic, Plus, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ReminderStrip } from "@/components/warung/ReminderStrip";
import { ReclassCard } from "@/components/warung/ReclassCard";
import type { ReadinessView } from "@/modules/readiness/readiness-schema";
import styles from "../umkm-dashboard.module.css";

type TransactionRow = { id: string; direction: string | null; type: string | null; amount_idr: number | null; nominal: number | null; item: string; transaction_date: string | null; created_at: string };
type CaptureRow = { id: string; status: string; failure_message: string | null; updated_at: string };
type DocumentRow = { id: string; name: string; doc_type: string; status: string; updated_at: string };
type RequestRow = { id: string; purpose: string; status: string; created_at: string };
type ActionItem = { id: string; title: string; description: string; href: string };
type ActivityItem = { id: string; title: string; detail: string; at: string; href: string };

function transactionDirection(row: TransactionRow) { return row.direction ?? (row.type === "masuk" ? "income" : "expense"); }
function transactionAmount(row: TransactionRow) { return Number(row.amount_idr ?? row.nominal ?? 0); }
function formatTime(value: string) { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatIdr(value: number) { return `Rp${value.toLocaleString("id-ID")}`; }

export default function BerandaPage() {
  const [name, setName] = useState("Pengguna");
  const [readiness, setReadiness] = useState<ReadinessView | null>(null);
  const [todayTransactions, setTodayTransactions] = useState<TransactionRow[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sesi berakhir. Silakan masuk kembali.");
        const today = new Date().toISOString().slice(0, 10);
        const [profile, todayResult, recentResult, captureResult, documentResult, requestResult, readinessResponse] = await Promise.all([
          supabase.from("profiles").select("name,nama_pemilik,nama_usaha").eq("auth_user_id", user.id).maybeSingle(),
          supabase.from("transactions").select("id,direction,type,amount_idr,nominal,item,transaction_date,created_at").eq("transaction_date", today).neq("ledger_status", "cancelled"),
          supabase.from("transactions").select("id,direction,type,amount_idr,nominal,item,transaction_date,created_at").neq("ledger_status", "cancelled").order("created_at", { ascending: false }).limit(5),
          supabase.from("transaction_captures").select("id,status,failure_message,updated_at").in("status", ["draft", "queued", "processing", "needs_review", "failed"]).order("updated_at", { ascending: false }).limit(5),
          supabase.from("documents").select("id,name,doc_type,status,updated_at").neq("status", "superseded").order("updated_at", { ascending: false }).limit(5),
          supabase.from("dossier_requests").select("id,purpose,status,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
          fetch("/api/v1/readiness", { cache: "no-store" }),
        ]);
        if (!active) return;
        setName(profile.data?.name ?? profile.data?.nama_pemilik ?? user.user_metadata?.nama_pemilik ?? user.email?.split("@")[0] ?? "Pengguna");
        setTodayTransactions((todayResult.data ?? []) as TransactionRow[]);
        const readinessPayload = readinessResponse.ok ? await readinessResponse.json() as { data?: ReadinessView } : null;
        const readinessData = readinessPayload?.data ?? null;
        setReadiness(readinessData);

        const captures = (captureResult.data ?? []) as CaptureRow[];
        const documents = (documentResult.data ?? []) as DocumentRow[];
        const requests = (requestResult.data ?? []) as RequestRow[];
        const required: ActionItem[] = [];
        for (const capture of captures) {
          if (capture.status === "needs_review") required.push({ id: `capture-${capture.id}`, title: "Periksa catatan sebelum disimpan", description: "Hasil suara menunggu pemeriksaan Anda.", href: "/umkm/catat" });
          else if (capture.status === "failed") required.push({ id: `capture-${capture.id}`, title: "Catatan belum berhasil dibaca", description: capture.failure_message ?? "Coba kembali atau tulis secara manual.", href: "/umkm/catat" });
          else required.push({ id: `capture-${capture.id}`, title: "Catatan masih diproses", description: "Buka kembali untuk melihat perkembangan terbaru.", href: "/umkm/catat" });
        }
        for (const document of documents.filter((item) => item.status === "processing" || item.status === "rejected")) {
          required.push({ id: `document-${document.id}`, title: document.status === "rejected" ? "Dokumen perlu diganti" : "Dokumen sedang dibaca", description: document.name, href: "/umkm/upload" });
        }
        for (const request of requests) required.push({ id: `request-${request.id}`, title: "Ada permintaan akses data", description: request.purpose, href: "/umkm/profil" });
        setActions(required.slice(0, 5));

        const realActivities: ActivityItem[] = ((recentResult.data ?? []) as TransactionRow[]).map((row) => ({
          id: `transaction-${row.id}`,
          title: transactionDirection(row) === "income" ? "Pemasukan tercatat" : "Pengeluaran tercatat",
          detail: `${row.item} · ${formatIdr(transactionAmount(row))}`,
          at: row.created_at,
          href: "/umkm/laporan",
        }));
        for (const document of documents) realActivities.push({ id: `document-${document.id}`, title: "Dokumen diperbarui", detail: document.name, at: document.updated_at, href: "/umkm/upload" });
        if (readinessData) realActivities.push({ id: `readiness-${readinessData.snapshotId}`, title: "Kesiapan data dihitung", detail: `${Math.round(readinessData.score)} dari 100 · ${readinessData.changeReason}`, at: readinessData.calculatedAt, href: "/umkm/roadmap" });
        setActivities(realActivities.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Beranda belum dapat dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const income = todayTransactions.filter((row) => transactionDirection(row) === "income").reduce((sum, row) => sum + transactionAmount(row), 0);
  const expense = todayTransactions.filter((row) => transactionDirection(row) === "expense").reduce((sum, row) => sum + transactionAmount(row), 0);
  const cashFlow = income - expense;
  const score = Math.max(0, Math.min(100, Math.round(readiness?.score ?? 0)));
  const scoreStyle = { "--score": `${score}%` } as CSSProperties;

  return (
    <main className={styles.page}>
      <div className={styles.mobileOnly}>
        <div className={styles.mobileStack}>
          <header>
            <p className={styles.greeting}>Selamat datang, {name}</p>
            <h1 className={styles.mobileTitle}>Keuangan usaha hari ini</h1>
          </header>

          {error && <div role="alert" className="flex gap-2 rounded-2xl border border-[#f4b0a8] bg-[#feecea] p-4 text-xs text-[#8a1c12]"><AlertCircle size={17} />{error}</div>}

          <section aria-labelledby="cash-flow-title" className={styles.balanceCard}>
            <p className={styles.eyebrow}>Arus kas hari ini</p>
            <h2 id="cash-flow-title" className={styles.balance}>{cashFlow < 0 ? "−" : ""}{formatIdr(Math.abs(cashFlow))}</h2>
            <div className={styles.balanceMeta}>
              <span className={styles.balancePill}>{todayTransactions.length} catatan</span>
              <span>Masuk {formatIdr(income)}</span>
            </div>
            <div className={styles.quickActions}>
              <Link href="/umkm/catat" className={styles.quickAction}><Plus size={16} /> Catat uang</Link>
              <Link href="/umkm/laporan?tutup-kas=1" className={styles.quickAction}><CalendarCheck size={15} /> Tutup kas</Link>
              <Link href="/umkm/catat" aria-label="Pilihan catat lainnya" className={`${styles.quickAction} ${styles.quickActionRound}`}><CircleEllipsis size={18} /></Link>
            </div>
          </section>

          {/*
            Pengingat berada di sini, bukan di halaman Laporan. Tutup kas dan
            hitung stok adalah pekerjaan HARI INI, dan Beranda satu-satunya
            halaman yang pemilik buka setiap hari.
          */}
          <ReminderStrip />

          <ReclassCard />

          <section aria-labelledby="activity-mobile-title" className={styles.whiteCard}>
            <div className={styles.sectionHeader}>
              <h2 id="activity-mobile-title" className={styles.sectionTitle}>Aktivitas</h2>
              <Link href="/umkm/laporan" className={styles.sectionLink}>Lihat semua</Link>
            </div>
            {loading ? <p role="status" className="py-8 text-center text-xs text-[#6e859e]">Menyiapkan aktivitas...</p> : activities.length === 0 ? <EmptyActivity /> : activities.slice(0, 4).map((item) => <ActivityRow key={item.id} item={item} />)}
          </section>

          <section aria-labelledby="journey-mobile-title" className={`${styles.whiteCard} ${styles.journeyCard}`}>
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow} style={{ color: "#0f73a3" }}>Perjalanan usaha</p><h2 id="journey-mobile-title" className={styles.sectionTitle}>Kesiapan data</h2></div>
              <Link href="/umkm/roadmap" className={styles.sectionLink}>Detail</Link>
            </div>
            <div className={styles.scoreRow}>
              <div className={styles.scoreRing} style={scoreStyle}><strong>{readiness ? score : "—"}</strong></div>
              <div className={styles.mission}>
                <strong>{readiness?.primaryMission?.title ?? "Semua langkah utama sudah didukung data"}</strong>
                <p>{readiness?.primaryMission?.description ?? readiness?.changeReason ?? "Lanjutkan kebiasaan mencatat agar ringkasan usaha tetap lengkap."}</p>
                <Link href={readiness?.primaryMission?.href ?? "/umkm/roadmap"} className="mt-3 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#0b5f86]">Lanjutkan <ChevronRight size={12} /></Link>
              </div>
            </div>
          </section>

          <section aria-labelledby="actions-mobile-title" className={styles.whiteCard}>
            <div className={styles.sectionHeader}><h2 id="actions-mobile-title" className={styles.sectionTitle}>Perlu perhatian</h2><span className="text-[10px] text-[#9fb0c2]">{actions.length} item</span></div>
            {loading ? <p className="py-5 text-center text-xs text-[#6e859e]">Memeriksa data...</p> : actions.length === 0 ? <div className="flex items-center gap-2 py-4 text-xs text-[#0b7a55]"><CheckCircle2 size={17} /> Semua beres untuk saat ini.</div> : actions.slice(0, 3).map((item) => <ActionRow key={item.id} item={item} />)}
          </section>
        </div>
      </div>

      <div className={styles.desktopOnly}>
        <div className={styles.desktopPage}>
          <header>
            <h1 className={styles.desktopHeading}>Ringkasan usaha</h1>
            <p className={styles.desktopSubheading}>Pantau arus kas, catatan, dan kesiapan data usaha Anda dalam satu tempat.</p>
          </header>

          {error && <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-[#f4b0a8] bg-[#feecea] p-4 text-xs text-[#8a1c12]"><AlertCircle size={17} />{error}</div>}

          <div className="mt-5">
            <ReminderStrip />
          </div>

          <section aria-label="Ringkasan hari ini" className={styles.kpiGrid}>
            <KpiCard label="Arus kas hari ini" value={formatIdr(cashFlow)} meta="Pemasukan dikurangi pengeluaran" Icon={WalletCards} tone="neutral" />
            <KpiCard label="Uang masuk" value={formatIdr(income)} meta="Dari catatan hari ini" Icon={ArrowDownLeft} tone="positive" />
            <KpiCard label="Uang keluar" value={formatIdr(expense)} meta="Belanja dan biaya hari ini" Icon={ArrowUpRight} tone="neutral" />
            <KpiCard label="Kesiapan data" value={readiness ? `${score}/100` : "—"} meta={readiness?.scoreChange ? `${readiness.scoreChange > 0 ? "+" : ""}${Math.round(readiness.scoreChange)} poin dari sebelumnya` : "Berdasarkan bukti tersedia"} Icon={ShieldCheck} tone="positive" />
          </section>

          <div className={styles.desktopGrid}>
            <section aria-labelledby="activity-desktop-title" className={styles.panel}>
              <div className={styles.panelHeader}><div><h2 id="activity-desktop-title" className={styles.panelTitle}>Aktivitas terbaru</h2><p className="mt-1 text-[10px] text-[#6e859e]">Catatan dan perubahan terbaru di usaha Anda</p></div><Link href="/umkm/laporan" className="rounded-lg border border-[#e3e9f0] px-3 py-2 text-[10px] font-bold text-[#34496a]">Buka laporan</Link></div>
              <div className={styles.panelBody}>{loading ? <p className="py-10 text-center text-xs text-[#6e859e]">Menyiapkan aktivitas...</p> : activities.length === 0 ? <EmptyActivity /> : activities.map((item) => <ActivityRow key={item.id} item={item} />)}</div>
            </section>

            <section aria-labelledby="action-desktop-title" className={styles.panel}>
              <div className={styles.panelHeader}><div><h2 id="action-desktop-title" className={styles.panelTitle}>Perlu perhatian</h2><p className="mt-1 text-[10px] text-[#6e859e]">{actions.length} hal untuk ditinjau</p></div><Sparkles size={16} className="text-[#1590c7]" /></div>
              <div className={styles.panelBody}>{loading ? <p className="py-10 text-center text-xs text-[#6e859e]">Memeriksa data...</p> : actions.length === 0 ? <div className="flex items-center gap-2 py-8 text-xs text-[#0b7a55]"><CheckCircle2 size={17} /> Semua beres untuk saat ini.</div> : actions.map((item) => <ActionRow key={item.id} item={item} />)}</div>
            </section>

            <section aria-labelledby="mission-desktop-title" className={`${styles.panel} ${styles.fullWidth}`}>
              <div className={styles.panelHeader}><div><h2 id="mission-desktop-title" className={styles.panelTitle}>Langkah usaha berikutnya</h2><p className="mt-1 text-[10px] text-[#6e859e]">Rekomendasi berdasarkan data yang sudah tersedia</p></div><Link href="/umkm/roadmap" className="text-[10px] font-bold text-[#0b5f86]">Lihat perjalanan</Link></div>
              <div className="grid gap-5 p-5 lg:grid-cols-[120px_1fr_auto] lg:items-center">
                <div className={styles.scoreRing} style={scoreStyle}><strong>{readiness ? score : "—"}</strong></div>
                <div><p className="text-sm font-bold text-[#1b2a3a]">{readiness?.primaryMission?.title ?? "Data utama usaha sudah lengkap"}</p><p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#6e859e]">{readiness?.primaryMission?.description ?? readiness?.changeReason ?? "Terus catat transaksi yang benar-benar terjadi agar ringkasan tetap terbaru."}</p></div>
                <Link href={readiness?.primaryMission?.href ?? "/umkm/roadmap"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white">Lanjutkan <ArrowRight size={14} /></Link>
              </div>
            </section>

            <div className={styles.fullWidth}><ReclassCard /></div>
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiCard({ label, value, meta, Icon, tone }: { label: string; value: string; meta: string; Icon: typeof WalletCards; tone: "positive" | "neutral" }) {
  return <article className={styles.kpi}><div className={styles.kpiTop}><span>{label}</span><Icon size={15} /></div><p className={styles.kpiValue}>{value}</p><p className={`${styles.kpiMeta} ${tone === "positive" ? styles.positive : styles.neutral}`}>{meta}</p></article>;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const isIncome = item.title.toLowerCase().includes("pemasukan");
  return <Link href={item.href} className={styles.activityRow}><span className={styles.activityIcon}>{isIncome ? <ArrowDownLeft size={17} /> : item.title.toLowerCase().includes("pengeluaran") ? <ArrowUpRight size={17} /> : <FileText size={16} />}</span><span className={styles.activityCopy}><strong>{item.title}</strong><small>{item.detail}</small></span><time className={styles.activityTime}>{formatTime(item.at)}</time></Link>;
}

function ActionRow({ item }: { item: ActionItem }) {
  return <Link href={item.href} className={styles.actionRow}><span className={styles.actionDot} /><span className="min-w-0 flex-1"><strong>{item.title}</strong><small className="truncate">{item.description}</small></span><ChevronRight size={14} className="text-[#9fb0c2]" /></Link>;
}

function EmptyActivity() {
  return <div className="flex flex-col items-center py-8 text-center"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef8fd] text-[#0f73a3]"><Mic size={19} /></span><p className="mt-3 text-xs font-bold text-[#34496a]">Belum ada aktivitas usaha</p><Link href="/umkm/catat" className="mt-2 text-[10px] font-bold text-[#0b5f86]">Buat catatan pertama</Link></div>;
}
