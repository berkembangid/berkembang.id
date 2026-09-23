"use client";

/**
 * Tawaran dinas pembina di Beranda.
 *
 * AKIBATNYA DISEBUT SEBELUM TOMBOLNYA, BUKAN SESUDAH.
 *
 * Yang dibuka izin ini adalah nama usaha dan nama pemilik kepada sebuah kantor
 * pemerintah. Kartu yang hanya berbunyi "hubungkan dengan dinas" menawarkan
 * sesuatu yang akibatnya tidak terbaca -- dan izin yang akibatnya tidak
 * terbaca bukan izin yang terinformasi, apa pun yang tertulis di ketentuan.
 *
 * KENAPA HANYA MENGANTAR KE PROFIL, BUKAN MEMBERI IZIN DI SINI.
 *
 * Kartu ini TIDAK punya tombol "Ya, hubungkan". Izinnya diberikan di halaman
 * Profil, tempat daftar dinasnya terlihat, tempat akibatnya tertulis penuh,
 * dan tempat tombol cabutnya berada sejak awal. Satu ketukan dari Beranda yang
 * langsung menyerahkan identitas bukan kemudahan; ia memindahkan keputusan ke
 * layar yang tidak menjelaskannya.
 *
 * "NANTI DULU" KELAS SATU.
 *
 * Bukan tautan kecil di sudut. Pemilik yang tidak mau ditanya lagi harus bisa
 * menjawab dengan satu ketukan yang sama mudahnya dengan menerima -- kalau
 * tidak, yang terkumpul bukan persetujuan melainkan kelelahan.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Eye } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError } from "@/lib/notify";

type Offer = {
  shouldOffer: boolean;
  optionCount?: number;
  institutionName?: string | null;
};

export function DinasOfferCard() {
  const { confirm } = useConfirm();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/dinas-offer", { cache: "no-store" });
      const body = await response.json();
      setOffer(response.ok ? (body.data as Offer) : { shouldOffer: false });
    } catch {
      setOffer({ shouldOffer: false });
    }
  }, []);

  // Pola yang sama dengan kartu beranda lain: ditunda satu putaran supaya
  // pemuatan tidak terjadi di dalam render.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function tunda() {
    // Dikonfirmasi sekali, karena penundaannya PERMANEN -- kartu ini tidak
    // akan muncul lagi. Tanpa konfirmasi, satu ketukan salah menghilangkan
    // satu-satunya tempat pemilik akan pernah mengetahui pilihan ini.
    const yes = await confirm({
      title: "Tidak perlu ditawari lagi?",
      description:
        "Kartu ini tidak akan muncul lagi. Anda tetap bisa memilih dinas pembina kapan saja " +
        "di halaman Profil usaha.",
      confirmLabel: "Ya, jangan tawari lagi",
      cancelLabel: "Batal",
    });
    if (!yes) return;

    setBusy(true);
    setOffer({ shouldOffer: false });
    try {
      const response = await fetch("/api/v1/dinas-offer", { method: "POST" });
      if (!response.ok) throw new Error("Penundaan belum tersimpan.");
    } catch (error) {
      notifyFromError(error, "Tawaran ini mungkin muncul sekali lagi nanti.");
    } finally {
      setBusy(false);
    }
  }

  if (!offer?.shouldOffer) return null;

  const named = offer.institutionName;

  return (
    <section className="rounded-2xl border border-umkm-brand-line bg-umkm-brand-soft p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-white text-umkm-brand-hover">
          <Building2 size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-umkm-ink">
            {named ? `${named} bisa mendampingi usaha Anda` : "Dinas di kota Anda bisa mendampingi usaha Anda"}
          </p>
          <p className="text-xs text-umkm-muted">Gratis, dan sepenuhnya pilihan Anda.</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-umkm-ink">
        Dinas pembina bisa melihat keadaan usaha Anda dan mengundang Anda ke pendampingan.
      </p>

      {/* Akibatnya, disebut terang-terangan dan sebelum tombolnya. */}
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-umkm-brand-deep">
        <Eye size={13} className="mt-0.5 shrink-0" />
        <span>
          Kalau Anda memilihnya, <strong className="font-bold">nama usaha dan nama Anda</strong> akan
          terlihat oleh dinas itu. Sekarang mereka tidak tahu siapa Anda, dan Anda bisa mencabutnya
          kapan saja. Catatan keuangan Anda tetap tertutup.
        </span>
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/umkm/profil"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white"
        >
          Lihat selengkapnya <ArrowRight size={15} />
        </Link>
        <button
          type="button"
          onClick={() => void tunda()}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-umkm-line-strong bg-white px-4 text-xs font-bold text-umkm-ink-soft disabled:opacity-50"
        >
          Nanti dulu
        </button>
      </div>
    </section>
  );
}
