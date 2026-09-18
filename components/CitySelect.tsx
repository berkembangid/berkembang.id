"use client";

import { useState, useRef, useEffect } from "react";
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
}

export default function CitySelect({
  value,
  onChange,
  placeholder = "Pilih Kota / Kabupaten...",
  disabled = false,
  required = false,
  className = "",
}: CitySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 pl-10 pr-10 rounded-xl border text-sm text-left flex items-center justify-between transition-colors bg-white cursor-pointer ${
          isOpen
            ? "border-[#001b85] ring-2 ring-[#001b85]/10"
            : "border-[#c5c5d7] hover:border-[#001b85]"
        } disabled:bg-slate-50 disabled:cursor-not-allowed`}
      >
        <MapPin size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <span className={`truncate font-medium ${value ? "text-slate-800" : "text-slate-400"}`}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Hidden input for form requirement enforcement */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          tabIndex={-1}
          className="opacity-0 pointer-events-none absolute bottom-0 left-1/2 w-1 h-1"
        />
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-fade-in">
          {/* Search Box */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kota / kabupaten..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-[#001b85] focus:outline-none bg-white"
              />
            </div>
          </div>

          {/* List Options */}
          <div className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
            {filteredCities.length === 0 ? (
              <div className="px-4 py-3 text-center text-xs text-slate-400 font-medium">
                Kota tidak ditemukan.
              </div>
            ) : (
              filteredCities.map((city) => {
                const isSelected = value === city;
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      onChange(city);
                      setIsOpen(false);
                      setSearchQuery("");
                    }}
                    className={`w-full px-4 py-2 text-xs text-left font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#001b85]/10 text-[#001b85] font-bold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{city}</span>
                    {isSelected && <Check size={14} className="text-[#001b85]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
