"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, LayoutGrid, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure, notifySuccess } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

/**
 * Program / kohort, portal lembaga.
 *
 * APA YANG DIPERBAIKI.
 *
 * 1. PROGRAM BISA DIPERBAIKI. Sebelumnya rutenya hanya GET dan POST: program
 *    dengan nama salah ketik tinggal begitu selamanya, terlihat oleh setiap
 *    UMKM yang memegang kode gabungnya. Basis data sudah mengizinkan
 *    penyuntingan sejak awal; yang tidak ada hanyalah jalannya.
 *
 * 2. DAFTARNYA DIBACA ULANG SESUDAH SETIAP PERUBAHAN. Versi lama membuat
 *    program lalu tidak menyegarkan apa pun -- komentarnya bahkan menjanjikan
 *    "kode gabungnya dibaca ulang dari daftar di bawah", padahal daftar itu
 *    tidak pernah dimuat lagi. Yang membuat program melihat layar yang sama
 *    persis seperti sebelum ia menekan tombol.
 *
 * 3. HAPUS HANYA DITAWARKAN SAAT MASIH DRAF. `programs_delete` mensyaratkan
 *    `status = 'draft'`. Menawarkan tombol hapus pada program aktif berarti
 *    menawarkan sesuatu yang akan ditolak -- dan pemakainya belajar bahwa
 *    layar ini tidak bisa dipercaya. Untuk program berjalan, yang benar
 *    adalah MENUTUPNYA: pesertanya tetap tercatat, kodenya berhenti menerima
 *    orang baru.
 *
 * 4. FORMULIRNYA MUAT DI PONSEL. Lebarnya dulu dipatok `w-64` dan `w-48` dalam
 *    satu baris flex; di layar 390px itu meluber keluar layar, dan tombolnya
 *    terdorong ke tempat yang tidak bisa dijangkau.
 */

type Program = {
  id: string;
  name: string;
  region: string | null;
  join_code: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
};

type Dashboard = {
  programId: string;
  programName: string;
  participantCount: number;
  levelDistribution: Array<{ level: string; count: number }>;
  legalFunnel: { nib: number; pirt: number; halal: number; participants: number };
  participants: Array<{ code: string | null; businessName: string; level: string; joinedAt: string }>;
};

/** Status dalam bahasa yang dibaca petugas, bukan nilai kolom. */
const STATUS: Record<string, { label: string; kelas: string }> = {
  draft: { label: "Draf", kelas: "bg-slate-100 text-slate-600" },
  active: { label: "Aktif", kelas: "bg-emerald-50 text-emerald-700" },
  paused: { label: "Dijeda", kelas: "bg-amber-50 text-amber-700" },
  closed: { label: "Ditutup", kelas: "bg-slate-100 text-slate-500" },
};

function pesanGalat(body: unknown, cadangan: string): string {
  const error = (body as { error?: { message?: string } } | null)?.error;
  return typeof error?.message === "string" ? error.message : cadangan;
}

