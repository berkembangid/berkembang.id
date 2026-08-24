"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, User, Sparkles, ChevronRight } from "lucide-react";

interface QuickQuestion {
  label: string;
  question: string;
  reply: string;
}

const QUICK_QUESTIONS: QuickQuestion[] = [
  {
    label: "Cara buat NIB gratis?",
    question: "Bagaimana cara membuat NIB secara gratis?",
    reply: `Pembuatan NIB (Nomor Induk Berusaha) dilakukan 100% gratis melalui OSS (Online Single Submission):

**Langkah-langkahnya:**
1. Buka situs oss.go.id
2. Daftar akun menggunakan NIK KTP dan email aktif
3. Pilih "Perizinan Berusaha" → "Perseorangan" atau "Non-Perseorangan"
4. Isi data usaha: nama usaha, KBLI (jenis usaha), lokasi
5. Submit — NIB terbit otomatis dalam hitungan menit

NIB berlaku seumur hidup dan menggantikan izin lama seperti SIUP & TDP. Dengan NIB, skor kesiapan KUR Anda naik signifikan!`,
  },
  {
    label: "Dokumen wajib KUR?",
    question: "Dokumen apa saja yang wajib untuk KUR?",
    reply: `Berikut dokumen wajib pengajuan KUR (Kredit Usaha Rakyat):

**Dokumen Identitas:**
• KTP Pemilik Usaha (wajib)
• KK (Kartu Keluarga)
• Surat Nikah (jika sudah menikah)

**Dokumen Legalitas Usaha:**
• NIB dari OSS.go.id (sangat penting!)
• NPWP Pribadi/Usaha

**Dokumen Keuangan:**
• Rekening Koran 3–6 bulan terakhir
• Laporan keuangan / catatan transaksi usaha
• Foto usaha dan lokasi

**Tips:** Unggah semua dokumen di menu Upload Dokumen untuk menaikkan skor kesiapan Anda secara otomatis!`,
  },
  {
    label: "Naikkan skor kesiapan?",
    question: "Bagaimana cara menaikkan skor kesiapan usaha?",
    reply: `Skor kesiapan usaha Anda dihitung dari 5 komponen utama. Ini cara tercepat menaikkannya:

**🏆 Legalitas (bobot 25%):**
• Isi NIB di Profil Usaha → naik drastis
• Lengkapi nama usaha dan sektor

**📋 Kelengkapan Dokumen (bobot 25%):**
• Upload KTP, NIB, NPWP, Laporan Keuangan
• Setiap dokumen = poin ekstra

**📊 Konsistensi Transaksi (bobot 20%):**
• Catat transaksi setiap hari di menu Catat AI
• Target minimal 10 transaksi untuk poin penuh awal

**💰 Aktivitas Usaha (bobot 15%):**
• Pastikan omzet masuk lebih besar dari pengeluaran
• Cashflow positif = skor lebih tinggi

**📍 Data Pendukung (bobot 15%):**
• Isi lokasi kota, sektor usaha, dan nomor WhatsApp di Profil`,
  },
  {
    label: "Bunga KUR Mikro 2025?",
    question: "Berapa estimasi bunga KUR mikro saat ini?",
    reply: `Informasi Bunga KUR Mikro terbaru (2025):

**Suku Bunga:**
• **6% efektif per tahun** — disubsidi pemerintah
• Berlaku untuk semua bank penyalur KUR resmi

**Plafon Pinjaman:**
• KUR Mikro: hingga **Rp 100 juta** (tanpa jaminan untuk debitur tertentu)
• KUR Kecil: Rp 100 juta – Rp 500 juta
• KUR TKI: hingga Rp 100 juta

**Bank Penyalur Utama:**
BRI, BNI, Mandiri, BSI, BPD, bank swasta mitra

**Syarat Utama:**
Usaha berjalan minimal 6 bulan, memiliki NIB, dan rekam jejak transaksi yang baik.

Semakin tinggi skor kesiapan usaha Anda, semakin besar peluang disetujui!`,
  },
  {
    label: "KUR tanpa jaminan?",
    question: "Apakah KUR bisa tanpa jaminan?",
    reply: `Ya! KUR bisa tanpa jaminan tambahan untuk kondisi tertentu:

**KUR Mikro tanpa agunan:**
• Plafon hingga **Rp 100 juta**
• Jaminan diganti dengan kelayakan usaha yang terverifikasi
• Bank melihat histori transaksi dan dokumen legalitas

**Faktor yang menggantikan jaminan:**
• NIB aktif dari OSS
• Riwayat transaksi konsisten (minimal 6 bulan)
• Rekening koran yang sehat
• NPWP aktif

**Tips penting:**
Semakin lengkap dokumen Anda di platform ini, semakin kuat "jaminan non-fisik" Anda di mata bank. Fokus naikkan skor kesiapan ke angka ≥ 75 poin!`,
  },
  {
    label: "Cara upload dokumen?",
    question: "Bagaimana cara upload dokumen di platform ini?",
    reply: `Berikut cara upload dokumen di Berkembang.id:

**Langkah Upload:**
1. Pergi ke menu **Upload Dokumen** di navigasi bawah
2. Pilih jenis dokumen (KTP, NIB, NPWP, dll)
3. Klik tombol "Pilih / Drop Dokumen"
4. Pilih file dari HP/komputer Anda (JPG, PNG, atau PDF)
5. Dokumen terunggah otomatis ke sistem

**Fitur spesial untuk NIB:**
Saat Anda upload sertifikat NIB, sistem AI kami akan **otomatis membaca nomor NIB** dari dokumen dan menyinkronkannya ke Profil Usaha Anda — tidak perlu input manual!

**Format yang didukung:** JPG, PNG, PDF
**Ukuran maksimal:** 10MB per file`,
  },
];

