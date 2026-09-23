"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, ChevronDown, FileCheck2, Mic, Route, Search, Sparkles } from "lucide-react";
import { DashboardPage, DashboardPanel, PageHeader } from "@/components/dashboard";
import { faqCategories, searchFaq, type FaqCategory } from "@/modules/panduan/faq";

const guides = [
  { title: "Catat transaksi", description: "Suara, foto nota, atau tulisan — hasilnya selalu Anda periksa dulu.", href: "/umkm/catat", icon: Mic, action: "Mulai mencatat" },
  { title: "Pahami kondisi kas", description: "Uang masuk, biaya, dan selisih pada periode yang Anda pilih.", href: "/umkm/laporan", icon: BarChart3, action: "Buka laporan" },
  { title: "Lengkapi dokumen", description: "Dokumen yang sudah ada dan yang masih perlu dilengkapi.", href: "/umkm/profil/dokumen", icon: FileCheck2, action: "Periksa dokumen" },
  { title: "Langkah berikutnya", description: "Rekomendasi dari bukti usaha yang sudah tercatat.", href: "/umkm/perjalanan", icon: Route, action: "Lihat perjalanan" },
];

/**
 * Panduan: jalan pintas ke fitur, lalu jawaban yang bisa dicari.
 *
 * Judul lama menjanjikan « tanya apa saja soal usaha » padahal isinya empat
 * tautan. Sekarang janjinya disesuaikan dengan isinya: jawaban singkat yang
 * pasti benar untuk aplikasi ini, bukan asisten yang menebak.
 */
export default function PanduanUsahaPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FaqCategory | "semua">("semua");
  const results = useMemo(() => searchFaq(query, category), [query, category]);

  return (
    <DashboardPage width="compact">
      <PageHeader title="Panduan usaha" description="Jalan pintas ke fitur yang tepat, dan jawaban untuk pertanyaan yang sering muncul." icon={Sparkles} />

      <div className="grid grid-cols-2 gap-3">
        {guides.map((guide) => (
          <DashboardPanel key={guide.href} className="p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-umkm-brand-soft text-umkm-brand-hover" aria-hidden><guide.icon size={18} /></span>
            <h2 className="mt-3 text-sm font-bold text-umkm-ink">{guide.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-umkm-subtle">{guide.description}</p>
            <Link href={guide.href} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-umkm-brand">{guide.action}<ArrowRight size={14} aria-hidden /></Link>
          </DashboardPanel>
        ))}
      </div>

      <section aria-labelledby="faq-judul" className="space-y-3">
        <h2 id="faq-judul" className="text-base font-bold text-umkm-ink">Pertanyaan yang sering muncul</h2>
        <div className="relative">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-umkm-subtle" />
          <label htmlFor="faq-cari" className="sr-only">Cari pertanyaan</label>
          <input
            id="faq-cari"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari: kasbon, tutup kas, PIRT, excel…"
            className="min-h-11 w-full rounded-xl border border-umkm-line-strong bg-white pl-9 pr-3 text-sm text-umkm-ink outline-none focus:border-umkm-brand"
          />
        </div>
        <div role="group" aria-label="Kelompok pertanyaan" className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: "semua" as const, label: "Semua" }, ...faqCategories].map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-bold ${category === item.id ? "border-umkm-brand bg-umkm-brand text-white" : "border-umkm-line-strong bg-white text-umkm-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="sr-only" aria-live="polite">{results.length} pertanyaan ditemukan</p>
        {results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-umkm-line-strong bg-white p-6 text-center text-xs text-umkm-subtle">
            Belum ada jawaban untuk itu. Coba kata lain, atau hubungi pendamping usaha Anda.
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map((entry) => (
              <li key={entry.id}>
                <details className="group rounded-2xl border border-umkm-line bg-white">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-umkm-ink">
                    {entry.question}
                    <ChevronDown size={16} aria-hidden className="shrink-0 text-umkm-subtle transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-umkm-line-soft px-4 pb-4 pt-3">
                    <p className="text-sm leading-relaxed text-umkm-ink-soft">{entry.answer}</p>
                    {entry.link && (
                      <Link href={entry.link.href} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-umkm-brand">
                        {entry.link.label} <ArrowRight size={14} aria-hidden />
                      </Link>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs leading-relaxed text-umkm-subtle">Panduan membantu Anda memakai aplikasi, bukan menggantikan keputusan usaha Anda.</p>
    </DashboardPage>
  );
}
