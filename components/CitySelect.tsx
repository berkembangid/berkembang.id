"use client";

import { MapPin } from "lucide-react";
import wilayah from "@/config/kota-indonesia.json";
import SearchableSelect, { type SearchableOption } from "@/components/SearchableSelect";

/**
 * Daftar wilayahnya TIDAK tinggal di sini.
 *
 * Nilai yang dipilih di layar ini tersimpan apa adanya ke
 * `businesses.location`, lalu dibandingkan sebagai teks yang sama persis
 * dengan `institutions.location` oleh ringkasan wilayah dinas (`0082`-`0084`).
 * Jadi daftar ini bukan sekadar isi dropdown -- ia kunci yang menentukan
 * sebuah usaha terlihat oleh pembinanya atau tidak.
 *
 * Ketika daftarnya hidup di berkas ini, skrip seed menulis nama kotanya
 * sendiri dan keduanya menyimpang tanpa satu pun galat. Sekarang keduanya
 * membaca `config/kota-indonesia.json`, dan penyimpangannya tertangkap tes.
 */
export const INDONESIA_CITIES: readonly string[] = wilayah.kota;

const CITY_OPTIONS: readonly SearchableOption[] = INDONESIA_CITIES.map((city) => ({ value: city }));

interface CitySelectProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Id tombol pemicu, supaya `<label htmlFor>` bisa menamainya. */
  id?: string;
}

export default function CitySelect({
  placeholder = "Pilih Kota / Kabupaten...",
  ...props
}: CitySelectProps) {
  return (
    <SearchableSelect
      {...props}
      options={CITY_OPTIONS}
      icon={MapPin}
      placeholder={placeholder}
      searchLabel="Cari kota atau kabupaten"
      searchPlaceholder="Cari kota / kabupaten..."
      listLabel="Kota atau kabupaten"
      emptyText="Kota tidak ditemukan."
    />
  );
}
