"use client";

/**
 * Panel kewenangan lembaga, di halaman detail lembaga.
 *
 * KENAPA ANGKA TERDAMPAK DITAMPILKAN DI ATAS SAKELARNYA.
 *
 * "Aktifkan visibilitas wilayah" tidak membuat siapa pun berhenti sebentar.
 * "Menyalakan ini membuka angka atas 1.240 usaha di Kota Bandung" membuatnya.
 * Sakelar yang akibatnya tidak terbaca akan ditekan karena ada, bukan karena
 * diputuskan -- dan yang ditekan di sini adalah kewenangan atas data pribadi
 * seluruh kota.
 *
 * Seluruh aturannya tetap di dalam `admin_set_institution_authority`: peran,
 * asimetri melonggarkan/mengencangkan, alasan wajib, dan kedua penjaga bentuk.
 * Panel ini hanya menggambar keadaan dan menyampaikan akibatnya.
 */

import { useCallback, useEffect, useState } from "react";
import { Eye, Map, ShieldAlert, Users } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";

type Authority = {
  institutionName: string;
  region: string | null;
  regionWide: boolean;
  canSeeIdentity: boolean;
  minLevel: string | null;
  broadcastQuota: number;
  regionBusinessCount: number | null;
  affiliatedCount: number;
};

const LEVELS = [
  { value: "", label: "Semua tingkat (tanpa batas)" },
  { value: "MULAI", label: "Mulai ke atas" },
  { value: "TEMBAGA", label: "Tembaga ke atas" },
  { value: "PERAK", label: "Perak ke atas" },
  { value: "EMAS", label: "Emas saja" },
];

const RANK: Record<string, number> = { "": 0, MULAI: 1, TEMBAGA: 2, PERAK: 3, EMAS: 4 };

