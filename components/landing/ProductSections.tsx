import { ArrowRight, BarChart3, Check, Cloud, FileCheck2, Lightbulb, Mic, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "./molecules/SectionHeader";

export function ProductSections() {
  return (
    <>
      <FeatureBento />
      <Workflow />
      <ReadinessJourney />
      <MeasuredImpact />
    </>
  );
}

function FeatureBento() {
  return (
    <section id="fitur" className="section-space scroll-mt-24 bg-[#f3f2ff]">
      <div className="landing-container">
        <SectionHeader align="center" eyebrow="Satu ruang untuk memahami usaha" title="Bukan sekadar catatan. Ini gambaran usaha Anda." description="Setiap fitur membantu mengubah aktivitas harian menjadi keputusan yang lebih tenang dan terarah." />

        <div className="bento-grid mt-12">
          <article className="bento-card bento-voice">
            <div className="bento-copy">
              <span className="bento-icon" aria-hidden="true"><Mic size={19} /></span>
              <p className="eyebrow">Voice-first</p>
              <h3>Transaksi masuk lewat percakapan.</h3>
              <p>Ceritakan pemasukan atau pengeluaran. Detail penting langsung disiapkan untuk diperiksa.</p>
            </div>
            <div className="voice-demo">
              <div className="flex items-center justify-between text-[10px] font-semibold text-[#687086]"><span>Rekaman baru</span><span>00:08</span></div>
              <div className="voice-wave my-5" aria-hidden="true">{[14, 28, 46, 31, 58, 38, 52, 24, 43, 18, 32, 12].map((height, index) => <span key={index} style={{ height }} />)}</div>
              <p className="rounded-xl bg-[#f3f2ff] p-3 text-xs leading-5 text-[#3e4659]">â€œBayar stok sayur seratus delapan puluh ribu.â€</p>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#dfe3ed] p-3"><span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e6f7ef] text-[#15803d]"><Check size={14} /></span><div><p className="text-[10px] font-bold">Pengeluaran tercatat</p><p className="text-[9px] text-[#7b8294]">Bahan baku Â· Rp180.000</p></div></div>
            </div>
          </article>

          <article className="bento-card bento-profit">
            <div className="bento-copy compact"><span className="bento-icon" aria-hidden="true"><BarChart3 size={19} /></span><h3>Untung terlihat lebih jelas.</h3><p>Pemasukan dan pengeluaran diringkas tanpa menunggu akhir bulan.</p></div>
            <div className="profit-widget">
              <div className="flex items-end justify-between"><div><p className="text-[10px] text-[#798195]">Laba bersih</p><p className="mt-1 text-2xl font-bold text-[#141a34]">Rp2,7 jt</p></div><span className="rounded-full bg-[#e5f8ef] px-2 py-1 text-[9px] font-bold text-[#15803d]">Membaik</span></div>
              <svg aria-hidden="true" className="mt-5 h-20 w-full" viewBox="0 0 300 80" fill="none"><path d="M2 69C30 66 38 48 66 52C94 56 103 32 132 38C161 44 176 25 202 29C229 33 243 10 298 8" stroke="#15803d" strokeWidth="3" strokeLinecap="round"/><path d="M2 69C30 66 38 48 66 52C94 56 103 32 132 38C161 44 176 25 202 29C229 33 243 10 298 8V80H2V69Z" fill="url(#profitFill)"/><defs><linearGradient id="profitFill" x1="150" y1="8" x2="150" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="#2dd4a8" stopOpacity=".28"/><stop offset="1" stopColor="#2dd4a8" stopOpacity="0"/></linearGradient></defs></svg>
            </div>
          </article>

          <article className="bento-card bento-score">
            <div className="bento-copy compact"><span className="bento-icon dark" aria-hidden="true"><Target size={19} /></span><h3>Kesiapan punya arah.</h3><p>Readiness Score menunjukkan bagian yang sudah kuat dan yang perlu dilengkapi.</p></div>
            <div className="score-panel"><div className="score-ring large"><span>72</span></div><div className="flex-1"><p className="text-xs font-bold text-white">Bertumbuh</p><p className="mt-1 text-[10px] leading-4 text-white/55">Konsistensi pencatatan Anda membaik.</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-[72%] rounded-full bg-[#2efed0]" /></div></div></div>
          </article>

          <article className="bento-card bento-coach">
            <div className="bento-copy compact"><span className="bento-icon" aria-hidden="true"><Lightbulb size={19} /></span><h3>Saran yang dekat dengan kondisi usaha.</h3></div>
            <div className="coach-chat"><span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#001b85] text-white"><Sparkles size={16} /></span><p>Belanja bahan naik minggu ini. Coba cek stok sebelum belanja berikutnya, ya.</p></div>
          </article>

          <article className="bento-card bento-sync">
            <div className="bento-copy compact"><span className="bento-icon" aria-hidden="true"><Cloud size={19} /></span><h3>Tetap siap saat sinyal terbatas.</h3><p>Catatan disimpan lebih dulu dan status sinkronisasi selalu terlihat.</p></div>
            <div className="sync-widget"><span className="sync-ring"><Cloud size={24} /></span><div><p className="text-xs font-bold">Semua catatan tersimpan</p><p className="mt-1 text-[10px] text-[#798195]">Terakhir disinkronkan baru saja</p></div><Check className="ml-auto text-[#15803d]" size={18} /></div>
          </article>
        </div>
      </div>
    </section>
  );
}

const workflowSteps = [
  { icon: Mic, number: "01", title: "Ucapkan transaksi", copy: "Bicara dengan cara yang paling nyaman bagi Anda." },
  { icon: Sparkles, number: "02", title: "AI menyusun catatan", copy: "Nominal, jenis, dan kategori disiapkan untuk diperiksa." },
  { icon: BarChart3, number: "03", title: "Pantau kondisi usaha", copy: "Lihat arus kas dan pola usaha dalam satu ringkasan." },
  { icon: TrendingUp, number: "04", title: "Bangun kesiapan", copy: "Ikuti langkah yang relevan untuk membuat usaha lebih siap." },
];

function Workflow() {
  return (
    <section id="cara-kerja" className="workflow-section section-space scroll-mt-24 bg-[#0d1533] text-white">
      <div className="landing-container grid gap-14 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow is-light">Cara kerja</p>
          <h2 className="section-title workflow-title mt-4">Satu kebiasaan sederhana, <span>manfaatnya terus bertambah.</span></h2>
          <p className="workflow-intro mt-5 text-base leading-7">Mulai dari satu catatan hari ini. Berkembang.id membantu menjadikannya gambaran usaha yang lebih utuh.</p>
          <Link href="/umkm" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#7fffe4] focus-ring rounded-md">Coba pencatatan suara <ArrowRight size={16} /></Link>
        </div>
        <ol className="workflow-list">
          {workflowSteps.map(({ icon: Icon, number, title, copy }) => (
            <li key={number} className="workflow-item">
              <div className="workflow-marker"><Icon aria-hidden="true" size={19} /></div>
              <div><span className="text-[11px] font-bold tracking-[0.18em] text-[#7fffe4]">LANGKAH {number}</span><h3 className="mt-3 text-xl font-bold sm:text-2xl">{title}</h3><p className="mt-3 max-w-md text-sm leading-7 sm:text-base">{copy}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ReadinessJourney() {
  return (
    <section className="section-space bg-white">
      <div className="landing-container grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="readiness-board">
          <div className="flex items-center justify-between"><div><p className="preview-label">Journey usaha</p><h3 className="mt-2 text-xl font-bold">Langkah berikutnya</h3></div><span className="rounded-full bg-[#eef0f5] px-3 py-1.5 text-[10px] font-bold text-[#141a34]">3 dari 5 selesai</span></div>
          <div className="mt-8 space-y-3">
            {[['Catat transaksi pertama', true], ['Konsisten selama satu minggu', true], ['Lengkapi profil usaha', true], ['Siapkan dokumen legalitas', false], ['Tinjau kesiapan pembiayaan', false]].map(([label, done], index) => (
              <div key={String(label)} className={`journey-row ${done ? "is-done" : ""}`}><span className="journey-check">{done ? <Check size={14} /> : index + 1}</span><span className="text-sm font-semibold">{label}</span>{done ? <span className="ml-auto text-[10px] font-bold text-[#15803d]">Selesai</span> : null}</div>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow">Journey naik kelas</p>
          <h2 className="section-title mt-4">Dari rajin mencatat menuju usaha yang lebih siap.</h2>
          <p className="section-copy mt-6">Readiness Score bukan janji pembiayaan. Ia adalah penunjuk arah agar Anda tahu langkah mana yang dapat diperkuat berikutnya.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="soft-info-card"><FileCheck2 aria-hidden="true" size={20} /><h3>Langkah yang jelas</h3><p>Profil, legalitas, dan kebiasaan usaha dirangkum dalam journey.</p></div>
            <div className="soft-info-card"><ShieldCheck aria-hidden="true" size={20} /><h3>Tetap dalam kendali</h3><p>Anda memilih kapan dan kepada siapa informasi usaha dibagikan.</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MeasuredImpact() {
  return (
    <section className="border-y border-[#e3e6ef] bg-[#fbf8ff] py-16 sm:py-20">
      <div className="landing-container">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div><p className="eyebrow">Dampak yang bisa dibuktikan</p><h2 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl text-balance">Dampak diukur dari aktivitas nyata.</h2></div>
          <p className="max-w-2xl text-sm leading-7 text-[#687086] sm:text-base">Berkembang.id menyiapkan pengukuran dari aktivitas pengguna. Statistik dan cerita pengguna hanya ditampilkan setelah memiliki sumber serta izin yang jelas.</p>
        </div>
        <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-[#dfe3ed] bg-[#dfe3ed] sm:grid-cols-3">
          {[["Konsistensi pencatatan", "Diukur dari kebiasaan mencatat, bukan klaim pemasaran."], ["Kelengkapan usaha", "Berdasarkan progres profil dan dokumen yang pengguna isi."], ["Perubahan kesiapan", "Dilihat dari faktor readiness yang benar-benar berkembang."]].map(([title, copy]) => <div key={title} className="bg-white p-6 sm:p-7"><p className="text-sm font-bold text-[#141a34]">{title}</p><p className="mt-3 text-xs leading-6 text-[#72798c] sm:text-sm">{copy}</p></div>)}
        </div>
      </div>
    </section>
  );
}



