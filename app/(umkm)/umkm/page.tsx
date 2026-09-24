"use client";

import { useEffect, useState } from "react";
import { ReadinessMiniCard } from "@/components/warung/ReadinessMiniCard";
import Link from "next/link";
import { AlertCircle, ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarCheck, CheckCircle2, ChevronRight, FileText, Mic, Plus, Sparkles, Type, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { MonthlyTargetCard } from "@/components/warung/MonthlyTargetCard";
import { ReminderStrip } from "@/components/warung/ReminderStrip";
import { closingPromptText, closingTargetDate } from "@/modules/ledger/closing-day";
import { jakartaDate } from "@/modules/ledger/ledger-schema";
import { ReclassCard } from "@/components/warung/ReclassCard";
import { BroadcastInvitations } from "@/components/warung/BroadcastInvitations";
import { DinasOfferCard } from "@/components/warung/DinasOfferCard";
import { SetupChecklist } from "@/components/warung/SetupChecklist";
import { PendingUploadsNotice } from "@/components/warung/PendingUploadsNotice";
import type { ReadinessLevelPayload } from "@/modules/readiness/level-repository";
import styles from "../umkm-dashboard.module.css";

type TransactionRow = { id: string; direction: string | null; type: string | null; amount_idr: number | null; nominal: number | null; item: string; transaction_date: string | null; created_at: string };
type CaptureRow = { id: string; status: string; failure_message: string | null; updated_at: string };
type DocumentRow = { id: string; name: string; doc_type: string; status: string; updated_at: string };
type RequestRow = { id: string; purpose: string; status: string; created_at: string };
type ActionItem = { id: string; title: string; description: string; href: string };
type ActivityItem = { id: string; kind: "income" | "expense" | "document" | "readiness"; title: string; detail: string; at: string; href: string };

function transactionDirection(row: TransactionRow) { return row.direction ?? (row.type === "masuk" ? "income" : "expense"); }
function transactionAmount(row: TransactionRow) { return Number(row.amount_idr ?? row.nominal ?? 0); }
function formatTime(value: string) {
  // Satu stempel waktu yang tidak sah pernah merobohkan seluruh Beranda:
  // `Intl` melempar RangeError, dan React membatalkan render halamannya.
  // Baris aktivitas yang tanggalnya rusak tidak sepadan dengan itu.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Baru saja";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}
function formatIdr(value: number) { return `Rp${value.toLocaleString("id-ID")}`; }
/** Minus di depan "Rp", bukan "Rp-5.000" yang terbaca seperti salah ketik. */
function formatSignedIdr(value: number) { return `${value < 0 ? "−" : ""}${formatIdr(Math.abs(value))}`; }

export default function BerandaPage() {
  const [name, setName] = useState("Pengguna");
  const [readiness, setReadiness] = useState<ReadinessLevelPayload | null>(null);
  const [todayTransactions, setTodayTransactions] = useState<TransactionRow[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [unchecked, setUnchecked] = useState(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasTransactions, setHasTransactions] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sesi berakhir. Silakan masuk kembali.");
        // Tanggal usaha adalah tanggal di Jakarta. `toISOString()` memberi
        // tanggal UTC, sehingga antara pukul 00:00 dan 07:00 WIB kartu "hari
        // ini" menampilkan catatan kemarin.
        const today = jakartaDate();
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
        const readinessPayload = readinessResponse.ok ? await readinessResponse.json() as { data?: ReadinessLevelPayload } : null;
        const readinessData = readinessPayload?.data ?? null;
        setReadiness(readinessData);

        const captures = (captureResult.data ?? []) as CaptureRow[];
        const documents = (documentResult.data ?? []) as DocumentRow[];
        const requests = (requestResult.data ?? []) as RequestRow[];
        const required: ActionItem[] = [];
        for (const capture of captures) {
          if (capture.status === "needs_review") required.push({ id: `capture-${capture.id}`, title: "Periksa catatan sebelum disimpan", description: "Hasil suara menunggu pemeriksaan Anda.", href: "/umkm/catat/periksa" });
          else if (capture.status === "failed") required.push({ id: `capture-${capture.id}`, title: "Catatan belum berhasil dibaca", description: capture.failure_message ?? "Coba kembali atau tulis secara manual.", href: `/umkm/catat?capture=${capture.id}` });
          else required.push({ id: `capture-${capture.id}`, title: "Catatan masih diproses", description: "Buka kembali untuk melihat perkembangan terbaru.", href: `/umkm/catat?capture=${capture.id}` });
        }
        for (const document of documents.filter((item) => item.status === "processing" || item.status === "rejected")) {
          required.push({ id: `document-${document.id}`, title: document.status === "rejected" ? "Dokumen perlu diganti" : "Dokumen sedang dibaca", description: document.name, href: "/umkm/profil/dokumen" });
        }
        for (const request of requests) required.push({ id: `request-${request.id}`, title: "Ada permintaan akses data", description: request.purpose, href: "/umkm/profil/izin#izin-lembaga" });
        setActions(required.slice(0, 5));
        // Kartu uang hari ini hanya menghitung catatan yang SUDAH dikonfirmasi.
        // Tanpa menyebutkan berapa yang belum diperiksa, angkanya terbaca
        // sebagai seluruh hari padahal belum tentu.
        setUnchecked(captures.filter((capture) => capture.status === "needs_review").length);

        const recent = (recentResult.data ?? []) as TransactionRow[];
        setHasTransactions(recent.length > 0);
        // Baris aktivitas membuka Buku Kas dengan catatan itu sudah dicari --
        // dulu semuanya jatuh ke tab ringkasan bulan, bukan ke catatannya.
        const realActivities: ActivityItem[] = recent.map((row) => ({
          id: `transaction-${row.id}`,
          kind: transactionDirection(row) === "income" ? "income" : "expense",
          title: transactionDirection(row) === "income" ? "Pemasukan tercatat" : "Pengeluaran tercatat",
          detail: `${row.item} · ${formatIdr(transactionAmount(row))}`,
          at: row.created_at,
          href: `/umkm/laporan?tab=kas&cari=${encodeURIComponent(row.item)}`,
        }));
        for (const document of documents) realActivities.push({ id: `document-${document.id}`, kind: "document", title: "Dokumen diperbarui", detail: document.name, at: document.updated_at, href: "/umkm/profil/dokumen" });
        if (readinessData?.levelSince) realActivities.push({ id: `readiness-${readinessData.level}-${readinessData.levelSince}`, kind: "readiness", title: `Tingkat kesiapan: ${readinessData.levelName}`, detail: readinessData.levelMeaning, at: `${readinessData.levelSince}T00:00:00+07:00`, href: "/umkm/perjalanan" });
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

  return (
    <main className={styles.page}>
      <div className={styles.mobileOnly}>
        <div className={styles.mobileStack}>
          <header>
            <p className={styles.greeting}>Selamat datang, {name}</p>
            <h1 className={styles.mobileTitle}>Keuangan usaha hari ini</h1>
          </header>

          {error && <div role="alert" className="flex gap-2 rounded-2xl border border-umkm-danger-line bg-umkm-danger-soft p-4 text-xs text-umkm-danger-strong"><AlertCircle size={17} />{error}</div>}

          <section aria-labelledby="cash-flow-title" className={styles.balanceCard}>
            <p className={styles.eyebrow}>Sisa uang hari ini</p>
            <h2 id="cash-flow-title" className={styles.balance}>{formatSignedIdr(cashFlow)}</h2>
            <p className="mt-1 text-xs text-white/75">Dari catatan yang sudah Anda cek</p>
            <div className={styles.balanceMeta}>
              <span className={styles.balancePill}>{todayTransactions.length} catatan</span>
              <span>Masuk {formatIdr(income)}</span>
              <span>Keluar {formatIdr(expense)}</span>
              {unchecked > 0 && (
                <Link href="/umkm/catat" className={styles.balancePill}>
                  {unchecked} belum dicek
                </Link>
              )}
            </div>
            <div className={styles.quickActions}>
              <Link href="/umkm/catat" className={styles.quickAction}><Plus size={16} /> Catat uang</Link>
              <Link
                href={`/umkm/laporan?tab=kas&tutup-kas=${closingTargetDate(new Date())}`}
                className={styles.quickAction}
                title={closingPromptText(new Date())}
              >
                <CalendarCheck size={15} /> Tutup kas
              </Link>
              {/* Dulu tombol « … » yang membawa ke tempat yang sama dengan
                  « Catat uang ». Sekarang jalan pintas ke mode tulis. */}
              <Link href="/umkm/catat?mode=tulis" aria-label="Catat dengan mengetik" className={`${styles.quickAction} ${styles.quickActionRound}`}><Type size={17} aria-hidden /></Link>
            </div>
          </section>

          {/*
            Pengingat berada di sini, bukan di halaman Laporan. Tutup kas dan
            hitung stok adalah pekerjaan HARI INI, dan Beranda satu-satunya
            halaman yang pemilik buka setiap hari.
          */}
          <PendingUploadsNotice />

          <ReminderStrip />

          <SetupChecklist readiness={readiness} hasTransactions={hasTransactions} loading={loading} />

          <MonthlyTargetCard />

          <ReclassCard />

          <section aria-labelledby="activity-mobile-title" className={styles.whiteCard}>
            <div className={styles.sectionHeader}>
              <h2 id="activity-mobile-title" className={styles.sectionTitle}>Aktivitas</h2>
              <Link href="/umkm/laporan?tab=kas" className={styles.sectionLink}>Lihat semua</Link>
            </div>
            {loading ? <p role="status" className="py-8 text-center text-xs text-umkm-subtle">Menyiapkan aktivitas...</p> : activities.length === 0 ? <EmptyActivity /> : activities.slice(0, 4).map((item) => <ActivityRow key={item.id} item={item} />)}
          </section>

          <section aria-labelledby="journey-mobile-title" className={`${styles.whiteCard} ${styles.journeyCard}`}>
            <div className={styles.sectionHeader}>
              <div><p className={styles.eyebrow} style={{ color: "var(--umkm-brand-hover)" }}>Perjalanan usaha</p><h2 id="journey-mobile-title" className={styles.sectionTitle}>Kesiapan data</h2></div>
              <Link href="/umkm/perjalanan" className={styles.sectionLink}>Detail</Link>
            </div>
            <div className={styles.missionRow}>
              <div className={styles.mission}>
                <strong>{readiness?.step?.title ?? "Semua langkah utama sudah didukung data"}</strong>
                <p>{readiness?.step?.headline ?? "Lanjutkan kebiasaan mencatat agar ringkasan usaha tetap lengkap."}</p>
                <Link href={readiness?.step?.action?.href ?? "/umkm/perjalanan"} className="-mx-2 mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-extrabold text-umkm-brand hover:bg-umkm-brand-soft">Lanjutkan <ChevronRight size={12} /></Link>
              </div>
            </div>
          </section>

          <section aria-labelledby="actions-mobile-title" className={styles.whiteCard}>
            <div className={styles.sectionHeader}><h2 id="actions-mobile-title" className={styles.sectionTitle}>Perlu perhatian</h2><span className="text-xs text-umkm-subtle">{actions.length} item</span></div>
            {loading ? <p role="status" className="py-5 text-center text-xs text-umkm-subtle">Memeriksa data...</p> : actions.length === 0 ? <div className="flex items-center gap-2 py-4 text-xs text-umkm-success"><CheckCircle2 size={17} /> Semua beres untuk saat ini.</div> : actions.slice(0, 3).map((item) => <ActionRow key={item.id} item={item} />)}
          </section>

          <DinasOfferCard />
          <BroadcastInvitations />
        </div>
      </div>

      <div className={styles.desktopOnly}>
        <div className={styles.desktopPage}>
          <header>
            <h1 className={styles.desktopHeading}>Ringkasan usaha</h1>
            <p className={styles.desktopSubheading}>Pantau uang masuk, biaya, dan kesiapan data usaha Anda dalam satu tempat.</p>
          </header>

          {error && <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-umkm-danger-line bg-umkm-danger-soft p-4 text-xs text-umkm-danger-strong"><AlertCircle size={17} />{error}</div>}

          <div className="mt-5 space-y-4">
            <PendingUploadsNotice />
            <ReminderStrip />
            <SetupChecklist readiness={readiness} hasTransactions={hasTransactions} loading={loading} />
            <MonthlyTargetCard />
          </div>

          <section aria-label="Ringkasan hari ini" className={styles.kpiGrid}>
            <KpiCard label="Sisa uang hari ini" value={formatSignedIdr(cashFlow)} meta="Pemasukan dikurangi pengeluaran" Icon={WalletCards} tone="neutral" />
            <KpiCard label="Uang masuk" value={formatIdr(income)} meta="Dari catatan hari ini" Icon={ArrowDownLeft} tone="positive" />
            <KpiCard label="Uang keluar" value={formatIdr(expense)} meta="Belanja dan biaya hari ini" Icon={ArrowUpRight} tone="neutral" />
            {/* Tangga, bukan rapor. "17/100" memberi tahu pemilik bahwa ia
                gagal tanpa memberi tahu apa yang kurang, dan angka yang
                mustahil naik cepat hanya membuat orang berhenti membukanya. */}
            <ReadinessMiniCard data={readiness} />
          </section>

          <div className={styles.desktopGrid}>
            <section aria-labelledby="activity-desktop-title" className={styles.panel}>
              <div className={styles.panelHeader}><div><h2 id="activity-desktop-title" className={styles.panelTitle}>Aktivitas terbaru</h2><p className="mt-1 text-xs text-umkm-subtle">Catatan dan perubahan terbaru di usaha Anda</p></div><Link href="/umkm/laporan?tab=kas" className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-umkm-line px-3 text-xs font-bold text-umkm-ink-soft hover:bg-umkm-surface">Buka laporan</Link></div>
              <div className={styles.panelBody}>{loading ? <p className="py-10 text-center text-xs text-umkm-subtle">Menyiapkan aktivitas...</p> : activities.length === 0 ? <EmptyActivity /> : activities.map((item) => <ActivityRow key={item.id} item={item} />)}</div>
            </section>

            <section aria-labelledby="action-desktop-title" className={styles.panel}>
              <div className={styles.panelHeader}><div><h2 id="action-desktop-title" className={styles.panelTitle}>Perlu perhatian</h2><p className="mt-1 text-xs text-umkm-subtle">{actions.length} hal untuk ditinjau</p></div><Sparkles size={16} className="text-umkm-sky" /></div>
              <div className={styles.panelBody}>{loading ? <p className="py-10 text-center text-xs text-umkm-subtle">Memeriksa data...</p> : actions.length === 0 ? <div className="flex items-center gap-2 py-8 text-xs text-umkm-success"><CheckCircle2 size={17} /> Semua beres untuk saat ini.</div> : actions.map((item) => <ActionRow key={item.id} item={item} />)}</div>
            </section>

            <section aria-labelledby="mission-desktop-title" className={`${styles.panel} ${styles.fullWidth}`}>
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="mission-desktop-title" className={styles.panelTitle}>Langkah usaha berikutnya</h2>
                  <p className="mt-1 text-xs text-umkm-subtle">Rekomendasi berdasarkan data yang sudah tersedia</p>
                </div>
                <Link href="/umkm/perjalanan" className="-mx-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-umkm-brand hover:bg-umkm-brand-soft">Lihat perjalanan</Link>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand">
                    <Sparkles size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-umkm-ink">{readiness?.step?.title ?? "Data utama usaha sudah lengkap"}</p>
                    <p className="mt-1 text-xs leading-relaxed text-umkm-subtle">{readiness?.step?.headline ?? "Terus catat transaksi yang benar-benar terjadi agar ringkasan tetap terbaru."}</p>
                  </div>
                </div>
                <Link
                  href={readiness?.step?.action?.href ?? "/umkm/perjalanan"}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-umkm-brand px-5 text-xs font-bold text-white hover:bg-umkm-brand-hover transition-colors shadow-sm self-stretch sm:self-auto"
                >
                  {readiness?.step?.action?.label ?? "Lanjutkan"} <ArrowRight size={14} />
                </Link>
              </div>
            </section>

            <div className={styles.fullWidth}><DinasOfferCard /></div>
            <div className={styles.fullWidth}><BroadcastInvitations /></div>
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
  // Ikon dari jenisnya, bukan dari mencocokkan kata di judul.
  const icon = item.kind === "income" ? <ArrowDownLeft size={17} /> : item.kind === "expense" ? <ArrowUpRight size={17} /> : <FileText size={16} />;
  return <Link href={item.href} className={styles.activityRow}><span className={styles.activityIcon} aria-hidden>{icon}</span><span className={styles.activityCopy}><strong>{item.title}</strong><small>{item.detail}</small></span><time className={styles.activityTime}>{formatTime(item.at)}</time></Link>;
}

function ActionRow({ item }: { item: ActionItem }) {
  return <Link href={item.href} className={styles.actionRow}><span className={styles.actionDot} /><span className="min-w-0 flex-1"><strong>{item.title}</strong><small className="line-clamp-2">{item.description}</small></span><ChevronRight size={14} className="text-umkm-faint" /></Link>;
}

function EmptyActivity() {
  return <div className="flex flex-col items-center py-8 text-center"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-umkm-brand-soft text-umkm-brand-hover"><Mic size={19} /></span><p className="mt-3 text-xs font-bold text-umkm-ink-soft">Belum ada aktivitas usaha</p><Link href="/umkm/catat" className="mt-2 text-xs font-bold text-umkm-brand">Buat catatan pertama</Link></div>;
}