const DEFAULT_REPLY =
  "Terima kasih atas pertanyaannya! Untuk hasil terbaik dalam pengajuan KUR, pastikan NIB sudah terdaftar di oss.go.id, lengkapi seluruh dokumen di menu Upload, dan rutin mencatat transaksi harian di menu Catat AI. Semakin tinggi skor kesiapan, semakin besar peluang pengajuan disetujui bank mitra. Ada pertanyaan lain?";

export default function AICopilotPage() {
  const [messages, setMessages] = useState([
    {
      sender: "ai",
      text: "Halo! Saya AI Copilot Berkembang.id. Saya sudah menganalisis profil usahamu. Ada yang bisa saya bantu terkait perbaikan dokumen atau strategi pendanaan KUR?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const quickScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = (textToSend?: string, replyOverride?: string) => {
    const q = textToSend || input;
    if (!q.trim() || loading) return;

    const newMsgs = [...messages, { sender: "user", text: q }];
    setMessages(newMsgs);
    if (!textToSend) setInput("");
    setLoading(true);

    setTimeout(() => {
      let reply = DEFAULT_REPLY;

      if (replyOverride) {
        reply = replyOverride;
      } else {
        const lower = q.toLowerCase();
        const matched = QUICK_QUESTIONS.find((qq) =>
          qq.question.toLowerCase().split(" ").some((word) => lower.includes(word) && word.length > 3)
        );
        if (matched) {
          reply = matched.reply;
        } else if (lower.includes("nib") || lower.includes("oss")) {
          reply = QUICK_QUESTIONS[0].reply;
        } else if (lower.includes("kur") && (lower.includes("dokumen") || lower.includes("syarat") || lower.includes("berkas"))) {
          reply = QUICK_QUESTIONS[1].reply;
        } else if (lower.includes("skor") || lower.includes("score") || lower.includes("kesiapan")) {
          reply = QUICK_QUESTIONS[2].reply;
        } else if (lower.includes("bunga") || lower.includes("persen") || lower.includes("mikro")) {
          reply = QUICK_QUESTIONS[3].reply;
        } else if (lower.includes("jaminan") || lower.includes("agunan") || lower.includes("kolateral")) {
          reply = QUICK_QUESTIONS[4].reply;
        } else if (lower.includes("upload") || lower.includes("unggah") || lower.includes("dokumen")) {
          reply = QUICK_QUESTIONS[5].reply;
        }
      }

      setMessages([...newMsgs, { sender: "ai", text: reply }]);
      setLoading(false);
    }, 900);
  };

  // Render markdown-style bold with **text**
  function renderText(text: string) {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <span key={i}>
          {parts.map((part, j) =>
            j % 2 === 1 ? (
              <strong key={j} className="font-bold">
                {part}
              </strong>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
          {i < lines.length - 1 && <br />}
        </span>
      );
    });
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
          AI Copilot Usaha{" "}
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Pro</span>
        </h1>
        <p className="text-xs md:text-sm text-slate-500 mt-0.5">
          Asisten cerdas untuk konsultasi pendanaan, legalitas KUR, &amp; perbaikan dokumen usaha.
        </p>
      </div>

      {/* Quick Questions — scrollable */}
      <div className="flex-shrink-0 px-4 pb-2">
        <div
          ref={quickScrollRef}
          className="flex items-center gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {QUICK_QUESTIONS.map((qq, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qq.question, qq.reply)}
              disabled={loading}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 px-3 py-2 rounded-full transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-sm"
            >
              <Sparkles size={11} className="text-blue-400 flex-shrink-0" />
              {qq.label}
            </button>
          ))}
          <div className="flex-shrink-0 w-2" />
        </div>
      </div>

      {/* Chat Messages Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 space-y-4 pb-3"
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex items-start gap-3 ${m.sender === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs mt-0.5 ${
                m.sender === "user" ? "bg-slate-800 text-white" : "bg-[#0f2d6b] text-cyan-300"
              }`}
            >
              {m.sender === "user" ? <User size={15} /> : <Bot size={15} />}
            </div>
            <div
              className={`p-3.5 rounded-2xl text-xs max-w-[82%] leading-relaxed ${
                m.sender === "user"
                  ? "bg-[#0f2d6b] text-white rounded-tr-none"
                  : "bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm"
              }`}
            >
              {renderText(m.text)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-medium">
            <div className="w-8 h-8 rounded-full bg-[#0f2d6b] flex items-center justify-center flex-shrink-0">
              <Bot size={15} className="text-cyan-300" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              <span className="italic">AI sedang berpikir...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <div className="flex-shrink-0 px-4 pt-2 pb-28 md:pb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanyakan sesuatu tentang KUR atau perbaikan skor usahamu..."
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-blue-500 shadow-sm"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-[#0f2d6b] hover:bg-blue-900 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer text-xs shadow-sm flex-shrink-0"
          >
            Kirim <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
