import Link from "next/link";
import { ArrowRight, Building2, Check, ChevronDown, MapPin, TrendingUp, UsersRound } from "lucide-react";

const activity = [
  { name: "Usaha kuliner", place: "Jawa Barat", score: "Siap ditinjau", tone: "green" },
  { name: "Usaha kerajinan", place: "Jawa Tengah", score: "Perlu didampingi", tone: "amber" },
  { name: "Usaha perdagangan", place: "Jawa Timur", score: "Bertumbuh", tone: "blue" },
];

export function InstitutionSection() {
  return (
    <section id="institusi" className="section-space scroll-mt-24 bg-white">
      <div className="landing-container">
        <div className="institution-shell">
          <div className="relative z-10 max-w-xl">
            <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-[#2efed0]/15 text-[#7fffe4]"><Building2 size={21} /></div>
            <p className="eyebrow is-light mt-7">Untuk institusi dan pendamping</p>
            <h2 className="section-title mt-4 !text-white">Pendampingan lebih tepat dimulai dari data yang lebih jelas.</h2>
            <p className="mt-6 text-base leading-7 text-white/60">Pantau perkembangan kelompok, temukan hambatan lebih awal, dan arahkan program sesuai kondisi setiap usaha.</p>
            <ul className="mt-8 space-y-3 text-sm text-white/75">
              <li className="flex items-center gap-3"><Check aria-hidden="true" size={16} className="text-[#7fffe4]" />Ringkasan perkembangan per kelompok dan wilayah</li>
              <li className="flex items-center gap-3"><Check aria-hidden="true" size={16} className="text-[#7fffe4]" />Sinyal usaha yang perlu pendampingan</li>
              <li className="flex items-center gap-3"><Check aria-hidden="true" size={16} className="text-[#7fffe4]" />Berbagi data melalui persetujuan pengguna</li>
            </ul>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/institusi" className="button-hero-primary focus-ring">Lihat portal institusi <ArrowRight size={16} /></Link>
              <a href="mailto:halo@berkembang.id" className="button-hero-secondary focus-ring">Diskusikan kebutuhan institusi</a>
            </div>
          </div>

          <InstitutionPreview />
        </div>
      </div>
    </section>
  );
}

function InstitutionPreview() {
  return (
    <div className="institution-preview" role="img" aria-label="Pratinjau portal institusi Berkembang.id">
      <div className="flex items-center justify-between border-b border-[#e8eaf0] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#ff6b6b]" /><span className="size-2 rounded-full bg-[#ffd166]" /><span className="size-2 rounded-full bg-[#2dd4a8]" /></div>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8a91a3]">Portal institusi</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between"><div><p className="text-[9px] font-medium text-[#8a91a3]">Ringkasan kelompok</p><p className="mt-1 text-sm font-bold text-[#141a34]">Perkembangan UMKM</p></div><span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#e0e3eb] px-2 text-[9px] font-semibold text-[#5c6475]">Semua wilayah <ChevronDown aria-hidden="true" size={10} /></span></div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniMetric icon={<UsersRound size={12} />} label="Aktif mencatat" value="Terpantau" />
          <MiniMetric icon={<TrendingUp size={12} />} label="Skor membaik" value="Bertumbuh" />
          <MiniMetric icon={<MapPin size={12} />} label="Wilayah" value="Terfilter" />
        </div>
        <div className="mt-4 rounded-xl border border-[#e4e7ee] p-3.5">
          <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-[#141a34]">Persebaran readiness</p><span className="text-[8px] text-[#8b92a4]">Diperbarui dari data pengguna</span></div>
          <div className="mt-5 flex h-20 items-end gap-2">{[32, 48, 40, 62, 56, 72, 67, 81, 75, 90].map((height, index) => <span key={index} className="institution-bar" style={{ height: `${height}%` }} />)}</div>
        </div>
        <div className="mt-4 space-y-2">
          {activity.map((item) => <div key={item.name} className="flex items-center gap-3 rounded-xl bg-[#f7f8fb] p-2.5"><span className="inline-flex size-7 items-center justify-center rounded-lg bg-white text-[#001b85]"><Building2 size={12} /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-bold text-[#141a34]">{item.name}</p><p className="mt-0.5 text-[8px] text-[#8a91a3]">{item.place}</p></div><span className={`status-pill is-${item.tone}`}>{item.score}</span></div>)}
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-[#f7f8fb] p-2.5"><span className="text-[#7fffe4]" aria-hidden="true">{icon}</span><p className="mt-2 text-[7px] text-[#8a91a3]">{label}</p><p className="mt-0.5 text-[9px] font-bold text-[#141a34]">{value}</p></div>;
}


