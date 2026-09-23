"use client";

/**
 * Kartu beranda untuk tawaran pendampingan dari dinas.
 *
 * MENEKAN "SAYA IKUT" ADALAH MEMBERI IZIN, BUKAN MENDAFTAR ACARA.
 *
 * Pada detik itu nama usaha dan nama pemilik terbuka bagi dinas yang
 * mengundang. Karena itu kartunya menyebut akibat itu sebelum tombolnya
 * ditekan, bukan sesudahnya -- dan dialog konfirmasinya mengulanginya dengan
 * nama dinasnya, supaya yang dibenarkan pemiliknya adalah hal yang benar-benar
 * terjadi.
 *
 * Sebelum ditekan, dinas tidak tahu siapa yang menerima tawaran ini. Itu
 * seluruh gunanya: dinas tidak butuh identitas untuk menolong, yang ia butuh
 * adalah orangnya datang.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Link2, MapPin, Megaphone } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { jakartaDate } from "@/modules/ledger/ledger-schema";

type Invitation = {
  id: string;
  institutionName: string;
  message: string;
  eventDate: string | null;
  eventPlace: string | null;
  eventLink: string | null;
  deliveredAt: string | null;
  joinedAt: string | null;
};

function tanggal(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Tanggal acara sudah lewat -- dibandingkan dengan tanggal Jakarta. */
function isPast(row: Invitation, today: string) {
  return Boolean(row.eventDate && row.eventDate.slice(0, 10) < today);
}

/**
 * `beranda`: hanya tawaran yang masih berlaku, paling banyak dua, dan tidak
 * tampil sama sekali bila kosong -- Beranda dibuka setiap hari dan tidak
 * boleh dipenuhi pengumuman lama.
 *
 * `full`: riwayat lengkap untuk layar Izin & program, termasuk yang sudah
 * lewat. Di sini kosong dan gagal DIKATAKAN, bukan disembunyikan: dulu kartu
 * yang gagal dimuat hilang begitu saja dan terbaca « tidak ada tawaran ».
 */
