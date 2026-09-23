"use client";

/**
 * Kartu tingkat kesiapan di Beranda.
 *
 * Menggantikan kartu "17/100" dan cincin "6/7" — dua angka berbeda untuk satu
 * konsep, di satu layar yang sama. Keduanya juga tidak pernah bisa dijawab
 * ketika pemilik bertanya kenapa angkanya segitu.
 *
 * Kartu ini tidak menghitung apa pun. Ia membaca `GET /api/v1/readiness`, sama
 * persis dengan halaman Tingkat Kesiapan, sehingga mustahil ada dua jawaban
 * berbeda di dua layar.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { ReadinessLevelPayload } from "@/modules/readiness/level-repository";

/**
 * `data` diisi bila pemanggil sudah memuat kesiapan sendiri. Beranda dulu
 * meminta `/api/v1/readiness` dua kali pada setiap kunjungan: sekali untuk
 * langkah berikutnya, sekali lagi di dalam kartu ini.
 */
export function ReadinessMiniCard({ data: provided }: { data?: ReadinessLevelPayload | null } = {}) {
  const [fetched, setData] = useState<ReadinessLevelPayload | null>(null);
  const data = provided === undefined ? fetched : provided;

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/readiness");
      const payload = (await response.json()) as { data?: ReadinessLevelPayload };
      setData(payload.data ?? null);
    } catch {
      // Kesiapan bukan isi utama Beranda; kalau gagal dimuat, sisanya tetap
      // berguna dan kartunya cukup menghilang.
      setData(null);
    }
  }, []);

  useEffect(() => {
    if (provided !== undefined) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, provided]);

  if (!data) return null;

  const missingCount = data.nextLevel?.missing.length ?? 0;

  return (
    <Link
      href="/umkm/perjalanan"
      className="block rounded-2xl border border-umkm-line-strong bg-white px-4 py-3.5 transition-colors hover:bg-umkm-surface"
    >
      <span className="flex items-center justify-between text-[13px] text-umkm-muted">
        Tingkat kesiapan
        <ShieldCheck size={15} className="text-umkm-brand" />
      </span>
      <strong className="mt-0.5 block text-2xl font-bold text-umkm-ink">{data.levelName}</strong>

      {data.nextLevel && (
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-umkm-line">
          <i
            className="block h-full rounded-full bg-[#1fcb8f]"
            style={{ width: `${Math.round(data.nextLevel.progress * 100)}%` }}
          />
        </span>
      )}

      <span className="mt-2 block text-xs leading-relaxed text-umkm-muted">
        {data.nextLevel ? (
          <>
            {missingCount <= 1 ? "Tinggal satu syarat" : `${missingCount} syarat lagi`} menuju{" "}
            <b className="text-umkm-ink">{data.nextLevel.name}</b>
            {data.step && (
              <>
                {" "}· langkah tercepat:{" "}
                <span className="font-bold text-umkm-brand">{data.step.title.toLowerCase()}</span>
              </>
            )}
          </>
        ) : (
          "Catatan dan dokumen Anda sudah lengkap."
        )}
      </span>
    </Link>
  );
}