export function InstitutionAuthorityPanel({ institutionId }: { institutionId: string }) {
  const { confirmWithReason } = useConfirm();
  const [state, setState] = useState<Authority | null>(null);
  const [loadError, setLoadError] = useState("");
  const [regionWide, setRegionWide] = useState(false);
  const [canSeeIdentity, setCanSeeIdentity] = useState(false);
  const [minLevel, setMinLevel] = useState("");
  const [quota, setQuota] = useState("4");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/admin/institution-authority?institutionId=${institutionId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Kewenangan lembaga belum dapat dibaca.");
    const data = body.data as Authority;
    setState(data);
    setRegionWide(data.regionWide);
    setCanSeeIdentity(data.canSeeIdentity);
    setMinLevel(data.minLevel ?? "");
    setQuota(String(data.broadcastQuota));
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    const timer = window.setTimeout(() => {
      load().catch((error) => setLoadError(error instanceof Error ? error.message : "Kewenangan lembaga belum dapat dibaca."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [institutionId, load]);

  if (loadError) {
    return <section className="rounded-2xl border border-[#f4b0a8] bg-[#feecea] p-4 text-xs text-[#8a1c12]">{loadError}</section>;
  }
  if (!state) return null;

  const melonggarkan =
    (regionWide && !state.regionWide)
    || (canSeeIdentity && !state.canSeeIdentity)
    || RANK[minLevel] < RANK[state.minLevel ?? ""];
  const berubah =
    regionWide !== state.regionWide
    || canSeeIdentity !== state.canSeeIdentity
    || minLevel !== (state.minLevel ?? "")
    || Number(quota) !== state.broadcastQuota;

  // Kedua penjaga bentuk diulang di layar supaya tombolnya tidak menawarkan
  // sesuatu yang pasti ditolak. Yang menegakkannya tetap fungsinya.
  const identitasTanpaWilayah = canSeeIdentity && !regionWide;
  const wilayahTanpaLokasi = regionWide && !state.region;

  async function simpan() {
    const akibat: string[] = [];
    if (regionWide && !state!.regionWide) {
      akibat.push(state!.regionBusinessCount === null
        ? "Lembaga ini akan melihat angka seluruh usaha di wilayahnya."
        : `Lembaga ini akan melihat angka atas ${state!.regionBusinessCount} usaha di ${state!.region}, termasuk yang tidak pernah mendaftar sukarela.`);
      akibat.push("Ia juga akan muncul sebagai pilihan “dinas pembina” di layar Profil pemilik usaha di wilayah itu.");
    }
    if (canSeeIdentity && !state!.canSeeIdentity) {
      akibat.push("Nama usaha dan nama pemilik akan terbuka untuk setiap usaha yang memilih lembaga ini sebagai pembina.");
    }
    if (!regionWide && state!.regionWide) {
      akibat.push("Dasbor wilayah, daftar, dan broadcast lembaga ini tertutup pada panggilan berikutnya.");
      if (state!.affiliatedCount > 0) {
        akibat.push(`${state!.affiliatedCount} izin afiliasi yang sudah diberikan pemilik tidak dihapus — itu izin mereka, bukan setelan kita.`);
      }
    }
    if (RANK[minLevel] < RANK[state!.minLevel ?? ""]) akibat.push("Kolam kandidat lembaga ini melebar.");

    const alasan = await confirmWithReason({
      title: melonggarkan ? "Longgarkan kewenangan lembaga ini?" : "Simpan perubahan kewenangan?",
      description: akibat.length > 0 ? akibat.join(" ") : "Perubahan ini tercatat beserta keadaan sebelum dan sesudahnya.",
      confirmLabel: melonggarkan ? "Ya, longgarkan" : "Simpan",
      cancelLabel: "Periksa lagi",
      tone: melonggarkan ? "danger" : "default",
      reasonLabel: "Alasan perubahan",
      reasonPlaceholder: "Contoh: kerja sama Dinas Koperasi Kota Bandung, surat nomor 123/2026",
    });
    if (alasan === null) return;

    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/institution-authority", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          institutionId,
          regionWide,
          canSeeIdentity,
          minLevel: minLevel || null,
          reason: alasan,
          broadcastQuota: Number(quota),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Kewenangan belum dapat disimpan.");
      notifySuccess("Kewenangan lembaga tersimpan, beserta alasannya.");
      await load();
    } catch (error) {
      notifyFromError(error, "Kewenangan belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-[#eef8fd] text-[#0f73a3]"><ShieldAlert size={17} /></span>
        <div>
          <h2 className="text-sm font-bold text-[#1b2a3a]">Kewenangan atas data</h2>
          <p className="text-[11px] text-[#6e859e]">
            Disetel di sini dengan sengaja dan beralasan — tidak pernah lagi dari potongan kata pada nama lembaga.
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#e3e9f0] p-3">
          <dt className="flex items-center gap-1.5 text-[10px] font-medium text-[#6e859e]"><Map size={11} /> Wilayah kerja</dt>
          <dd className="mt-1 text-xs font-bold text-[#1b2a3a]">{state.region ?? "Belum diisi"}</dd>
        </div>
        <div className="rounded-xl border border-[#e3e9f0] p-3">
          <dt className="flex items-center gap-1.5 text-[10px] font-medium text-[#6e859e]"><Users size={11} /> Usaha di wilayah itu</dt>
          <dd className="mt-1 text-xs font-bold text-[#1b2a3a] tabular-nums">
            {state.regionBusinessCount === null ? "—" : state.regionBusinessCount}
          </dd>
        </div>
        <div className="rounded-xl border border-[#e3e9f0] p-3">
          <dt className="flex items-center gap-1.5 text-[10px] font-medium text-[#6e859e]"><Eye size={11} /> Memilih lembaga ini sebagai pembina</dt>
          <dd className="mt-1 text-xs font-bold text-[#1b2a3a] tabular-nums">{state.affiliatedCount}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3">
        <label className="flex items-start gap-3 rounded-xl border border-[#e3e9f0] p-3">
          <input type="checkbox" checked={regionWide} onChange={(event) => setRegionWide(event.target.checked)}
            className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs font-bold text-[#1b2a3a]">Melihat seluruh wilayah kerjanya</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-[#6e859e]">
              Untuk dinas. Angka seluruh usaha di kotanya, termasuk yang tidak mendaftar sukarela — tanpa nama.
              Lembaga ini juga akan bisa dipilih pemilik usaha sebagai dinas pembina.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-[#e3e9f0] p-3">
          <input type="checkbox" checked={canSeeIdentity} onChange={(event) => setCanSeeIdentity(event.target.checked)}
            className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs font-bold text-[#1b2a3a]">Melihat identitas yang berafiliasi</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-[#6e859e]">
              Hanya untuk dinas pembina, dan hanya atas usaha yang memilihnya sendiri. Yang belum memilih tetap
              anonim selamanya, bukan sampai diminta.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-[#1b2a3a]">Batas kolam kandidat
            <select value={minLevel} onChange={(event) => setMinLevel(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-normal">
              {LEVELS.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
            </select>
            <span className="mt-1 block text-[10px] font-normal text-[#6e859e]">
              Bank dan investor dibatasi di sini. Penyaring dari sisi lembaga tidak bisa melonggarkannya.
            </span>
          </label>
          <label className="text-xs font-bold text-[#1b2a3a]">Kuota broadcast per bulan
            <input type="number" min={0} max={100} value={quota} onChange={(event) => setQuota(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-normal" />
            <span className="mt-1 block text-[10px] font-normal text-[#6e859e]">
              Setiap broadcast tetap ditinjau satu per satu sebelum terkirim.
            </span>
          </label>
        </div>
      </div>

      {wilayahTanpaLokasi && (
        <p className="mt-3 rounded-xl border border-[#f5c453] bg-[#fff4dc] p-3 text-xs leading-relaxed text-[#5c3700]">
          Isi dulu kota atau kabupaten lembaga ini di bagian atas halaman, lalu simpan. Tanpa wilayah,
          dasbornya akan kosong tanpa penjelasan.
        </p>
      )}
      {identitasTanpaWilayah && (
        <p className="mt-3 rounded-xl border border-[#f5c453] bg-[#fff4dc] p-3 text-xs leading-relaxed text-[#5c3700]">
          Kewenangan melihat identitas hanya berlaku bersama batas wilayah. Tanpa batas itu, ia menjadi
          kewenangan melihat nama tanpa satu pun kepentingan yang membatasinya.
        </p>
      )}
      {melonggarkan && !wilayahTanpaLokasi && !identitasTanpaWilayah && (
        <p className="mt-3 rounded-xl border border-[#f4b0a8] bg-[#feecea] p-3 text-xs leading-relaxed text-[#8a1c12]">
          Perubahan ini <strong className="font-bold">melonggarkan</strong> kewenangan, jadi ia butuh peran
          SUPER_ADMIN. Mengencangkan kembali bisa dilakukan peran OPS kapan saja.
        </p>
      )}

      <button
        type="button"
        onClick={() => void simpan()}
        disabled={busy || !berubah || wilayahTanpaLokasi || identitasTanpaWilayah}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0b5f86] px-5 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? "Menyimpan..." : "Simpan kewenangan"}
      </button>
    </section>
  );
}
