"use client";

import Link from "next/link";
import {
  Mic, Sparkles, TrendingUp, Flame, BarChart2, Target, Handshake, WifiOff,
  ArrowRight, ShieldCheck, CheckCircle2, Star, Play, User, Home, Bell
} from "lucide-react";
import { useState } from "react";

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<"umkm" | "institusi">("umkm");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#bac3ff]/50 selection:text-[#001b85]">
      {/* Navigation Pill */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-6xl z-50 bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-lg rounded-full px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo/logo berkembang.webp" alt="Berkembang.id Logo" className="h-8 w-auto object-contain" />
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#cara-kerja" className="text-sm text-slate-600 hover:text-[#001b85] font-semibold transition-colors">Cara Kerja</a>
          <a href="#fitur" className="text-sm text-slate-600 hover:text-[#001b85] font-semibold transition-colors">Fitur</a>
          <a href="#institusi" className="text-sm text-slate-600 hover:text-[#001b85] font-semibold transition-colors">Kemitraan</a>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/auth/login">
            <button className="text-sm font-bold text-[#001b85] hover:text-[#334ed9] px-3 py-2 transition-colors">Masuk</button>
          </Link>
          <Link href="/umkm">
            <button className="bg-[#001b85] text-white text-sm font-bold px-5 py-2.5 rounded-full hover:bg-[#0e32c2] shadow-sm hover:shadow transition-all">
              Mulai Gratis →
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 overflow-hidden px-6">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-sky-200/40 to-blue-200/30 rounded-full blur-3xl -z-10" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-gradient-to-br from-purple-200/30 to-[#ececff]/40 rounded-full blur-3xl -z-10" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 items-center">
          {/* Left Hero Copy */}
          <div className="lg:col-span-7 space-y-6 text-left animate-fade-in-up">
            <div className="inline-flex items-center gap-2 bg-[#ececff] text-[#001b85] text-xs font-bold px-4 py-1.5 rounded-full border border-[#bac3ff]/60">
              <Sparkles size={12} className="animate-pulse" />
              <span>Platform AI Pendamping UMKM Pertama di Indonesia</span>
            </div>
            
            <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#141a34] leading-tight">
              Catat Untung Usaha,<br />
              <span className="text-gradient-brand">Siap Naik Kelas</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
              Catat keuangan semudah bercakap-cakap. Cukup rekam suara transaksi harian Anda, AI kami otomatis memetakan kas, menghitung keuntungan, dan menyusun skor kelayakan pembiayaan Anda.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <Link href="/umkm">
                <button className="bg-gradient-to-r from-emerald-600 to-sky-600 text-white font-bold px-8 py-4 rounded-full text-base transition-all hover:shadow-lg hover:scale-[1.02] text-center flex items-center justify-center gap-2">
                  <Mic size={18} />
                  Mulai Rekam Suara Free
                </button>
              </Link>
              <Link href="/institusi">
                <button className="text-[#001b85] font-bold px-8 py-4 rounded-full text-base border-2 border-[#001b85] hover:bg-[#ececff]/40 transition-colors text-center">
                  Portal Institusi
                </button>
              </Link>
            </div>

            {/* Micro stats banner */}
            <div className="pt-6 border-t border-slate-200/80 grid grid-cols-3 gap-4 max-w-md">
              <div>
                <p className="text-2xl font-black text-[#001b85]">1,200+</p>
                <p className="text-xs text-slate-500 font-semibold">UMKM Aktif</p>
              </div>
              <div>
                <p className="text-2xl font-black text-emerald-600">18+</p>
                <p className="text-xs text-slate-500 font-semibold">Bank & Fintech</p>
              </div>
              <div>
                <p className="text-2xl font-black text-indigo-600">62.4</p>
                <p className="text-xs text-slate-500 font-semibold">Avg Readiness Score</p>
              </div>
            </div>
          </div>

          {/* Right Hero Interactive Mockup */}
          <div className="lg:col-span-5 relative flex justify-center animate-fade-in-up delay-200">
            {/* Phone shell wrapper */}
            <div className="relative w-[290px] h-[580px] bg-slate-900 rounded-[40px] p-3 shadow-2xl border-4 border-slate-800 flex flex-col overflow-hidden">
              {/* Screen Content */}
              <div className="bg-[#fbf8ff] flex-1 rounded-[32px] overflow-hidden flex flex-col relative text-xs">
                {/* Header Mock */}
                <div className="px-3 pt-6 pb-2 bg-white border-b border-slate-100 flex items-center justify-between">
                  <span className="font-headline font-bold text-[#001b85] text-[10px]">BERKEMBANG.ID</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5 bg-teal-50 px-1.5 py-0.5 rounded-full border border-teal-200">
                      <Flame size={8} className="text-teal-600 animate-pulse" fill="currentColor" />
                      <span className="font-bold text-teal-700 text-[8px]">5</span>
                    </div>
                    <Bell size={10} className="text-slate-400" />
                  </div>
                </div>

                {/* Score Card Mock */}
                <div className="p-3 flex-1 space-y-3 overflow-y-auto hide-scrollbar bg-[#fbf8ff]">
                  
                  {/* Sapaan */}
                  <div>
                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider font-mono-label">Selamat Pagi,</p>
                    <h4 className="font-bold text-[11px] text-[#001b85]">Halo, Ibu Sari! 👋</h4>
                    <p className="text-[8px] text-slate-500 mt-0.5">Sudah 5 hari berturut-turut! 🔥</p>
                  </div>

                  {/* B. Kelengkapan Profil */}
                  <div className="relative overflow-hidden rounded-xl p-3 shadow-sm text-white" style={{ background: "linear-gradient(135deg, #001b85, #334ed9)" }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[7px] text-white/70 uppercase tracking-widest font-bold font-mono-label">Kelengkapan Profil</p>
                        <h5 className="font-bold text-[10px] mt-0.5">Profil Anda 43% lengkap</h5>
                      </div>
                      <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0 ml-1">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                          <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="6" />
                          <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeWidth="6" strokeDasharray="175" strokeDashoffset="100" strokeLinecap="round" />
                        </svg>
                        <span className="absolute text-[8px] font-bold">43%</span>
                      </div>
                    </div>
                  </div>

                  {/* C. Rangkuman Bisnis */}
                  <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    <div className="min-w-[70px] bg-white rounded-lg p-2 border border-slate-100 flex-1">
                      <p className="text-[6px] font-bold text-slate-400 uppercase tracking-tight">Catatan</p>
                      <p className="text-xs font-bold text-[#001b85]">3 <span className="text-[8px] font-normal text-slate-500">hari ini</span></p>
                    </div>
                    <div className="min-w-[70px] bg-white rounded-lg p-2 border border-slate-100 flex-1">
                      <p className="text-[6px] font-bold text-slate-400 uppercase tracking-tight">Streak</p>
                      <p className="text-xs font-bold text-teal-600">5 <span className="text-[8px] font-normal text-slate-500">hari 🔥</span></p>
                    </div>
                    <div className="min-w-[70px] bg-white rounded-lg p-2 border border-slate-100 flex-1">
                      <p className="text-[6px] font-bold text-slate-400 uppercase tracking-tight">Readiness</p>
                      <p className="text-xs font-bold text-emerald-600">+12</p>
                    </div>
                  </div>

                  {/* D. Kartu Untung Hari Ini */}
                  <div className="bg-profit-gradient rounded-xl p-3 border border-green-200 shadow-sm text-green-800">
                    <p className="text-[7px] font-bold text-green-700 uppercase tracking-widest font-mono-label">Untung Hari Ini</p>
                    <div className="flex items-center justify-between mt-1">
                      <div>
                        <p className="text-sm font-bold text-green-700">Rp150.000</p>
                        <p className="text-[7px] text-green-600 font-semibold">+Rp20.000 dari kemarin</p>
                      </div>
                    </div>
                    {/* Mini graph */}
                    <div className="mt-2 flex items-end gap-0.5 h-6">
                      {[15, 10, 20, 8, 25, 16, 22].map((h, i) => (
                        <div key={i} className={`flex-1 rounded-sm ${i === 6 ? "bg-green-700" : "bg-green-300"}`} style={{ height: h }} />
                      ))}
                    </div>
                  </div>

                  {/* E. AI Coach Card */}
                  <div className="bg-yellow-50 rounded-lg p-2.5 border border-yellow-200">
                    <p className="text-[7px] font-bold text-yellow-800 uppercase tracking-widest font-mono-label">💡 Saran Asisten</p>
                    <p className="text-[8px] text-yellow-900 mt-0.5 leading-snug">
                      Pengeluaran bahan naik 30% hari Jumat. Cek stok sebelum weekend ya!
                    </p>
                  </div>

                  {/* F. Aktivitas Terbaru */}
                  <div className="space-y-1.5">
                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Aktivitas</p>
                    <div className="flex items-center gap-1.5 bg-white rounded-lg p-2 border border-slate-100">
                      <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 text-green-600">
                        <CheckCircle2 size={10} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] text-slate-700 font-medium truncate">Catatan: Ayam geprek 47 porsi</p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Bottom Navigation Mock */}
                <div className="bg-white border-t border-slate-100 h-14 flex items-center justify-around px-2 text-[8px] text-slate-400 relative z-30">
                  <div className="flex flex-col items-center text-[#001b85] font-bold">
                    <Home size={16} fill="currentColor" />
                    <span>Beranda</span>
                  </div>
                  <div className="w-10" /> {/* FAB space */}
                  <div className="flex flex-col items-center">
                    <Target size={16} />
                    <span>Journey</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <User size={16} />
                    <span>Profil</span>
                  </div>
                </div>
              </div>

              {/* Float Mic Button */}
              <div className="absolute bottom-11 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-600 to-sky-500 flex items-center justify-center shadow-lg border-2 border-white z-40">
                <Mic size={18} className="text-white animate-pulse" />
              </div>
            </div>
            {/* Glowing orb behind phone */}
            <div className="absolute -inset-4 bg-gradient-to-tr from-[#0ea5e9]/20 to-[#001b85]/10 rounded-[50px] blur-xl -z-10" />
          </div>
        </div>
      </section>

      {/* Cara Kerja */}
      <section id="cara-kerja" className="py-20 bg-slate-100/60 px-6 border-y border-slate-200/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-[#001b85] uppercase tracking-widest font-mono-label mb-2">Langkah Mudah</p>
            <h2 className="font-headline text-3xl font-extrabold text-[#141a34]">Bagaimana Berkembang.id Bekerja</h2>
            <p className="text-sm text-slate-500 mt-2">Pencatatan canggih tanpa perlu memahami pembukuan rumit</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { num: "01", Icon: Mic, title: "Rekam Transaksi", desc: "Cukup tekan tombol mic di dashboard mobile, sebutkan transaksi Anda seperti berbicara biasa.", color: "#16a34a" },
              { num: "02", Icon: Sparkles, title: "AI Ekstraksi Otomatis", desc: "Whisper & GPT memproses ucapan Anda untuk mengenali barang, kuantitas, harga, dan kategori secara tepat.", color: "#001b85" },
              { num: "03", Icon: TrendingUp, title: "Profil Siap Dana", desc: "Data kas Anda diolah menjadi Readiness Score. Ketika score Anda tinggi, bank mitra akan menawarkan pendanaan.", color: "#0d9488" },
            ].map((step, idx) => (
              <div key={idx} className={`bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm relative group hover:border-[#bac3ff] hover:shadow transition-all duration-300 animate-fade-in-up ${
                idx === 0 ? "delay-100" : idx === 1 ? "delay-200" : "delay-300"
              }`}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${step.color}15` }}>
                  <step.Icon size={20} style={{ color: step.color }} />
                </div>
                <p className="text-[10px] font-mono-label font-bold text-slate-400 mb-1">{step.num}</p>
                <h3 className="font-headline font-bold text-lg text-[#141a34] mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="fitur" className="py-20 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-bold text-[#001b85] uppercase tracking-widest font-mono-label mb-2">Fitur Unggulan</p>
          <h2 className="font-headline text-3xl font-extrabold text-[#141a34]">Didesain Khusus Untuk Ekosistem Mikro</h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { Icon: Mic, color: "#16a34a", bg: "bg-emerald-50", title: "Perekaman Suara Generatif", desc: "Mendukung pengenalan percakapan bahasa Indonesia kasual secara akurat." },
            { Icon: Flame, color: "#ea580c", bg: "bg-orange-50", title: "Konsistensi Gamifikasi", desc: "Jaga kebiasaan mencatat dengan streak harian, badge koleksi, dan reward journey." },
            { Icon: BarChart2, color: "#001b85", bg: "bg-blue-50", title: "Readiness Scoring", desc: "Skoring kredit dinamis 0-100 berdasarkan data nyata pembukuan Anda." },
            { Icon: Target, color: "#7c3aed", bg: "bg-purple-50", title: "Journey Naik Kelas", desc: "Panduan legalitas langkah-demi-langkah (misal pendaftaran NIB) untuk kelayakan KUR." },
            { Icon: Handshake, color: "#0d9488", bg: "bg-teal-50", title: "Koneksi Institusi Langsung", desc: "Kirim dossier terenkripsi dan dapatkan penawaran program pembiayaan formal secara langsung." },
            { Icon: WifiOff, color: "#475569", bg: "bg-slate-100", title: "Pencatatan Offline-First", desc: "Aplikasi tetap responsif mencatat walau koneksi buruk. Sinkronisasi otomatis saat online." },
          ].map((f, idx) => (
            <div key={idx} className={`bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm hover:shadow transition-all duration-300 animate-fade-in-up ${
              idx === 0 || idx === 3 ? "delay-100" : idx === 1 || idx === 4 ? "delay-200" : "delay-300"
            }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.bg}`}>
                <f.Icon size={18} style={{ color: f.color }} />
              </div>
              <h3 className="font-bold text-[#141a34] mb-1">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-normal">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tabbed Interactive Section for Partners */}
      <section id="institusi" className="py-20 bg-slate-950 text-white relative px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-teal-400 text-xs font-bold uppercase tracking-widest font-mono-label mb-2">Bagi Lembaga & Mitra</p>
            <h2 className="font-headline text-3xl font-extrabold">Solusi Penyaluran Pembiayaan Tepat Sasaran</h2>
          </div>

          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={() => setActiveTab("umkm")}
              className={`px-6 py-2 rounded-full text-xs font-bold border-2 transition-all ${
                activeTab === "umkm" ? "bg-white text-slate-900 border-white" : "border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Untuk Pendamping UMKM
            </button>
            <button
              onClick={() => setActiveTab("institusi")}
              className={`px-6 py-2 rounded-full text-xs font-bold border-2 transition-all ${
                activeTab === "institusi" ? "bg-white text-slate-900 border-white" : "border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Untuk Perbankan & Pemerintah
            </button>
          </div>

          {activeTab === "umkm" ? (
            <div className="grid md:grid-cols-2 gap-8 items-center bg-slate-900 p-8 rounded-3xl border border-slate-800 animate-fade-in-up">
              <div className="space-y-4">
                <h3 className="text-xl font-bold">Pantau Perkembangan Anggota Komunitas Secara Real-Time</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sebagai mitra penggerak atau LSM pendamping, Anda mendapatkan dasbor analitik terpadu untuk melihat kepatuhan pencatatan, skor kesiapan, dan hambatan operasional UMKM dampingan secara anonim namun valid.
                </p>
                <ul className="space-y-2 text-xs text-teal-300 font-semibold">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Otomasi pengumpulan data NIB</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Dasbor klasterisasi performa wilayah</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Notifikasi dini penurunan omset kelompok</li>
                </ul>
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80 space-y-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Mitra Komunitas Terdaftar</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs p-2 bg-slate-900 rounded-lg">
                    <span className="font-bold">SMESCO Indonesia</span>
                    <span className="text-teal-400">234 UMKM</span>
                  </div>
                  <div className="flex justify-between items-center text-xs p-2 bg-slate-900 rounded-lg">
                    <span className="font-bold">Komunitas UMKM Jaya</span>
                    <span className="text-teal-400">87 UMKM</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8 items-center bg-slate-900 p-8 rounded-3xl border border-slate-800 animate-fade-in-up">
              <div className="space-y-4">
                <h3 className="text-xl font-bold">Penilaian Kredit yang Andal & Berbasis Bukti Nyata</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Minimalkan risiko kredit macet (NPL) program KUR Anda. Temukan portofolio UMKM potensial dengan filter Readiness Score, konsistensi pencatatan, dan stabilitas finansial. Ajukan akses berkas (dossier) secara aman.
                </p>
                <ul className="space-y-2 text-xs text-teal-300 font-semibold">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Integrasi pengurusan NIB legal</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Filter verifikasi omset riil transaksi</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} /> Alur persetujuan dossier aman (GDPR)</li>
                </ul>
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80 space-y-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Filter Pencarian Institusi</p>
                <div className="space-y-2 text-xs">
                  <div className="p-2 bg-slate-900 rounded-lg flex items-center justify-between">
                    <span>Sektor: <strong>Kuliner</strong></span>
                    <span className="text-xs bg-[#001b85] text-white px-2 py-0.5 rounded-full">Sesuai</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg flex items-center justify-between">
                    <span>Readiness Score: <strong>&ge; 70</strong></span>
                    <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">Lulus</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA Block */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto rounded-3xl p-10 md:p-14 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #001b85, #006a6a)" }}>
          <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl -z-10" />
          <p className="text-teal-300 text-xs font-bold uppercase tracking-widest font-mono-label mb-3">Siap Mengembangkan Usaha?</p>
          <h2 className="font-headline text-3xl md:text-4xl font-extrabold text-white mb-4">
            Mulai Transformasi Digital Usaha Anda Hari Ini
          </h2>
          <p className="text-white/70 text-base mb-8 max-w-xl mx-auto">
            Dapatkan skoring readiness dan bersiaplah menyambut program pendanaan perbankan formal secara transparan.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/umkm">
              <button className="bg-white text-[#001b85] font-bold px-8 py-4 rounded-full text-base hover:bg-[#f0f0ff] transition-all">
                Coba Sebagai UMKM
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 px-6 text-center bg-white">
        <p className="font-headline font-bold text-[#001b85] mb-1">BERKEMBANG.ID</p>
        <p className="text-xs text-slate-500">Platform Generatif AI Pendamping Journey UMKM Mikro Naik Kelas</p>
        <p className="text-xs text-slate-400 mt-3">© 2026 Tim P0160 — BERKEMBANG.ID</p>
      </footer>
    </div>
  );
}
