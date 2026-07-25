"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { SectionHeader } from "./molecules/SectionHeader";

const questions = [
  {
    question: "Apakah saya perlu memahami akuntansi?",
    answer: "Tidak. Anda cukup menceritakan transaksi dengan bahasa sehari-hari. Berkembang.id membantu menyusun detailnya menjadi catatan yang lebih rapi.",
  },
  {
    question: "Apakah pencatatan bisa dilakukan saat internet tidak stabil?",
    answer: "Catatan dapat disiapkan saat koneksi terbatas dan disinkronkan kembali ketika jaringan tersedia. Status sinkronisasi selalu terlihat di aplikasi.",
  },
  {
    question: "Siapa yang dapat melihat data usaha saya?",
    answer: "Anda tetap memegang kendali. Informasi untuk pendamping atau institusi hanya dibagikan melalui alur persetujuan yang jelas.",
  },
  {
    question: "Apakah Readiness Score menjamin pembiayaan?",
    answer: "Tidak. Readiness Score membantu Anda memahami kesiapan usaha. Keputusan pembiayaan tetap mengikuti penilaian dan kebijakan masing-masing institusi.",
  },
];

export function FAQ() {
  const [active, setActive] = useState<number | null>(0);

  return (
    <section id="faq" className="section-space scroll-mt-24 bg-white">
      <div className="landing-container grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
        <SectionHeader eyebrow="Pertanyaan umum" title="Yang perlu Anda tahu sebelum mulai." description="Kami menjaga cara kerja produk tetap sederhana, termasuk soal data dan kesiapan pembiayaan." />
        <div className="divide-y divide-[#dfe3ef] border-y border-[#dfe3ef]">
          {questions.map((item, index) => {
            const isOpen = active === index;
            const panelId = `faq-panel-${index}`;
            return (
              <div key={item.question}>
                <button
                  type="button"
                  className="focus-ring flex min-h-16 w-full items-center justify-between gap-5 py-5 text-left text-base font-semibold text-[#141a34] sm:text-lg"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setActive(isOpen ? null : index)}
                >
                  {item.question}
                  <ChevronDown aria-hidden="true" className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} size={20} />
                </button>
                <div id={panelId} hidden={!isOpen} className="pb-6 pr-10 text-sm leading-7 text-[#5f667a] sm:text-base">
                  {item.answer}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