export function BroadcastInvitations({ variant = "beranda" }: { variant?: "beranda" | "full" }) {
  const { confirm } = useConfirm();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [today] = useState(() => jakartaDate());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/broadcasts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error("gagal");
      setInvitations(body.data as Invitation[]);
      setState("ready");
    } catch {
      setInvitations([]);
      setState("failed");
    }
  }, []);

  // Pola yang sama dengan kartu beranda lain: ditunda satu putaran supaya
  // pemuatan tidak terjadi di dalam render.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function ubah(row: Invitation, ikut: boolean) {
    const yes = ikut
      ? await confirm({
          title: "Ikut tawaran ini?",
          description: `Nama usaha dan nama Anda akan terlihat oleh ${row.institutionName} supaya mereka bisa menghubungi Anda soal kegiatan ini. Sebelum ini mereka tidak tahu siapa Anda. Anda bisa membatalkan kapan saja, dan nama Anda keluar dari daftar mereka.`,
          confirmLabel: "Ya, saya ikut",
          cancelLabel: "Nanti dulu",
        })
      : await confirm({
          title: "Batal ikut?",
          description: `Nama Anda keluar dari daftar peserta ${row.institutionName}.`,
          confirmLabel: "Batal ikut",
          cancelLabel: "Tetap ikut",
          tone: "danger",
        });
    if (!yes) return;

    setBusyId(row.id);
    try {
      const response = await fetch("/api/v1/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broadcastId: row.id, join: ikut }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Belum berhasil disimpan.");
      notifySuccess(ikut
        ? `Sudah tercatat ikut. ${row.institutionName} akan menghubungi Anda.`
        : "Sudah dibatalkan. Nama Anda keluar dari daftar peserta.");
      await load();
    } catch (error) {
      notifyFromError(error, "Belum berhasil disimpan.");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Tautan pendaftaran ditulis dinas, bukan oleh kami. Pemilik diberi tahu
   * alamat mana yang akan dibuka sebelum meninggalkan aplikasi, supaya tautan
   * yang keliru atau menyamar tidak terbuka tanpa terbaca.
   */
  async function openLink(row: Invitation) {
    if (!row.eventLink) return;
    let host = row.eventLink;
    try {
      const url = new URL(row.eventLink);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protokol");
      host = url.host;
    } catch {
      notifyFromError(new Error("Tautan ini tidak bisa dibuka."), "Tautan ini tidak bisa dibuka.");
      return;
    }
    const yes = await confirm({
      title: "Buka situs di luar Berkembang?",
      description: `Tautan dari ${row.institutionName} membuka ${host}. Jangan memasukkan kata sandi atau kode OTP di sana kecuali Anda yakin itu situs resmi dinas.`,
      confirmLabel: "Buka",
      cancelLabel: "Batal",
    });
    if (yes) window.open(row.eventLink, "_blank", "noopener,noreferrer");
  }

  const current = invitations.filter((row) => !isPast(row, today));
  const shown = variant === "beranda" ? current.slice(0, 2) : invitations;

  if (variant === "beranda" && shown.length === 0) return null;

  return (
    <section className="rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand-hover"><Megaphone size={17} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-umkm-ink">Tawaran pendampingan</p>
          <p className="text-xs text-umkm-subtle">Dari dinas di wilayah usaha Anda. Gratis, dan ikut atau tidak sepenuhnya pilihan Anda.</p>
        </div>
        {variant === "beranda" && current.length > shown.length && (
          <Link href="/umkm/profil/izin#izin-program" className="inline-flex min-h-11 shrink-0 items-center text-xs font-bold text-umkm-brand">
            Semua ({current.length})
          </Link>
        )}
      </div>

      {variant === "full" && state === "loading" && <p role="status" className="mt-3 text-xs text-umkm-subtle">Memuat tawaran…</p>}
      {variant === "full" && state === "failed" && (
        <p role="alert" className="mt-3 rounded-xl bg-umkm-warning-soft p-3 text-xs text-umkm-warning">
          Tawaran belum dapat dimuat.{" "}
          <button type="button" onClick={() => { setState("loading"); void load(); }} className="inline-flex min-h-11 items-center font-bold underline">Coba lagi</button>
        </p>
      )}
      {variant === "full" && state === "ready" && invitations.length === 0 && (
        <p className="mt-3 rounded-xl bg-umkm-surface p-3 text-xs text-umkm-muted">Belum ada tawaran. Tawaran dari dinas pembina di wilayah Anda akan muncul di sini dan di pemberitahuan.</p>
      )}

      {shown.length > 0 && (
        <ul className="mt-3 grid gap-3">
          {shown.map((row) => {
            const past = isPast(row, today);
            return (
              <li key={row.id} className={`rounded-xl border border-umkm-line p-3 ${past ? "bg-umkm-surface" : ""}`}>
                <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-umkm-brand">
                  {row.institutionName}
                  {past && <span className="rounded-full bg-umkm-line px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-umkm-muted">Sudah lewat</span>}
                </p>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-umkm-ink">{row.message}</p>

                {(row.eventDate || row.eventPlace || row.eventLink) && (
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-umkm-subtle">
                    {row.eventDate && <span className="inline-flex items-center gap-1"><CalendarCheck size={12} aria-hidden /> {tanggal(row.eventDate)}</span>}
                    {row.eventPlace && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden /> {row.eventPlace}</span>}
                    {row.eventLink && !past && (
                      <button type="button" onClick={() => void openLink(row)} className="inline-flex min-h-11 items-center gap-1 font-bold text-umkm-brand underline underline-offset-2">
                        <Link2 size={12} aria-hidden /> Tautan pendaftaran
                      </button>
                    )}
                  </p>
                )}

                {past ? (
                  row.joinedAt && <p className="mt-2 text-xs font-semibold text-umkm-success">Anda ikut kegiatan ini.</p>
                ) : row.joinedAt ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-umkm-success-line bg-umkm-success-soft px-2.5 text-xs font-bold text-umkm-success">
                      <Check size={12} aria-hidden /> Anda ikut
                    </span>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void ubah(row, false)}
                      className="inline-flex min-h-11 items-center text-xs font-bold text-umkm-muted underline underline-offset-2 disabled:opacity-50"
                    >
                      Batal ikut
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-xs leading-relaxed text-umkm-subtle">
                      Kalau Anda ikut, nama usaha dan nama Anda akan terlihat oleh dinas ini. Sekarang
                      mereka belum tahu siapa Anda.
                    </p>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void ubah(row, true)}
                      className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {busyId === row.id ? "Menyimpan..." : "Saya ikut"}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