export default function InstitutionProgramPage() {
  const { selectedId, selected } = useInstitution();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [sunting, setSunting] = useState<{ id: string; name: string; region: string } | null>(null);
  const { confirm } = useConfirm();

  const isOrgAdmin = selected?.role === "admin";

  const muat = useCallback(async () => {
    if (!selectedId) return;
    try {
      const response = await fetch("/api/v1/institution/programs", {
        cache: "no-store",
        headers: institutionHeaders(selectedId),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(pesanGalat(body, "Program belum dapat dimuat."));
      setPrograms(body.data ?? []);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Program belum dapat dimuat.");
    }
  }, [selectedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote load
    void muat();
  }, [muat]);

  async function buat() {
    if (!selectedId || name.trim().length < 3) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/institution/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({
          name: name.trim(),
          region: region.trim() || null,
          status: "active",
          missionPack: { default: ["legalitas", "kebiasaan_mencatat"] },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        notifyFailure(pesanGalat(body, "Program belum dapat dibuat."));
        return;
      }
      setName("");
      setRegion("");
      notifySuccess(`Program dibuat · kode ${body.data.join_code}`, {
        description: "Bagikan kode ini ke UMKM yang akan bergabung. Kodenya juga tertulis di kartu programnya.",
        duration: 9000,
      });
      await muat();
    } catch {
      notifyFailure("Program belum dapat dibuat. Periksa koneksi, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function simpanSuntingan() {
    if (!selectedId || !sunting || sunting.name.trim().length < 3) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/institution/programs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({
          id: sunting.id,
          name: sunting.name.trim(),
          region: sunting.region.trim() || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        notifyFailure(pesanGalat(body, "Perubahan belum tersimpan."));
        return;
      }
      setSunting(null);
      notifySuccess("Program diperbarui");
    } catch {
      notifyFailure("Perubahan belum tersimpan. Periksa koneksi, lalu coba lagi.");
    } finally {
      setBusy(false);
      await muat();
    }
  }

  async function ubahStatus(program: Program, status: "active" | "paused" | "closed") {
    if (!selectedId) return;

    if (status === "closed") {
      const yes = await confirm({
        title: `Tutup program "${program.name}"?`,
        description:
          "Kode gabungnya berhenti menerima peserta baru. Peserta yang sudah bergabung tetap tercatat, dan ringkasan programnya tetap bisa dibuka.",
        confirmLabel: "Tutup program",
        cancelLabel: "Batal",
        tone: "danger",
      });
      if (!yes) return;
    }

    try {
      const response = await fetch("/api/v1/institution/programs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({ id: program.id, status }),
      });
      const body = await response.json();
      if (!response.ok) {
        notifyFailure(pesanGalat(body, "Status program belum berubah."));
      } else {
        notifySuccess(`Program ${STATUS[status]?.label.toLowerCase() ?? status}`);
      }
    } catch {
      notifyFailure("Status program belum berubah. Periksa koneksi, lalu coba lagi.");
    } finally {
      await muat();
    }
  }

  async function hapus(program: Program) {
    if (!selectedId) return;

    const yes = await confirm({
      title: `Hapus draf "${program.name}"?`,
      description:
        "Draf ini hilang seluruhnya beserta kode gabungnya. Karena belum pernah aktif, belum ada peserta yang terpengaruh.",
      confirmLabel: "Hapus draf",
      cancelLabel: "Batal",
      tone: "danger",
    });
    if (!yes) return;

    try {
      const response = await fetch(
        `/api/v1/institution/programs?id=${encodeURIComponent(program.id)}`,
        { method: "DELETE", headers: institutionHeaders(selectedId) },
      );
      const body = await response.json();
      if (!response.ok) {
        notifyFailure(pesanGalat(body, "Draf belum dapat dihapus."));
      } else {
        notifySuccess("Draf dihapus");
        if (dashboard?.programId === program.id) setDashboard(null);
      }
    } catch {
      notifyFailure("Draf belum dapat dihapus. Periksa koneksi, lalu coba lagi.");
    } finally {
      await muat();
    }
  }

  async function bukaDashboard(id: string) {
    try {
      const response = await fetch(`/api/v1/institution/programs/${id}/dashboard`, {
        cache: "no-store",
        headers: institutionHeaders(selectedId),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(pesanGalat(body, "Ringkasan belum dapat dimuat."));
      setDashboard(body.data as Dashboard);
    } catch (error) {
      notifyFailure(error instanceof Error ? error.message : "Ringkasan program belum dapat dimuat.");
    }
  }

  return (
    <DashboardPage>
      <PageHeader
        title="Program / kohort"
        description="Unit kerja dinas & CSR: undang lewat kode, pantau agregat non-rupiah. Membuka laporan satu usaha tetap butuh izin pemiliknya."
        icon={LayoutGrid}
      />
      {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

      {isOrgAdmin && (
        /*
          Satu kolom di ponsel, sebaris di layar lebar. Lebarnya tidak lagi
          dipatok piksel: `w-full sm:w-64` membuatnya muat di 360px tanpa
          mendorong tombolnya keluar layar.
        */
        <section className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="text-xs font-bold text-slate-600">
              Nama program
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Pembinaan UMKM Depok 2026"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal sm:w-64"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Wilayah
              <input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="Kota Depok"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal sm:w-48"
              />
            </label>
            <button
              disabled={busy || name.trim().length < 3}
              onClick={() => void buat()}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              <Plus size={14} />
              {busy ? "Membuat..." : "Buat program"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Nama program minimal 3 huruf. Kode gabungnya dibuat otomatis dan tampil di kartu programnya.
          </p>
        </section>
      )}

      {programs.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Users}
            title="Belum ada program"
            description={
              isOrgAdmin
                ? "Buat program untuk mengelola kohort pembinaan, lalu bagikan kode gabungnya."
                : "Belum ada program di organisasi ini. Hanya ADMIN organisasi yang dapat membuatnya."
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {programs.map((program) => {
            const status = STATUS[program.status] ?? { label: program.status, kelas: "bg-slate-100 text-slate-600" };
            const sedangDisunting = sunting?.id === program.id;

            return (
              <article key={program.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                {sedangDisunting ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-600">
                      Nama program
                      <input
                        value={sunting.name}
                        onChange={(event) => setSunting({ ...sunting, name: event.target.value })}
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-600">
                      Wilayah
                      <input
                        value={sunting.region}
                        onChange={(event) => setSunting({ ...sunting, region: event.target.value })}
                        placeholder="Kosongkan untuk semua wilayah"
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        disabled={busy || sunting.name.trim().length < 3}
                        onClick={() => void simpanSuntingan()}
                        className="min-h-11 flex-1 rounded-xl bg-[#0b5f86] text-xs font-bold text-white disabled:opacity-50"
                      >
                        {busy ? "Menyimpan..." : "Simpan"}
                      </button>
                      <button
                        onClick={() => setSunting(null)}
                        className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-300 text-slate-500"
                        aria-label="Batalkan penyuntingan"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-bold text-slate-900">{program.name}</h2>
                        <p className="mt-1 text-xs text-slate-500">
                          {program.region ?? "Semua wilayah"} · kode{" "}
                          <strong className="font-mono text-slate-700">{program.join_code}</strong>
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status.kelas}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => void bukaDashboard(program.id)}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0b5f86] px-3 text-xs font-bold text-white"
                      >
                        <BarChart3 size={14} />
                        Ringkasan
                      </button>

                      {isOrgAdmin && (
                        <>
                          <button
                            onClick={() =>
                              setSunting({ id: program.id, name: program.name, region: program.region ?? "" })
                            }
                            aria-label={`Sunting ${program.name}`}
                            className="grid size-11 place-items-center rounded-xl border border-slate-300 text-slate-600 hover:border-[#0b5f86] hover:text-[#0b5f86]"
                          >
                            <Pencil size={15} />
                          </button>

                          {program.status !== "closed" && (
                            <button
                              onClick={() => void ubahStatus(program, "closed")}
                              className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-600 hover:border-amber-300 hover:text-amber-700"
                            >
                              Tutup
                            </button>
                          )}
                          {program.status === "closed" && (
                            <button
                              onClick={() => void ubahStatus(program, "active")}
                              className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                            >
                              Aktifkan
                            </button>
                          )}

                          {/*
                            Hanya draf. Basis data menolak penghapusan program
                            yang pernah aktif, dan tombol yang selalu ditolak
                            hanya mengajari orang bahwa layar ini tidak bisa
                            dipercaya.
                          */}
                          {program.status === "draft" && (
                            <button
                              onClick={() => void hapus(program)}
                              aria-label={`Hapus draf ${program.name}`}
                              className="grid size-11 place-items-center rounded-xl border border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {isOrgAdmin && program.status !== "draft" && (
                      <p className="mt-2 text-[11px] leading-4 text-slate-400">
                        Program yang pernah aktif tidak bisa dihapus — pesertanya sudah tercatat. Tutup saja
                        supaya kodenya berhenti menerima peserta baru.
                      </p>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      {dashboard && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-black text-slate-900">
              {dashboard.programName} — agregat non-rupiah
            </h2>
            <button
              onClick={() => setDashboard(null)}
              aria-label="Tutup ringkasan"
              className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">Peserta</p>
              <p className="mt-1 text-lg font-black text-slate-900">{dashboard.participantCount}</p>
            </div>
            {dashboard.levelDistribution.map((row) => (
              <div key={row.level} className="rounded-xl bg-slate-50 p-3">
                <p className="text-slate-500">{row.level}</p>
                <p className="mt-1 text-lg font-black text-slate-900">{row.count}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4">
            {[
              ["NIB", dashboard.legalFunnel.nib],
              ["PIRT", dashboard.legalFunnel.pirt],
              ["Halal", dashboard.legalFunnel.halal],
              ["Peserta", dashboard.legalFunnel.participants],
            ].map(([label, nilai]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-3">
                <p className="text-lg font-black text-slate-900">{nilai}</p>
                <p className="text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {dashboard.participants.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
              Belum ada UMKM yang bergabung dengan kode program ini.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {dashboard.participants.map((row, index) => (
                <li
                  key={`${row.code ?? "x"}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-800">{row.businessName}</p>
                    <p className="font-mono text-[11px] text-slate-500">{row.code ?? "—"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">
                    {row.level}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </DashboardPage>
  );
}
