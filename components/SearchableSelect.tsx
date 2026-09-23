"use client";

import { useState, useRef, useEffect, useId, type ComponentType } from "react";
import { Search, ChevronDown, Check } from "lucide-react";

export type SearchableOption = {
  /** Nilai yang disimpan, dan teks yang tampil di tombol pemicu. */
  value: string;
  /** Keterangan kecil di bawah nilai, misalnya nama lengkap bank. */
  hint?: string;
  /** Kata lain yang ikut dicocokkan pencarian ("mandiri", "bri"). */
  keywords?: string;
  /** Selalu tampil di ujung daftar, apa pun yang dicari -- pintu keluar "lainnya". */
  alwaysShow?: boolean;
};

interface SearchableSelectProps {
  options: readonly SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  placeholder: string;
  searchLabel: string;
  searchPlaceholder: string;
  listLabel: string;
  emptyText: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Id tombol pemicu, supaya `<label htmlFor>` bisa menamainya. */
  id?: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Pilihan dari daftar panjang yang bisa dicari dan dipakai dengan papan ketik.
 *
 * Dipakai CitySelect (±500 kota) dan pilihan bank rekening (±100 bank).
 * `<select>` bawaan tidak bisa dicari di ponsel, dan daftar sepanjang itu
 * tidak bisa digulir sampai ketemu.
 *
 * Warna aksen dibaca dari `--city-accent`: cangkang UMKM mengisinya dengan
 * biru UMKM, di tempat lain nilai cadangannya nila.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  icon: Icon,
  placeholder,
  searchLabel,
  searchPlaceholder,
  listLabel,
  emptyText,
  disabled = false,
  required = false,
  className = "",
  id,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  // Dicocokkan tanpa spasi dan tanda baca: "bankdki", "bank dki", dan
  // "B.D.K.I" sama-sama menemukan Bank DKI.
  const query = normalize(searchQuery);
  const filtered = options.filter(
    (option) =>
      option.alwaysShow ||
      !query ||
      normalize(`${option.value} ${option.hint ?? ""} ${option.keywords ?? ""}`).includes(query),
  );
  const hasMatch = filtered.some((option) => !option.alwaysShow);

  // Pilihan yang disorot panah selalu terlihat, juga di daftar yang digulir.
  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, baseId]);

  function open() {
    const selected = options.findIndex((option) => option.value === value);
    setSearchQuery("");
    setActiveIndex(selected >= 0 ? selected : 0);
    setIsOpen(true);
  }

  function close(returnFocus: boolean) {
    setIsOpen(false);
    setSearchQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(next: string) {
    onChange(next);
    close(true);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const last = filtered.length - 1;
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
      const option = filtered[activeIndex];
      if (option) choose(option.value);
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
        <Icon size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
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
                aria-label={searchLabel}
                aria-expanded
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={filtered.length > 0 ? optionId(activeIndex) : undefined}
                autoFocus
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                className={`min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm focus:border-[var(--city-accent,#001b85)] focus:outline-none`}
              />
            </div>
          </div>

          <div id={listId} role="listbox" aria-label={listLabel} className="custom-scrollbar max-h-64 overflow-y-auto py-1">
            {!hasMatch && (
              <div role="status" className="px-4 py-3 text-center text-xs font-medium text-slate-500">
                {emptyText}
              </div>
            )}
            {filtered.map((option, index) => {
              const isSelected = value === option.value;
              const isActive = index === activeIndex;
              return (
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option.value)}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-4 py-1.5 text-left text-sm font-medium transition-colors ${
                    isSelected ? `font-bold text-[var(--city-accent,#001b85)]` : "text-slate-700"
                  } ${isActive ? "bg-slate-100" : ""} ${option.alwaysShow ? "border-t border-slate-100" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block">{option.value}</span>
                    {option.hint && <span className="block text-xs font-normal text-slate-500">{option.hint}</span>}
                  </span>
                  {isSelected && <Check size={14} aria-hidden className={`shrink-0 text-[var(--city-accent,#001b85)]`} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
