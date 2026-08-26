"use client";

import { useState } from "react";
import { Bot, Send, User, Sparkles } from "lucide-react";
import DemoBanner from "@/components/DemoBanner";

export default function AICopilotPage() {
  const [messages, setMessages] = useState([
    {
      sender: "ai",
      text: "Halo! Ini simulasi AI Copilot. Halaman ini belum menganalisis profil atau data usahamu.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const quickQuestions = [
    "Bagaimana cara membuat NIB secara gratis?",
    "Dokumen apa saja yang wajib untuk KUR?",
    "Bagaimana cara menaikkan skor kesiapan usaha?",
    "Berapa estimasi bunga KUR mikro saat ini?",
  ];

  const handleSend = (textToSend?: string) => {
    const q = textToSend || input;
    if (!q.trim() || loading) return;

    const newMsgs = [...messages, { sender: "user", text: q }];
    setMessages(newMsgs);
    if (!textToSend) setInput("");
    setLoading(true);

    setTimeout(() => {
      let reply = "Ini contoh jawaban antarmuka. Informasi belum dipersonalisasi dari data usahamu dan perlu diverifikasi ke sumber resmi.";
      if (q.toLowerCase().includes("nib")) {
        reply = "Untuk informasi pembuatan NIB, periksa panduan terbaru pada situs resmi OSS. Simulasi ini belum memverifikasi kondisi atau dokumen usahamu.";
      } else if (q.toLowerCase().includes("kur") || q.toLowerCase().includes("bunga")) {
        reply = "Ketentuan KUR dapat berubah. Periksa sumber resmi pemerintah atau lembaga penyalur; simulasi ini tidak memberikan keputusan atau janji pembiayaan.";
      }
      setMessages([...newMsgs, { sender: "ai", text: reply }]);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 max-w-4xl mx-auto flex flex-col h-[calc(100vh-4rem)]">
      <DemoBanner>Jawaban Copilot di halaman ini belum memakai profil atau data usaha Anda.</DemoBanner>
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
          AI Copilot Usaha <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">Demo</span>
        </h1>
        <p className="text-xs md:text-sm text-slate-500 mt-0.5">
          Asisten cerdas untuk konsultasi pendanaan, legalitas KUR, &amp; perbaikan dokumen usaha.
        </p>
      </div>

      {/* Quick suggestions */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-none">
        {quickQuestions.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 px-3 py-1.5 rounded-full flex-shrink-0 transition-all cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Messages Container */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 overflow-y-auto space-y-4 shadow-sm">
        {messages.map((m, i) => (
          <div key={i} className={`flex items-start gap-3 ${m.sender === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs ${
                m.sender === "user" ? "bg-slate-800 text-white" : "bg-[#0f2d6b] text-cyan-300"
              }`}
            >
              {m.sender === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div
              className={`p-3.5 rounded-2xl text-xs max-w-[80%] leading-relaxed ${
                m.sender === "user"
                  ? "bg-[#0f2d6b] text-white rounded-tr-none"
                  : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/60"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium italic">
            <Sparkles size={14} className="animate-spin text-blue-500" />
            AI Copilot sedang berpikir...
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="mt-3 flex gap-2"
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
          className="bg-[#0f2d6b] hover:bg-blue-900 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer text-xs shadow-sm"
        >
          Kirim <Send size={14} />
        </button>
      </form>
    </div>
  );
}
