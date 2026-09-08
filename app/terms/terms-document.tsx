"use client";

import { useState } from "react";
import { Building, CheckCircle2, Lock, Store } from "lucide-react";
import {
  TERMS_DOCUMENTS,
  type TermsAudience,
  type TermsBlock,
} from "@/modules/legal/terms";

/**
 * Penekanan ditulis `**begini**` di naskah dan dipecah di sini.
 *
 * Cukup untuk kebutuhan dokumen hukum ini, dan jauh lebih ringan daripada
 * menambah perender markdown hanya demi satu halaman -- dependensi baru pada
 * naskah yang mengikat secara hukum bukan keputusan yang pantas diambil
 * sambil lalu.
 */
function Emphasised({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((piece, index) =>
        piece.startsWith("**") && piece.endsWith("**") ? (
          <strong key={index} className="font-bold text-slate-900">
            {piece.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{piece}</span>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: TermsBlock }) {
  if (block.kind === "paragraph") {
    return <p><Emphasised text={block.text} /></p>;
  }
  if (block.kind === "ordered") {
    return (
      <ol className="list-decimal space-y-2 pl-6 text-slate-600 marker:font-bold marker:text-[#001b85]">
        {block.items.map((item, index) => (
          <li key={index}><Emphasised text={item} /></li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="list-disc space-y-1 pl-6 text-slate-600">
      {block.items.map((item, index) => (
        <li key={index}><Emphasised text={item} /></li>
      ))}
    </ul>
  );
}

export default function TermsDocumentView({ audience }: { audience: TermsAudience }) {
  const [active, setActive] = useState<TermsAudience>(audience);
  const document = TERMS_DOCUMENTS.find((entry) => entry.id === active) ?? TERMS_DOCUMENTS[0];

  return (
    <>
      {/*
        Dua dokumen, bukan satu yang dipakai bergantian. Naskah lembaga
        menyatakannya sendiri: ia berbeda dari, dan tidak menggantikan,
        ketentuan pengguna UMKM. Pemilihnya diletakkan sebelum naskah supaya
        pembaca tahu sejak awal bahwa yang ini bukan satu-satunya.
      */}
      <div
        className="flex gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
        role="tablist"
        aria-label="Pilih dokumen"
      >
        {TERMS_DOCUMENTS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === active}
            onClick={() => setActive(entry.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-xs font-bold transition-colors sm:text-sm ${
              entry.id === active
                ? "bg-[#001b85] text-white shadow-sm"
                : "text-slate-500 hover:text-[#141a34]"
            }`}
          >
            {entry.id === "umkm" ? <Store size={15} /> : <Building size={15} />}
            {entry.label}
          </button>
        ))}
      </div>

      {/*
        Janjinya ditulis dari sudut pandang pembacanya, jadi ia ikut berganti
        bersama dokumennya. Sebelum ini kotak ini berbunyi « catatan usaha Anda
        privat secara bawaan » bahkan ketika yang dibuka perjanjian lembaga --
        kalimat yang benar bagi pemilik usaha dan tidak berarti apa-apa bagi
        lembaga, yang tidak punya catatan usaha.
      */}
      <div className="space-y-3 rounded-2xl bg-gradient-to-r from-[#001b85] to-[#02a8d0] p-6 text-white shadow-md">
        <div className="flex items-center gap-2 text-sm font-bold text-cyan-200">
          <Lock size={18} /> KOMITMEN PERLINDUNGAN DATA PENGGUNA
        </div>
        <p className="text-sm font-medium leading-relaxed text-white/95 md:text-base">
          {document.commitment}
        </p>
      </div>

      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-700 shadow-sm md:p-8">
        <div className="space-y-2 border-b border-slate-100 pb-5">
          <h2 className="text-lg font-black text-[#141a34]">{document.title}</h2>
          <p><Emphasised text={document.preamble} /></p>
        </div>

        {document.sections.map((section, index) => (
          <section key={section.heading} className="space-y-2">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <CheckCircle2 size={16} className="shrink-0 text-[#001b85]" />
              {index + 1}. {section.heading}
            </h3>
            {section.blocks.map((block, blockIndex) => (
              <Block key={blockIndex} block={block} />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
