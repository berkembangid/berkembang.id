"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Baris akun demo, dengan tombol salin.
 *
 * KENAPA SANDINYA DITULIS TERANG-TERANGAN DI HALAMAN PUBLIK.
 *
 * Halaman ini tujuan QR di poster. Yang memindainya sedang berdiri di depan
 * poster, memegang ponsel, dan tidak punya siapa-siapa untuk dimintai akun.
 * Situs demo sendiri tidak menyebut akun contohnya di mana pun -- jadi tanpa
 * baris ini, tombol "Coba demo" mendarat di halaman masuk yang tidak bisa
 * dilewati, dan orangnya pergi.
 *
 * Yang dibuka bukan data siapa pun: basis datanya terpisah dari produksi,
 * isinya usaha karangan, dan setiap layarnya berspanduk "LINGKUNGAN DEMO".
 * Akun ini memang dibuat untuk dipakai bersama-sama.
 *
 * TOMBOL SALIN, BUKAN SEKADAR TEKS.
 *
 * Menyalin sandi 20 karakter dengan menahan jari di layar ponsel adalah cara
 * paling mudah kehilangan orang yang sudah hampir masuk. Satu ketukan lebih
 * pendek daripada satu ketikan yang salah.
 */
export function BarisAkun({ label, nilai }: { label: string; nilai: string }) {
  const [tersalin, setTersalin] = useState(false);

  async function salin() {
    try {
      await navigator.clipboard.writeText(nilai);
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 1800);
    } catch {
      // Peramban yang menolak papan klip (atau konteks tanpa izin) tidak
      // membuat halaman ini gagal: nilainya tetap tertulis dan bisa disalin
      // dengan tangan. Tidak ada gunanya memunculkan galat untuk itu.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        {/*
          `break-all` supaya surel dan sandi yang panjang tetap terbaca utuh di
          layar 360px, bukan terpotong elipsis -- yang terpotong tidak bisa
          disalin dengan tangan kalau papan klipnya kebetulan ditolak.
        */}
        <p className="break-all font-mono text-[13px] font-bold leading-5 text-[#141a34]">{nilai}</p>
      </div>
      <button
        type="button"
        onClick={salin}
        aria-label={tersalin ? label + " tersalin" : "Salin " + label.toLowerCase()}
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-[#001b85] hover:text-[#001b85] active:scale-95"
      >
        {tersalin ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}
