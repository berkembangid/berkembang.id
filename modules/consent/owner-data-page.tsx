"use client";

/**
 * « Siapa yang bisa melihat data saya » -- satu layar untuk semua kontrol
 * berbagi data.
 *
 * Sebelumnya kontrol ini tersebar di tiga tempat: dinas pembina di puncak
 * Profil, penemuan dan kode program di dasar Profil (di bawah tombol Simpan),
 * dan undangan dinas di Beranda. Tidak ada satu pun tempat yang menjawab
 * pertanyaan pemilik yang paling wajar: siapa saja yang sekarang bisa melihat
 * usaha saya, dan bagaimana menghentikannya.
 *
 * Layar ini juga menepati tiga janji yang sebelumnya tidak punya tombol:
 * mencabut izin lembaga, keluar dari program, dan melihat SIAPA yang membuka
 * data (riwayat lama hanya menulis « Membuka dossier »).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Eye, GraduationCap, LoaderCircle, ShieldCheck, Users } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { BroadcastInvitations } from "@/components/warung/BroadcastInvitations";
import { DinasAffiliationCard } from "@/components/warung/DinasAffiliationCard";
import { useConfirm } from "@/components/ui/confirm";
import { formatTanggal } from "@/lib/format";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { consentScopeLabels, type ConsentScope } from "@/modules/consent/consent-schema";

type RequestRow = {
  id: string;
  institutionName: string;
  programName: string | null;
  purpose_description: string;
  requested_scopes: string[];
  requested_duration_days: number;
  download_requested: boolean;
  status: string;
  created_at: string;
};
type GrantRow = {
  id: string;
  request_id: string;
  status: string;
  scopes: string[];
  download_allowed: boolean;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};
type ProgramRow = { programId: string; programName: string; institutionName: string; description: string | null; status: string; joinedAt: string | null; endsOn: string | null };
type AccessLog = { id: string; artifact: string; action: string; occurredAt: string; institutionName: string | null };

const LOG_PREVIEW = 8;

function scopeList(scopes: string[]) {
  return scopes.map((scope) => consentScopeLabels[scope as ConsentScope]?.label ?? scope).join(", ");
}

async function readJson(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? fallback);
  return body;
}

function Section({ id, icon: Icon, title, description, children }: {
  id: string; icon: typeof Users; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-umkm-line bg-white">
      <header className="flex items-start gap-3 border-b border-umkm-line-soft px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand"><Icon size={17} aria-hidden /></span>
        <div>
          <h2 id={id} className="text-sm font-bold text-umkm-ink">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-umkm-subtle">{description}</p>
        </div>
      </header>
      <div className="space-y-3 p-5">{children}</div>
    </section>
  );
}

export default function OwnerDataPage() {
  const { confirm } = useConfirm();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [discovery, setDiscovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [showAllLogs, setShowAllLogs] = useState(false);

  const load = useCallback(async () => {
    // Setiap bagian dimuat sendiri: satu sumber yang gagal tidak boleh
    // mengosongkan bagian lain, karena layar kosong di sini terbaca sebagai
    // « tidak ada yang melihat data saya » -- kesimpulan yang bisa keliru.
    const failures: string[] = [];
    await Promise.all([
      fetch("/api/v1/profile-access/requests", { cache: "no-store" })
        .then((response) => readJson(response, "Izin lembaga belum dapat dimuat."))
        .then((body) => { setRequests(body.data.requests ?? []); setGrants(body.data.grants ?? []); })
        .catch(() => failures.push("izin lembaga")),
      fetch("/api/v1/programs", { cache: "no-store" })
        .then((response) => readJson(response, "Program belum dapat dimuat."))
        .then((body) => setPrograms(body.data ?? []))
        .catch(() => failures.push("program")),
      fetch("/api/v1/profile-access/access-log", { cache: "no-store" })
        .then((response) => readJson(response, "Riwayat akses belum dapat dimuat."))
        .then((body) => setLogs(body.data ?? []))
        .catch(() => failures.push("riwayat akses")),
      fetch("/api/v1/discovery-optin", { cache: "no-store" })
        .then((response) => readJson(response, "Pengaturan penemuan belum dapat dimuat."))
        .then((body) => setDiscovery(Boolean(body.data?.optedIn)))
        .catch(() => failures.push("pengaturan penemuan")),
    ]);
    setProblem(failures.length ? `Sebagian belum dapat dimuat: ${failures.join(", ")}. Yang tampil di bawah mungkin belum lengkap.` : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Satu titik waktu per kunjungan; dihitung sekali, bukan setiap render.
  const [now] = useState(() => Date.now());
  const activeGrants = useMemo(
    () => grants.filter((grant) => grant.status === "active" && (!grant.expires_at || Date.parse(grant.expires_at) > now)),
    [grants, now],
  );
  const endedGrants = grants.filter((grant) => !activeGrants.includes(grant)).slice(0, 5);
  const pending = requests.filter((request) => request.status === "pending");
  const requestOf = (grant: GrantRow) => requests.find((request) => request.id === grant.request_id);
  const activePrograms = programs.filter((program) => program.status === "accepted");

  async function revoke(grant: GrantRow) {
    const name = requestOf(grant)?.institutionName ?? "lembaga ini";
    const yes = await confirm({
      title: `Cabut akses ${name}?`,
      description: `${name} langsung tidak bisa membuka data usaha Anda lagi, dan mereka diberi tahu. Riwayat yang sudah mereka buka tetap tercatat. Kalau nanti mereka butuh lagi, mereka harus meminta ulang.`,
      confirmLabel: "Cabut akses",
      cancelLabel: "Biarkan",
      tone: "danger",
    });
    if (!yes) return;
    setBusy(grant.id);
    try {
      await readJson(
        await fetch(`/api/v1/profile-access/grants/${grant.id}/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Dicabut pemilik usaha" }),
        }),
        "Akses belum berhasil dicabut.",
      );
      notifySuccess(`Akses ${name} dicabut`, { description: "Mereka tidak bisa membuka data usaha Anda lagi." });
      await load();
    } catch (error) {
      notifyFromError(error, "Akses belum berhasil dicabut.");
    } finally {
      setBusy(null);
    }
  }

  async function leave(program: ProgramRow) {
    const yes = await confirm({
      title: `Keluar dari ${program.programName}?`,
      description: `${program.institutionName} berhenti menerima kemajuan usaha Anda dari program ini. Anda bisa bergabung lagi nanti dengan kode yang sama.`,
      confirmLabel: "Keluar dari program",
      cancelLabel: "Tetap ikut",
      tone: "danger",
    });
    if (!yes) return;
    setBusy(program.programId);
    try {
      await readJson(
        await fetch("/api/v1/programs/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programId: program.programId }),
        }),
        "Belum berhasil keluar dari program.",
      );
      notifySuccess(`Anda keluar dari ${program.programName}`);
      await load();
    } catch (error) {
      notifyFromError(error, "Belum berhasil keluar dari program.");
    } finally {
      setBusy(null);
    }
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    const code = joinCode.trim();
    if (code.length !== 6) return;
    const yes = await confirm({
      title: `Gabung program dengan kode ${code}?`,
      description: "Yang dibagikan hanya kemajuan misi dan indikator tanpa rupiah: tingkat, pilar, hari mencatat, dan status legalitas. Angka rupiah tidak termasuk, dan Anda bisa keluar kapan saja dari layar ini.",
      confirmLabel: "Gabung",
      cancelLabel: "Batal",
    });
    if (!yes) return;
    setBusy("join");
    try {
      const body = await readJson(
        await fetch("/api/v1/programs/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode: code }),
        }),
        "Gabung program belum berhasil.",
      );
      setJoinCode("");
      notifySuccess(`Bergabung ke ${body.data?.programName ?? "program"}`);
      await load();
    } catch (error) {
      notifyFromError(error, "Gabung program belum berhasil.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Menyalakan penemuan memperluas siapa yang bisa melihat usaha ini, jadi
   * ditanyakan. Mematikannya tidak: mengurangi keterbukaan tidak pernah
   * merugikan pemiliknya.
   */
  async function toggleDiscovery() {
    if (!discovery) {
      const yes = await confirm({
        title: "Bersedia ditemukan lembaga?",
        description: "Usaha Anda tampil tanpa nama sebagai kandidat. Isi catatan dan kontak tetap tertutup: lembaga masih harus meminta akses, dan Anda diberi tahu setiap kali. Bisa dimatikan lagi kapan saja.",
        confirmLabel: "Ya, bersedia",
        cancelLabel: "Belum",
      });
      if (!yes) return;
    }
    setBusy("discovery");
    try {
      const body = await readJson(
        await fetch("/api/v1/discovery-optin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optedIn: !discovery }),
        }),
        "Pengaturan penemuan belum dapat diubah.",
      );
      const next = Boolean(body.data?.optedIn);
      setDiscovery(next);
      notifySuccess(next ? "Usaha Anda bisa ditemukan lembaga" : "Usaha Anda kembali tertutup");
    } catch (error) {
      notifyFromError(error, "Pengaturan penemuan belum dapat diubah.");
    } finally {
      setBusy(null);
    }
  }

  const visibleLogs = showAllLogs ? logs : logs.slice(0, LOG_PREVIEW);

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Izin & program"
        description="Siapa yang bisa melihat data usaha Anda, dan cara menghentikannya kapan saja."
        icon={ShieldCheck}
      />

      {problem && <FeedbackBanner tone="attention">{problem}</FeedbackBanner>}

      {/* Ringkasan satu kalimat per sumber keterbukaan. */}
      <section aria-label="Ringkasan keterbukaan data" className="grid grid-cols-3 gap-2">
        {[
          { label: "Lembaga dengan akses", value: loading ? "…" : String(activeGrants.length) },
          { label: "Program yang diikuti", value: loading ? "…" : String(activePrograms.length) },
          { label: "Bisa ditemukan lembaga", value: loading ? "…" : discovery ? "Ya" : "Tidak" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-umkm-line bg-white px-3 py-3 sm:px-4">
            <p className="text-xs leading-tight text-umkm-subtle">{item.label}</p>
            <p className="mt-0.5 text-lg font-bold text-umkm-ink">{item.value}</p>
          </div>
        ))}
      </section>

      <Section id="izin-lembaga" icon={Users} title="Lembaga yang meminta atau punya akses" description="Lembaga pembiayaan dan pembina hanya bisa membuka data yang Anda izinkan, selama masa yang disebut.">
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-xs text-umkm-subtle"><LoaderCircle size={14} className="animate-spin" /> Memuat izin…</p>
        ) : (
          <>
            {activeGrants.length === 0 && pending.length === 0 && (
              <p className="rounded-xl bg-umkm-surface p-4 text-xs text-umkm-muted">Belum ada lembaga yang punya akses. Data usaha Anda tetap privat.</p>
            )}
            {activeGrants.map((grant) => {
              const request = requestOf(grant);
              return (
                <article key={grant.id} className="rounded-xl border border-umkm-success-line bg-umkm-success-soft p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-umkm-ink">{request?.institutionName ?? "Lembaga"}</p>
                      <p className="mt-1 text-xs text-umkm-muted">Boleh melihat: {scopeList(grant.scopes)}{grant.download_allowed ? ", dan mengunduh salinan PDF" : ""}.</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-umkm-success"><CalendarClock size={12} aria-hidden /> Sampai {grant.expires_at ? formatTanggal(grant.expires_at, "long") : "dicabut"}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy === grant.id}
                      onClick={() => void revoke(grant)}
                      className="inline-flex min-h-11 items-center rounded-xl border border-umkm-danger-line bg-white px-4 text-xs font-bold text-umkm-danger hover:bg-umkm-danger-soft disabled:opacity-50"
                    >
                      {busy === grant.id ? "Mencabut…" : "Cabut akses"}
                    </button>
                  </div>
                </article>
              );
            })}
            {pending.map((request) => (
              <details key={request.id} className="group rounded-xl border border-umkm-warning-line bg-umkm-warning-soft p-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-umkm-ink">{request.institutionName}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-umkm-warning">Sedang ditinjau admin platform · diajukan {formatTanggal(request.created_at)}</span>
                  </span>
                  <ChevronDown size={16} aria-hidden className="mt-1 shrink-0 text-umkm-warning transition-transform group-open:rotate-180" />
                </summary>
                <dl className="mt-3 space-y-2 text-xs leading-relaxed text-umkm-ink-soft">
                  <div><dt className="font-bold">Tujuan</dt><dd>{request.purpose_description}</dd></div>
                  <div><dt className="font-bold">Data yang diminta</dt><dd>{scopeList(request.requested_scopes)}</dd></div>
                  <div><dt className="font-bold">Masa akses</dt><dd>{request.requested_duration_days} hari{request.download_requested ? ", termasuk mengunduh salinan" : ""}</dd></div>
                  {request.programName && <div><dt className="font-bold">Program</dt><dd>{request.programName}</dd></div>}
                </dl>
              </details>
            ))}
            {endedGrants.length > 0 && (
              <div className="border-t border-umkm-line-soft pt-3">
                <h3 className="text-xs font-bold text-umkm-muted">Akses yang sudah berakhir</h3>
                <ul className="mt-2 space-y-1.5">
                  {endedGrants.map((grant) => (
                    <li key={grant.id} className="flex justify-between gap-3 text-xs text-umkm-subtle">
                      <span>{requestOf(grant)?.institutionName ?? "Lembaga"}</span>
                      <span>{grant.status === "revoked" ? `Dicabut ${formatTanggal(grant.revoked_at)}` : `Berakhir ${formatTanggal(grant.expires_at)}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-umkm-line bg-umkm-surface p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-umkm-ink">Bersedia ditemukan lembaga</p>
            <p className="mt-1 text-xs leading-relaxed text-umkm-muted">Usaha Anda tampil tanpa nama sebagai kandidat. Lembaga tetap harus meminta akses untuk melihat isi atau kontak.</p>
          </div>
          <button
            type="button"
            disabled={busy === "discovery" || loading}
            onClick={() => void toggleDiscovery()}
            aria-pressed={discovery}
            className={`min-h-11 rounded-xl px-4 text-xs font-bold disabled:opacity-50 ${discovery ? "bg-umkm-success text-white" : "border border-umkm-line-strong bg-white text-umkm-ink-soft"}`}
          >
            {busy === "discovery" ? "Menyimpan…" : discovery ? "Aktif — matikan" : "Aktifkan"}
          </button>
        </div>
      </Section>

      <Section id="izin-program" icon={GraduationCap} title="Program pembinaan & pendampingan" description="Program hanya menerima kemajuan tanpa angka rupiah. Keluar kapan saja.">
        <DinasAffiliationCard />
        {activePrograms.map((program) => (
          <article key={program.programId} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-umkm-line p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-umkm-ink">{program.programName}</p>
              <p className="mt-0.5 text-xs text-umkm-muted">{program.institutionName}{program.joinedAt ? ` · ikut sejak ${formatTanggal(program.joinedAt)}` : ""}{program.endsOn ? ` · sampai ${formatTanggal(program.endsOn)}` : ""}</p>
              {program.description && <p className="mt-1.5 text-xs leading-relaxed text-umkm-subtle">{program.description}</p>}
            </div>
            <button
              type="button"
              disabled={busy === program.programId}
              onClick={() => void leave(program)}
              className="inline-flex min-h-11 items-center rounded-xl border border-umkm-line px-4 text-xs font-bold text-umkm-muted hover:bg-umkm-surface disabled:opacity-50"
            >
              {busy === program.programId ? "Memproses…" : "Keluar"}
            </button>
          </article>
        ))}
        <form onSubmit={(event) => void join(event)} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-umkm-line-strong p-4">
          <label className="text-xs font-bold text-umkm-muted">
            Punya kode program dari penyelenggara?
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="ABC123"
              autoComplete="off"
              className="mt-1 block min-h-11 w-36 rounded-lg border border-umkm-line-strong px-3 font-mono text-sm uppercase text-umkm-ink"
            />
          </label>
          <button type="submit" disabled={busy === "join" || joinCode.length !== 6} className="min-h-11 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50">
            {busy === "join" ? "Bergabung…" : "Gabung"}
          </button>
        </form>
        <BroadcastInvitations variant="full" />
      </Section>

      <Section id="izin-riwayat" icon={Eye} title="Riwayat akses" description="Setiap kali lembaga membuka atau mengunduh data usaha Anda, tercatat di sini.">
        {loading ? null : logs.length === 0 ? (
          <p className="rounded-xl bg-umkm-surface p-4 text-xs text-umkm-muted">Belum ada lembaga yang membuka data usaha Anda.</p>
        ) : (
          <>
            <ul className="divide-y divide-umkm-line-soft">
              {visibleLogs.map((log) => (
                <li key={log.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-2.5 text-xs">
                  <span className="text-umkm-ink"><strong>{log.institutionName ?? "Lembaga"}</strong> {log.action === "download" ? "mengunduh" : "membuka"} {log.artifact.toLowerCase()}</span>
                  <time className="text-umkm-subtle">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(log.occurredAt))}</time>
                </li>
              ))}
            </ul>
            {logs.length > LOG_PREVIEW && (
              <button type="button" onClick={() => setShowAllLogs((value) => !value)} className="inline-flex min-h-11 items-center text-xs font-bold text-umkm-brand">
                {showAllLogs ? "Tampilkan lebih sedikit" : `Tampilkan semua (${logs.length})`}
              </button>
            )}
          </>
        )}
      </Section>
    </DashboardPage>
  );
}
