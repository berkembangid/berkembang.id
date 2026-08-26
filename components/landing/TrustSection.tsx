import { ArrowDown, Check, LockKeyhole, Mic, RefreshCw, Sparkles } from "lucide-react";

const trustPoints = [
  { icon: Mic, label: "Pencatatan lewat suara" },
  { icon: Sparkles, label: "Ringkasan otomatis" },
  { icon: LockKeyhole, label: "Kendali data di tangan Anda" },
  { icon: RefreshCw, label: "Siap untuk koneksi terbatas" },
];

export function TrustSection() {
  return (
    <>
      <section aria-label="Keunggulan utama" className="border-b border-[#e2e5ee] bg-white">
        <div className="landing-container grid grid-cols-2 divide-x divide-y divide-[#e2e5ee] sm:grid-cols-4 sm:divide-y-0">
          {trustPoints.map(({ icon: Icon, label }) => (
            <div key={label} className="flex min-h-24 items-center justify-center gap-3 px-3 py-5 text-center text-xs font-semibold text-[#4f576b] sm:text-sm">
              <Icon aria-hidden="true" size={18} className="shrink-0 text-[#141a34]" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section-space bg-white">
        <div className="landing-container grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="transaction-story">
            <div className="transaction-glow" aria-hidden="true" />
            <div className="transaction-bubble">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2efed0] text-[#073f39]"><Mic size={17} /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7fffe4]">Ucapan Anda</p><p className="mt-2 text-sm leading-6 text-white">Beli tepung lima kilo, total tujuh puluh lima ribu.</p></div>
            </div>
            <ArrowDown aria-hidden="true" className="mx-auto my-4 text-white/35" size={20} />
            <div className="transaction-result">
              <div className="flex items-center justify-between border-b border-[#e5e8f0] pb-4"><div><p className="preview-label">Hasil pencatatan</p><p className="mt-1 text-sm font-bold text-[#141a34]">Pengeluaran baru</p></div><span className="inline-flex size-8 items-center justify-center rounded-full bg-[#e6f7ef] text-[#15803d]"><Check size={15} /></span></div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-[#f6f7fa] p-3"><dt className="text-[9px] text-[#858c9d]">Nominal</dt><dd className="mt-1 font-bold text-[#141a34]">Rp75.000</dd></div><div className="rounded-xl bg-[#f6f7fa] p-3"><dt className="text-[9px] text-[#858c9d]">Kategori</dt><dd className="mt-1 font-bold text-[#141a34]">Bahan baku</dd></div></dl>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-semibold text-white/55"><Sparkles size={12} className="text-[#7fffe4]" />Siap diperiksa sebelum disimpan</div>
          </div>

          <div className="trust-copy max-w-xl">
            <p className="eyebrow">Dari ucapan menjadi catatan</p>
            <h2 className="section-title trust-title mt-4">
              Anda tetap melayani. <span style={{ color: "#141a34" }}>Catatan usaha ikut selesai.</span>
            </h2>
            <p className="section-copy mt-6">
              Tidak ada tabel panjang atau istilah rumit. Ceritakan transaksi seperti biasa, lalu periksa hasilnya sebelum disimpan.
            </p>
            <ol className="trust-steps mt-8">
              {[
                ["01", "Ceritakan", "Penjualan, belanja bahan, atau biaya harian—ucapkan dengan bahasa Anda sendiri."],
                ["02", "Pastikan", "Periksa nominal dan kategori tanpa perlu mengetik semuanya dari awal."],
                ["03", "Pahami", "Setiap catatan membantu membentuk gambaran kas dan kesiapan usaha."],
              ].map(([number, title, copy]) => (
                <li key={number}>
                  <span className="trust-step-number" aria-hidden="true">{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}


