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
      let reply = "Ini contoh jawaban antarmuka. Informasi belum dipersonalisasi dari data usahamu dan perlu diverifikasi ke sumber resmi.";
      if (q.toLowerCase().includes("nib")) {
        reply = "Untuk informasi pembuatan NIB, periksa panduan terbaru pada situs resmi OSS. Simulasi ini belum memverifikasi kondisi atau dokumen usahamu.";
      } else if (q.toLowerCase().includes("kur") || q.toLowerCase().includes("bunga")) {
        reply = "Ketentuan KUR dapat berubah. Periksa sumber resmi pemerintah atau lembaga penyalur; simulasi ini tidak memberikan keputusan atau janji pembiayaan.";
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
