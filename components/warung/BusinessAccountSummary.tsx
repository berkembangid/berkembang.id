"use client";

/**
 * Ringkasan rekening usaha di halaman Profil — dibaca, tidak pernah ditulis.
 *
 * Sejajar dengan `LegalitySummary`, dan karena alasan yang sama: yang
 * menyimpan keadaannya satu tempat (layar Rekening), dan blok ini hanya
 * menautkan ke sana. Kalau ia ikut menyunting, akan ada dua layar yang
 * menyimpan hal yang sama dan keduanya bisa berbeda.
 *
 * Kalimat keadaannya diambil dari `rekeningStageCopy`, bukan ditulis ulang di
 * sini -- supaya pemilik tidak membaca dua penjelasan berbeda untuk satu
 * keadaan yang sama.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Landmark, LoaderCircle } from "lucide-react";
import { ambilRekening } from "@/modules/rekening/rekening-client";
import { rekeningStageCopy, type RekeningUsaha } from "@/modules/rekening/rekening-schema";

export function BusinessAccountSummary() {
  const [rekening, setRekening] = useState<RekeningUsaha | null>(null);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setRekening(await ambilRekening());
      } catch {
        // Ringkasan ini bukan isi utama halaman Profil; kegagalannya tampil
        // sebagai keadaan "belum dicatat", bukan sebagai pesan galat yang
        // menakut-nakuti.
        setRekening(null);
      } finally {
        setMemuat(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const stage = rekening?.stage ?? 0;
  const copy = rekeningStageCopy[stage];

  if (memuat) {
    return (
      <p className="flex items-center gap-2 px-1 py-2 text-xs text-umkm-subtle">
        <LoaderCircle size={12} className="animate-spin" /> Memuat…
      </p>
    );
  }

  return (
    <Link
      href="/umkm/profil/rekening"
      className="flex items-center gap-3 rounded-xl border border-umkm-line bg-white px-3 py-2.5 transition-colors hover:bg-umkm-surface"
    >
      <Landmark
        size={15}
        className={`shrink-0 ${stage === 2 ? "text-umkm-success" : stage === 1 ? "text-umkm-warning" : "text-umkm-faint"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-umkm-ink">
          Rekening usaha
          {stage === 2 && <span className="ml-1.5 text-umkm-success">✓</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-umkm-subtle">
          {rekening
            ? `${rekening.bankName} •••• ${rekening.accountLast4} · ${copy.badge}`
            : copy.badge}
        </p>
      </div>
      <ChevronRight size={14} className="shrink-0 text-umkm-faint" />
    </Link>
  );
}
