"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { ArrowLeft, Camera, Mic, CheckCircle2, RefreshCw } from "lucide-react";

type Step = "idle" | "recording" | "processing" | "preview";

const MOCK_EXTRACTED = [
  { item: "Ayam geprek", qty: "47 porsi", type: "masuk" as const, nominal: 470000, kategori: "Penjualan" },
  { item: "Bahan baku", qty: "1 paket", type: "keluar" as const, nominal: 200000, kategori: "Bahan" },
];

export default function CatatPage() {
  const [step, setStep] = useState<Step>("idle");
  const [items, setItems] = useState(MOCK_EXTRACTED);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleFabPress = () => {
    holdTimerRef.current = setTimeout(() => {
      setStep("recording");
    }, 200);
  };

  const handleFabRelease = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (step === "recording") {
      setStep("processing");
      setTimeout(() => { setStep("preview"); }, 1800);
    }
  };

  const handleConfirm = () => {
    setStep("idle");
    setItems(MOCK_EXTRACTED);
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md px-6 h-14 flex items-center justify-between border-b border-[#c5c5d7]/30">
        <Link href="/umkm" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#ececff]">
          <ArrowLeft size={20} className="text-[#444655]" />
        </Link>
        <h1 className="font-headline text-base font-bold text-[#141a34]">AI Capture</h1>
        <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#ececff]">
          <Camera size={20} className="text-[#444655]" />
        </button>
      </header>

      <main className="px-6 py-6 space-y-6">
        {step === "idle" && (
          <div className="flex flex-col items-center text-center space-y-6 pt-8">
            <div className="w-20 h-20 rounded-full bg-[#ececff] flex items-center justify-center">
              <Mic size={36} className="text-[#001b85]" />
            </div>
            <div>
              <h2 className="font-headline text-xl font-bold text-[#141a34]">Rekam Suara</h2>
              <p className="text-sm text-[#444655] mt-1">Tekan & tahan tombol mic di bawah untuk mulai merekam</p>
            </div>
            <p className="text-xs text-[#444655] bg-[#f3f2ff] px-4 py-3 rounded-xl border border-[#e5e7ff] max-w-xs">
              💬 Contoh: <em>"Tadi pagi jual ayam geprek 47 porsi, dapat 470 ribu. Beli bahan 200 ribu."</em>
            </p>
            <div className="w-full">
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e5e7ff]" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-[#fbf8ff] px-2 text-[#444655]">atau</span></div>
              </div>
              <button className="mt-3 w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#c5c5d7] rounded-xl py-4 text-[#444655] hover:border-[#001b85] hover:text-[#001b85] transition-colors">
                <Camera size={20} />
                <span className="text-sm font-semibold">Ambil Foto Nota / Struk</span>
              </button>
            </div>
          </div>
        )}

        {step === "recording" && (
          <div className="flex flex-col items-center text-center space-y-4 pt-8">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
              <div className="flex items-end gap-1 h-10">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="w-2 bg-red-500 rounded-full waveform-bar" style={{ height: 8 }} />
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-headline text-xl font-bold text-red-600">Merekam...</h2>
              <p className="text-sm text-[#444655] mt-1">Lepaskan untuk berhenti</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-600 font-mono text-sm">00:03</span>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center text-center space-y-4 pt-8">
            <div className="w-20 h-20 rounded-full bg-[#ececff] flex items-center justify-center">
              <RefreshCw size={36} className="text-[#001b85] animate-spin" />
            </div>
            <div>
              <h2 className="font-headline text-xl font-bold text-[#001b85]">Memproses...</h2>
              <p className="text-sm text-[#444655] mt-1">AI sedang menganalisis rekaman Anda</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-600" fill="#16a34a" color="white" />
              <h2 className="font-headline text-base font-bold text-[#141a34]">Hasil Ekstraksi AI</h2>
            </div>
            <p className="text-xs text-[#444655] bg-[#f3f2ff] px-3 py-2 rounded-lg border border-[#e5e7ff]">
              📝 "Tadi pagi jual ayam geprek 47 porsi, dapat 470 ribu. Beli bahan 200 ribu."
            </p>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-white rounded-xl p-4 border border-[#e5e7ff] shadow-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.type === "masuk" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {item.type === "masuk" ? "▲ Pemasukan" : "▼ Pengeluaran"}
                    </span>
                    <span className="text-xs text-[#444655]">{item.kategori}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#141a34]">{item.item}</p>
                      <p className="text-xs text-[#444655]">{item.qty}</p>
                    </div>
                    <p className={`font-bold text-lg ${item.type === "masuk" ? "text-green-700" : "text-red-600"}`}>
                      {item.type === "masuk" ? "+" : "-"}Rp{item.nominal.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-[#444655] text-center">✅ Pastikan data sudah benar sebelum menyimpan</p>
            <button onClick={handleConfirm} className="w-full bg-[#001b85] text-white font-bold py-4 rounded-xl hover:bg-[#0e32c2] transition-colors text-base">
              Simpan Catatan
            </button>
            <button onClick={() => setStep("idle")} className="w-full text-[#444655] font-semibold py-3 rounded-xl border border-[#c5c5d7] hover:bg-[#f3f2ff] transition-colors text-sm">
              Rekam Ulang
            </button>
          </div>
        )}
      </main>

      {(step === "idle" || step === "recording") && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50">
          {step === "recording" && <p className="text-xs text-red-600 font-semibold animate-pulse">Lepaskan untuk selesai</p>}
          <button
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all select-none ${step === "recording" ? "bg-red-500 scale-110" : ""}`}
            style={step !== "recording" ? { background: "linear-gradient(135deg, #15803d, #0ea5e9)" } : {}}
            onMouseDown={handleFabPress}
            onMouseUp={handleFabRelease}
            onTouchStart={handleFabPress}
            onTouchEnd={handleFabRelease}
          >
            {step === "recording" ? (
              <div className="flex items-end gap-[3px] h-8">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="w-[3px] bg-white rounded-full waveform-bar" style={{ height: 8 }} />)}
              </div>
            ) : (
              <Mic size={28} className="text-white" />
            )}
          </button>
        </div>
      )}
    </>
  );
}
