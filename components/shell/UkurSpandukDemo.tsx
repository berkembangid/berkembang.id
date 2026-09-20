"use client";

import { useLayoutEffect } from "react";

/**
 * Mengumumkan tinggi spanduk lingkungan sebagai `--tinggi-spanduk`.
 *
 * MASALAHNYA: SPANDUK ITU MENUTUPI HEADER, DAN TOMBOLNYA JADI MATI.
 *
 * Spanduk demo menempel di puncak layar. Header UMKM juga menempel di puncak
 * layar begitu halaman digulir. Keduanya benar sendiri-sendiri; bersama, yang
 * satu duduk persis di atas yang lain -- dan sentuhan pada tombol di header
 * jatuh ke spanduk, bukan ke tombolnya. Di lingkungan demo, menu akun UMKM
 * tidak bisa dibuka sama sekali begitu halaman digulir, di ponsel maupun di
 * layar lebar.
 *
 * KENAPA DIUKUR, BUKAN DITULIS ANGKANYA.
 *
 * Tinggi spanduk berubah menurut lebar layar: satu baris 27px di layar lebar,
 * dua baris 59px di ponsel. Menuliskan angka itu di CSS berarti menyimpan
 * fakta yang sama di dua tempat, dan yang kedua akan basi diam-diam begitu
 * kalimat spanduknya disunting seorang saja. Yang diukur adalah spanduk yang
 * sungguhan dirender, jadi tidak ada yang bisa basi.
 *
 * `ResizeObserver` dipasang karena tingginya berubah tanpa halaman dimuat
 * ulang -- memutar ponsel dari tegak ke rebah mengubahnya dari dua baris
 * menjadi satu.
 *
 * KOMPONEN KLIEN, TAPI TIDAK MEMBAWA RAHASIA APA PUN.
 *
 * `APP_MODE` tetap tinggal di server: komponen ini hanya dirender kalau
 * spanduknya sudah dirender, dan ia mengukur DOM, bukan membaca env. Yang
 * diketahui peramban dari keberadaannya -- "ini demo" -- sudah tertulis besar
 * di spanduk yang diukurnya.
 */
export function UkurSpandukDemo() {
  useLayoutEffect(() => {
    const spanduk = document.querySelector<HTMLElement>("[data-spanduk-lingkungan]");
    if (!spanduk) return;

    const akar = document.documentElement;
    const tulis = () => {
      const tinggi = Math.round(spanduk.getBoundingClientRect().height);
      akar.style.setProperty("--tinggi-spanduk", `${tinggi}px`);
    };

    tulis();
    const pengamat = new ResizeObserver(tulis);
    pengamat.observe(spanduk);

    return () => {
      pengamat.disconnect();
      // Dibersihkan: kalau spanduknya hilang, header tidak boleh terus
      // menyisakan ruang untuk sesuatu yang sudah tidak ada.
      akar.style.removeProperty("--tinggi-spanduk");
    };
  }, []);

  return null;
}
