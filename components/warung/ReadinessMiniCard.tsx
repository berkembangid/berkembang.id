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

export function ReadinessMiniCard() {
  const [data, setData] = useState<ReadinessLevelPayload | null>(null);

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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!data) return null;

  const missingCount = data.nextLevel?.missing.length ?? 0;

  return (
    <Link
      href="/umkm/kesiapan"
      className="block rounded-2xl border border-[#c8d3de] bg-white px-4 py-3.5 transition-colors hover:bg-[#f7f9fb]"
    >
      <span className="flex items-center justify-between text-[13px] text-[#4a6280]">
        Tingkat kesiapan
        <ShieldCheck size={15} className="text-[#0b5f86]" />
      </span>
      <strong className="mt-0.5 block text-2xl font-bold text-[#1b2a3a]">{data.levelName}</strong>

      {data.nextLevel && (
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[#e3e9f0]">
          <i
            className="block h-full rounded-full bg-[#1fcb8f]"
            style={{ width: `${Math.round(data.nextLevel.progress * 100)}%` }}
          />
        </span>
      )}

      <span className="mt-2 block text-[11px] leading-relaxed text-[#4a6280]">
        {data.nextLevel ? (
          <>
            {missingCount <= 1 ? "Tinggal satu syarat" : `${missingCount} syarat lagi`} menuju{" "}
            <b className="text-[#1b2a3a]">{data.nextLevel.name}</b>
            {data.step && (
              <>
                {" "}· langkah tercepat:{" "}
                <span className="font-bold text-[#0b5f86]">{data.step.title.toLowerCase()}</span>
              </>
            )}
          </>
        ) : (
          "Catatan dan dokumenmu sudah lengkap."
        )}
      </span>
    </Link>
  );
}
