"use client";

import { useState, useRef, useEffect, useId } from "react";
import { MapPin, Search, ChevronDown, Check } from "lucide-react";
import wilayah from "@/config/kota-indonesia.json";

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

/**
 * Warna aksen dibaca dari `--city-accent`.
 *
 * Komponen ini dipakai di halaman daftar (palet nila) dan di Ruang Usaha
 * (palet biru UMKM). Cangkang UMKM mengisi variabelnya; di tempat lain nilai
 * cadangannya tetap nila seperti sebelumnya.
 */
export default function CitySelect({
  value,
  onChange,
  placeholder = "Pilih Kota / Kabupaten...",
  disabled = false,
  required = false,
  className = "",
  id,
}: CitySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCities = INDONESIA_CITIES.filter((city) =>
    city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pilihan yang disorot panah selalu terlihat, juga di daftar yang digulir.
  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, baseId]);

  function open() {
    const selected = INDONESIA_CITIES.indexOf(value);
    setSearchQuery("");
    setActiveIndex(selected >= 0 ? selected : 0);
    setIsOpen(true);
  }

  function close(returnFocus: boolean) {
    setIsOpen(false);
    setSearchQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(city: string) {
    onChange(city);
    close(true);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const last = filteredCities.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, last));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(last, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const city = filteredCities[activeIndex];
      if (city) choose(city);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={(event) => {
          if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            open();
          }
        }}
        className={`flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl border bg-white px-4 py-3 pl-10 pr-10 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-50 ${
          isOpen
            ? `border-[var(--city-accent,#001b85)] ring-2 ring-[var(--city-accent,#001b85)]/10`
            : `border-[#c5c5d7] hover:border-[var(--city-accent,#001b85)]`
        }`}
      >
        <MapPin size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <span className={`truncate font-medium ${value ? "text-slate-800" : "text-slate-500"}`}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} aria-hidden className={`text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Penjaga `required` formulir; bukan kontrol yang bisa difokus. */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-1 w-1 opacity-0"
        />
      )}

      {isOpen && (
        <div className="animate-fade-in absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 bg-slate-50/50 p-2.5">
            <div className="relative">
              <Search size={14} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                role="combobox"
                aria-label="Cari kota atau kabupaten"
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={filteredCities.length > 0 ? optionId(activeIndex) : undefined}
                autoFocus
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder="Cari kota / kabupaten..."
                className={`min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm focus:border-[var(--city-accent,#001b85)] focus:outline-none`}
              />
            </div>
          </div>

          <div ref={listRef} id={listId} role="listbox" aria-label="Kota atau kabupaten" className="custom-scrollbar max-h-64 overflow-y-auto py-1">
            {filteredCities.length === 0 ? (
              <div role="status" className="px-4 py-3 text-center text-xs font-medium text-slate-500">
                Kota tidak ditemukan.
              </div>
            ) : (
              filteredCities.map((city, index) => {
                const isSelected = value === city;
                const isActive = index === activeIndex;
                return (
                  <div
                    key={city}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(city)}
                    className={`flex min-h-11 w-full cursor-pointer items-center justify-between px-4 text-left text-sm font-medium transition-colors ${
                      isSelected ? `font-bold text-[var(--city-accent,#001b85)]` : "text-slate-700"
                    } ${isActive ? "bg-slate-100" : ""}`}
                  >
                    <span>{city}</span>
                    {isSelected && <Check size={14} aria-hidden className={`text-[var(--city-accent,#001b85)]`} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
