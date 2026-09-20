"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Akun demo, dengan tombol salin.
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
 * Akun-akun ini memang dibuat untuk dipakai bersama-sama.
 *
 * SATU SANDI UNTUK SEMUANYA, DAN ITU DITULIS SEKALI.
 *
 * Seeder demo memakai satu `DEMO_PASSWORD` untuk seluruh persona. Menuliskan
 * sandi yang sama di tiap baris akun membuat halaman ini bertambah panjang
 * tanpa menambah satu pun keterangan -- dan kalau sandinya berganti, ada tiga
 * tempat yang harus ingat diubah, bukan satu.
 *
 * TOMBOL SALIN, BUKAN SEKADAR TEKS.
 *
 * Menyalin sandi 20 karakter dengan menahan jari di layar ponsel adalah cara
 * paling mudah kehilangan orang yang sudah hampir masuk. Satu ketukan lebih
 * pendek daripada satu ketikan yang salah.
 */

function TombolSalin({ nilai, label }: { nilai: string; label: string }) {
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
    <button
      type="button"
      onClick={salin}
      aria-label={tersalin ? label + " tersalin" : "Salin " + label}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-[#001b85] hover:text-[#001b85] active:scale-95"
    >
      {tersalin ? (
        <Check className="h-4 w-4 text-emerald-600" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}

/** Kata sandi bersama, satu baris di atas daftar akun. */
export function BarisSandi({ nilai }: { nilai: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#f4f6ff] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Kata sandi — sama untuk semua
        </p>
        {/*
          `break-all` supaya sandi yang panjang tetap terbaca utuh di layar
          360px, bukan terpotong elipsis -- yang terpotong tidak bisa disalin
          dengan tangan kalau papan klipnya kebetulan ditolak.
        */}
        <p className="break-all font-mono text-[13px] font-bold leading-5 text-[#141a34]">{nilai}</p>
      </div>
      <TombolSalin nilai={nilai} label="kata sandi" />
    </div>
  );
}

/**
 * Satu akun: perannya, apa yang akan dilihat, dan surelnya.
 *
 * Perannya ditulis di depan karena itu yang dicari orang ("saya dinas, yang
 * mana punya saya?"). Surel tanpa keterangan peran memaksa menebak.
 */
export function BarisPeran({
  peran,
  lembaga,
  lihat,
  email,
}: {
  peran: string;
  lembaga: string;
  lihat: string;
  email: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#001b85]">{peran}</p>
        <p className="mt-0.5 text-[13px] font-bold leading-tight text-[#141a34]">{lembaga}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{lihat}</p>
        <p className="mt-1.5 break-all font-mono text-[12px] leading-4 text-slate-600">{email}</p>
      </div>
      <TombolSalin nilai={email} label={"surel " + peran.toLowerCase()} />
    </div>
  );
}
