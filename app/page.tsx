"use client";

import Link from "next/link";
import {
  Mic, Sparkles, TrendingUp, Flame, BarChart2, Target, Handshake, WifiOff,
  ArrowRight, ShieldCheck, CheckCircle2, Star, Play, User, Home, Bell, Menu, X, LogIn
} from "lucide-react";
import { useState } from "react";

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<"umkm" | "institusi">("umkm");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#bac3ff]/50 selection:text-[#001b85]">
      {/* Navigation Pill */}
      <nav className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 w-[95%] sm:w-[92%] max-w-6xl z-50 bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-lg rounded-full px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo/logo berkembang.webp" alt="Berkembang.id Logo" className="h-7 sm:h-8 w-auto object-contain" />
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#cara-kerja" className="text-sm text-slate-600 hover:text-[#001b85] font-semibold transition-colors">Cara Kerja</a>
          <a href="#fitur" className="text-sm text-slate-600 hover:text-[#001b85] font-semibold transition-colors">Fitur</a>
          <a href="#institusi" className="text-sm text-slate-600 hover:text-[#001b85] font-semibold transition-colors">Kemitraan</a>
        </div>

        {/* Desktop Auth Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login">
            <button className="group relative inline-flex items-center justify-center gap-2 px-5 py-2 rounded-full text-sm font-bold text-[#001b85] bg-[#ececff]/90 hover:bg-[#001b85] hover:text-white border border-[#bac3ff]/80 hover:border-[#001b85] shadow-sm hover:shadow-md hover:shadow-[#001b85]/20 transition-all duration-300 active:scale-95 cursor-pointer overflow-hidden">
              <LogIn size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
              <span>Masuk</span>
              <span className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out pointer-events-none" />
            </button>
          </Link>
        </div>

        {/* Mobile Header Controls */}
        <div className="flex md:hidden items-center gap-2">
          <Link href="/auth/login">
            <button className="inline-flex items-center gap-1.5 text-xs font-bold text-[#001b85] bg-[#ececff]/90 hover:bg-[#001b85] hover:text-white px-3.5 py-1.5 rounded-full border border-[#bac3ff]/80 transition-all duration-200 shadow-sm active:scale-95 cursor-pointer">
              <LogIn size={13} />
              <span>Masuk</span>
            </button>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-700 hover:text-[#001b85] focus:outline-none cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="fixed top-20 left-4 right-4 bg-white rounded-3xl p-6 shadow-2xl border border-slate-200/80 space-y-4 text-center z-50 animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-3 pb-4 border-b border-slate-100 text-sm font-bold text-slate-700">
              <a href="#cara-kerja" onClick={() => setIsMobileMenuOpen(false)} className="py-2 hover:text-[#001b85] transition-colors">Cara Kerja</a>
              <a href="#fitur" onClick={() => setIsMobileMenuOpen(false)} className="py-2 hover:text-[#001b85] transition-colors">Fitur</a>
              <a href="#institusi" onClick={() => setIsMobileMenuOpen(false)} className="py-2 hover:text-[#001b85] transition-colors">Kemitraan</a>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Link href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                <button className="w-full inline-flex items-center justify-center gap-2 text-[#001b85] font-bold py-3 rounded-full text-sm bg-[#ececff]/90 hover:bg-[#001b85] hover:text-white border border-[#bac3ff] shadow-sm transition-all duration-200 cursor-pointer">
                  <LogIn size={16} />
                  <span>Masuk ke Akun</span>
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 overflow-hidden px-4 sm:px-6">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/4 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-gradient-to-tr from-sky-200/40 to-blue-200/30 rounded-full blur-3xl -z-10" />
        <div className="absolute top-1/3 right-1/4 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-gradient-to-br from-purple-200/30 to-[#ececff]/40 rounded-full blur-3xl -z-10" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Hero Copy */}
          <div className="lg:col-span-7 space-y-5 sm:space-y-6 text-left animate-fade-in-up">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-[#ececff] text-[#001b85] text-[11px] sm:text-xs font-bold px-3.5 py-1.5 rounded-full border border-[#bac3ff]/60 max-w-full">
              <Sparkles size={13} className="animate-pulse shrink-0" />
              <span className="truncate">Platform AI Pendamping UMKM Pertama di Indonesia</span>
            </div>
            
            <h1 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#141a34] leading-tight">
              Catat Untung Usaha,<br className="hidden sm:inline" />{" "}
              <span className="text-gradient-brand">Siap Naik Kelas</span>
            </h1>

            <p className="text-sm sm:text-lg text-slate-600 max-w-xl leading-relaxed">
              Catat keuangan semudah bercakap-cakap. Cukup rekam suara transaksi harian Anda, AI kami otomatis memetakan kas, menghitung keuntungan, dan menyusun skor kelayakan pembiayaan Anda.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-2">
              <Link href="/umkm">
                <button className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-sky-600 text-white font-bold px-8 py-3.5 sm:py-4 rounded-full text-sm sm:text-base transition-all hover:shadow-lg hover:scale-[1.02] text-center flex items-center justify-center gap-2 cursor-pointer">
                  <Mic size={18} />
                  Mulai Rekam Suara Free
                </button>
              </Link>
              <Link href="/institusi">
                <button className="w-full sm:w-auto text-[#001b85] font-bold px-8 py-3.5 sm:py-4 rounded-full text-sm sm:text-base border-2 border-[#001b85] hover:bg-[#ececff]/40 transition-colors text-center cursor-pointer">
                  Portal Institusi
                </button>
              </Link>
            </div>

            {/* Micro stats banner */}
            <div className="pt-6 border-t border-slate-200/80 grid grid-cols-3 gap-2 sm:gap-4 max-w-md">
              <div>
                <p className="text-xl sm:text-2xl font-black text-[#001b85]">1,200+</p>
                <p className="text-[10px] sm:text-xs text-slate-500 font-semibold">UMKM Aktif</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-emerald-600">18+</p>
                <p className="text-[10px] sm:text-xs text-slate-500 font-semibold">Bank & Fintech</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-indigo-600">62.4</p>
                <p className="text-[10px] sm:text-xs text-slate-500 font-semibold">Readiness Score</p>
              </div>
            </div>
          </div>

          {/* Right Hero Interactive Mockup */}
          <div className="lg:col-span-5 relative flex justify-center mt-6 lg:mt-0 animate-fade-in-up delay-200">
            {/* Phone shell wrapper */}
            <div className="relative w-[280px] sm:w-[290px] h-[520px] sm:h-[580px] bg-slate-900 rounded-[36px] sm:rounded-[40px] p-2.5 sm:p-3 shadow-2xl border-4 border-slate-800 flex flex-col overflow-hidden">
              {/* Screen Content */}
              <div className="bg-[#fbf8ff] flex-1 rounded-[28px] sm:rounded-[32px] overflow-hidden flex flex-col relative text-xs">
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
              <div className="absolute bottom-11 left-1/2 -translate-x-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-emerald-600 to-sky-500 flex items-center justify-center shadow-lg border-2 border-white z-40">
                <Mic size={18} className="text-white animate-pulse" />
              </div>
            </div>
            {/* Glowing orb behind phone */}
            <div className="absolute -inset-4 bg-gradient-to-tr from-[#0ea5e9]/20 to-[#001b85]/10 rounded-[50px] blur-xl -z-10" />
          </div>
        </div>
      </section>

      {/* Cara Kerja */}
      <section id="cara-kerja" className="py-14 sm:py-20 bg-slate-100/60 px-4 sm:px-6 border-y border-slate-200/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <p className="text-xs font-bold text-[#001b85] uppercase tracking-widest font-mono-label mb-2">Langkah Mudah</p>
            <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-[#141a34]">Bagaimana Berkembang.id Bekerja</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-2">Pencatatan canggih tanpa perlu memahami pembukuan rumit</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {[
              { num: "01", Icon: Mic, title: "Rekam Transaksi", desc: "Cukup tekan tombol mic di dashboard mobile, sebutkan transaksi Anda seperti berbicara biasa.", color: "#16a34a" },
              { num: "02", Icon: Sparkles, title: "AI Ekstraksi Otomatis", desc: "Whisper & GPT memproses ucapan Anda untuk mengenali barang, kuantitas, harga, dan kategori secara tepat.", color: "#001b85" },
              { num: "03", Icon: TrendingUp, title: "Profil Siap Dana", desc: "Data kas Anda diolah menjadi Readiness Score. Ketika score Anda tinggi, bank mitra akan menawarkan pendanaan.", color: "#0d9488" },
            ].map((step, idx) => (
              <div key={idx} className={`bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/50 shadow-sm relative group hover:border-[#bac3ff] hover:shadow transition-all duration-300 animate-fade-in-up ${
                idx === 0 ? "delay-100" : idx === 1 ? "delay-200" : "delay-300"
              }`}>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${step.color}15` }}>
                  <step.Icon size={20} style={{ color: step.color }} />
                </div>
                <p className="text-[10px] font-mono-label font-bold text-slate-400 mb-1">{step.num}</p>
                <h3 className="font-headline font-bold text-base sm:text-lg text-[#141a34] mb-2">{step.title}</h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="fitur" className="py-14 sm:py-20 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center mb-10 sm:mb-16">
          <p className="text-xs font-bold text-[#001b85] uppercase tracking-widest font-mono-label mb-2">Fitur Unggulan</p>
          <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-[#141a34]">Didesain Khusus Untuk Ekosistem Mikro</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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
              <h3 className="font-bold text-[#141a34] text-sm sm:text-base mb-1">{f.title}</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-normal">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tabbed Interactive Section for Partners */}
      <section id="institusi" className="py-14 sm:py-20 bg-slate-950 text-white relative px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <p className="text-teal-400 text-xs font-bold uppercase tracking-widest font-mono-label mb-2">Bagi Lembaga & Mitra</p>
            <h2 className="font-headline text-2xl sm:text-3xl font-extrabold">Solusi Penyaluran Pembiayaan Tepat Sasaran</h2>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-4 mb-8">
            <button
              onClick={() => setActiveTab("umkm")}
              className={`px-5 sm:px-6 py-2.5 sm:py-2 rounded-full text-xs font-bold border-2 transition-all w-full sm:w-auto cursor-pointer ${
                activeTab === "umkm" ? "bg-white text-slate-900 border-white" : "border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Untuk Pendamping UMKM
            </button>
            <button
              onClick={() => setActiveTab("institusi")}
              className={`px-5 sm:px-6 py-2.5 sm:py-2 rounded-full text-xs font-bold border-2 transition-all w-full sm:w-auto cursor-pointer ${
                activeTab === "institusi" ? "bg-white text-slate-900 border-white" : "border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Untuk Perbankan & Pemerintah
            </button>
          </div>

          {activeTab === "umkm" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-center bg-slate-900 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-800 animate-fade-in-up">
              <div className="space-y-3 sm:space-y-4">
                <h3 className="text-lg sm:text-xl font-bold">Pantau Perkembangan Anggota Komunitas Secara Real-Time</h3>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                  Sebagai mitra penggerak atau LSM pendamping, Anda mendapatkan dasbor analitik terpadu untuk melihat kepatuhan pencatatan, skor kesiapan, dan hambatan operasional UMKM dampingan secara anonim namun valid.
                </p>
                <ul className="space-y-2 text-xs text-teal-300 font-semibold">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0" /> Otomasi pengumpulan data NIB</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0" /> Dasbor klasterisasi performa wilayah</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0" /> Notifikasi dini penurunan omset kelompok</li>
                </ul>
              </div>
              <div className="bg-slate-950 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-800/80 space-y-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Mitra Komunitas Terdaftar</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs p-2.5 bg-slate-900 rounded-lg">
                    <span className="font-bold">SMESCO Indonesia</span>
                    <span className="text-teal-400 font-semibold">234 UMKM</span>
                  </div>
                  <div className="flex justify-between items-center text-xs p-2.5 bg-slate-900 rounded-lg">
                    <span className="font-bold">Komunitas UMKM Jaya</span>
                    <span className="text-teal-400 font-semibold">87 UMKM</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-center bg-slate-900 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-800 animate-fade-in-up">
              <div className="space-y-3 sm:space-y-4">
                <h3 className="text-lg sm:text-xl font-bold">Penilaian Kredit yang Andal & Berbasis Bukti Nyata</h3>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                  Minimalkan risiko kredit macet (NPL) program KUR Anda. Temukan portofolio UMKM potensial dengan filter Readiness Score, konsistensi pencatatan, dan stabilitas finansial. Ajukan akses berkas (dossier) secara aman.
                </p>
                <ul className="space-y-2 text-xs text-teal-300 font-semibold">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0" /> Integrasi pengurusan NIB legal</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0" /> Filter verifikasi omset riil transaksi</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0" /> Alur persetujuan dossier aman (GDPR)</li>
                </ul>
              </div>
              <div className="bg-slate-950 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-800/80 space-y-3">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Filter Pencarian Institusi</p>
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-slate-900 rounded-lg flex items-center justify-between">
                    <span>Sektor: <strong>Kuliner</strong></span>
                    <span className="text-[10px] sm:text-xs bg-[#001b85] text-white px-2 py-0.5 rounded-full font-bold">Sesuai</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg flex items-center justify-between">
                    <span>Readiness Score: <strong>&ge; 70</strong></span>
                    <span className="text-[10px] sm:text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">Lulus</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA Block */}
      <section className="py-14 sm:py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-14 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #001b85, #006a6a)" }}>
          <div className="absolute top-0 right-0 w-60 sm:w-80 h-60 sm:h-80 bg-teal-500/10 rounded-full blur-3xl -z-10" />
          <p className="text-teal-300 text-xs font-bold uppercase tracking-widest font-mono-label mb-2 sm:mb-3">Siap Mengembangkan Usaha?</p>
          <h2 className="font-headline text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-3 sm:mb-4">
            Mulai Transformasi Digital Usaha Anda Hari Ini
          </h2>
          <p className="text-white/80 text-xs sm:text-base mb-6 sm:mb-8 max-w-xl mx-auto leading-relaxed">
            Dapatkan skoring readiness dan bersiaplah menyambut program pendanaan perbankan formal secara transparan.
          </p>
          <div className="flex justify-center">
            <Link href="/umkm">
              <button className="w-full sm:w-auto bg-white text-[#001b85] font-bold px-8 py-3.5 sm:py-4 rounded-full text-sm sm:text-base hover:bg-[#f0f0ff] transition-all cursor-pointer shadow-md">
                Coba Sebagai UMKM
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 sm:py-8 px-4 sm:px-6 text-center bg-white">
        <p className="font-headline font-bold text-[#001b85] mb-1 text-sm sm:text-base">BERKEMBANG.ID</p>
        <p className="text-[11px] sm:text-xs text-slate-500">Platform Generatif AI Pendamping Journey UMKM Mikro Naik Kelas</p>
        <p className="text-[10px] sm:text-xs text-slate-400 mt-2 sm:mt-3">© 2026 Tim P0160 — BERKEMBANG.ID</p>
      </footer>
    </div>
  );
}
