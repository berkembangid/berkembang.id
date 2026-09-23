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
import { CalendarCheck, Check, Link2, MapPin, Megaphone } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess } from "@/lib/notify";

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

export function BroadcastInvitations() {
  const { confirm } = useConfirm();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/broadcasts", { cache: "no-store" });
      const body = await response.json();
      setInvitations(response.ok ? (body.data as Invitation[]) : []);
    } catch {
      setInvitations([]);
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

  if (invitations.length === 0) return null;

  return (
    <section className="rounded-2xl border border-umkm-line bg-white p-4 shadow-[0_8px_28px_rgba(27,42,58,.04)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand-hover"><Megaphone size={17} /></span>
        <div>
          <p className="text-sm font-bold text-umkm-ink">Tawaran pendampingan</p>
          <p className="text-xs text-umkm-subtle">Dari dinas di wilayah usaha Anda. Gratis, dan ikut atau tidak sepenuhnya pilihan Anda.</p>
        </div>
      </div>

      <ul className="mt-3 grid gap-3">
        {invitations.map((row) => (
          <li key={row.id} className="rounded-xl border border-umkm-line p-3">
            <p className="text-xs font-bold text-umkm-brand">{row.institutionName}</p>
            <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-umkm-ink">{row.message}</p>

            {(row.eventDate || row.eventPlace || row.eventLink) && (
              <p className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-umkm-subtle">
                {row.eventDate && <span className="inline-flex items-center gap-1"><CalendarCheck size={11} /> {tanggal(row.eventDate)}</span>}
                {row.eventPlace && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {row.eventPlace}</span>}
                {row.eventLink && <a href={row.eventLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-bold text-umkm-brand underline underline-offset-2"><Link2 size={11} /> Tautan pendaftaran</a>}
              </p>
            )}

            {row.joinedAt ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-umkm-success-line bg-umkm-success-soft px-2.5 text-xs font-bold text-umkm-success">
                  <Check size={11} /> Anda ikut
                </span>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void ubah(row, false)}
                  className="text-xs font-bold text-umkm-subtle underline underline-offset-2 disabled:opacity-50"
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
        ))}
      </ul>
    </section>
  );
}
