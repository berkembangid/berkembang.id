"use client";

import { useState } from "react";

type Weights = {
  konsistensi: number;
  kas: number;
  legalitas: number;
  stabilitas: number;
};

const SAMPLE_UMKM = [
  { id: "1", name: "Warung Ibu Sari", scores: { konsistensi: 75, kas: 60, legalitas: 20, stabilitas: 65 } },
  { id: "2", name: "Dapur Bu Ani", scores: { konsistensi: 80, kas: 70, legalitas: 50, stabilitas: 55 } },
  { id: "3", name: "Butik Muda", scores: { konsistensi: 40, kas: 80, legalitas: 90, stabilitas: 70 } },
];

const VERSION_HISTORY = [
  { version: "v3", date: "2026-06-15 09:00", user: "admin@berkembang.id", changes: "Konsistensi ↑ 30→35, Legalitas ↑ 20→25" },
  { version: "v2", date: "2026-05-01 14:30", user: "admin@berkembang.id", changes: "Kas ↑ 30→35, Stabilitas ↓ 25→20" },
  { version: "v1", date: "2026-03-10 10:00", user: "system", changes: "Inisiasi bobot pertama" },
];

export default function RulesPage() {
  const [weights, setWeights] = useState<Weights>({
    konsistensi: 35,
    kas: 35,
    legalitas: 25,
    stabilitas: 5,
  });
  const [thresholds, setThresholds] = useState({ maxDailyExpense: 500000, maxDailyIncome: 2000000 });
  const [selectedUMKM, setSelectedUMKM] = useState(SAMPLE_UMKM[0]);
  const [saved, setSaved] = useState(false);

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const isValid = total === 100;

  const computeScore = (scores: typeof selectedUMKM.scores, w: Weights) => {
    return Math.round(
      (scores.konsistensi * w.konsistensi) / 100 +
      (scores.kas * w.kas) / 100 +
      (scores.legalitas * w.legalitas) / 100 +
      (scores.stabilitas * w.stabilitas) / 100
    );
  };

  const oldScore = computeScore(selectedUMKM.scores, { konsistensi: 35, kas: 35, legalitas: 25, stabilitas: 5 });
  const newScore = computeScore(selectedUMKM.scores, weights);

  const updateWeight = (key: keyof Weights, val: number) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const handlePublish = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <h1 className="font-headline text-2xl md:text-3xl font-extrabold text-[#141a34]">Rules Engine</h1>
        <p className="text-sm text-slate-500 mt-1">Sesuaikan formula kalkulasi Readiness Score bagi ekosistem UMKM</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left — Weights editor */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card p-5">
            <h2 className="font-bold text-[#141a34] mb-1">Bobot Komponen</h2>
            <p className={`text-xs mb-4 font-semibold ${isValid ? "text-green-700" : "text-red-600"}`}>
              Total: {total}% {isValid ? "✅ Sudah 100%" : "⚠️ Harus tepat 100%"}
            </p>

            <div className="space-y-5">
              {(Object.keys(weights) as (keyof Weights)[]).map((key) => {
                const COLORS: Record<keyof Weights, string> = {
                  konsistensi: "#0ea5e9",
                  kas: "#001b85",
                  legalitas: "#10b981",
                  stabilitas: "#8b5cf6",
                };
                return (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-sm font-semibold text-[#141a34] capitalize">{key}</label>
                      <span className="text-sm font-bold" style={{ color: COLORS[key] }}>{weights[key]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={weights[key]}
                      onChange={(e) => updateWeight(key, Number(e.target.value))}
                      className="w-full"
                      style={{ accentColor: COLORS[key] }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thresholds */}
          <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card p-5">
            <h2 className="font-bold text-[#141a34] mb-3">Threshold</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#444655]">Max Pengeluaran Harian (Rp)</label>
                <input
                  type="number"
                  value={thresholds.maxDailyExpense}
                  onChange={(e) => setThresholds((t) => ({ ...t, maxDailyExpense: Number(e.target.value) }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#444655]">Max Pemasukan Harian (Rp)</label>
                <input
                  type="number"
                  value={thresholds.maxDailyIncome}
                  onChange={(e) => setThresholds((t) => ({ ...t, maxDailyIncome: Number(e.target.value) }))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handlePublish}
              disabled={!isValid}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${
                isValid
                  ? "bg-[#001b85] text-white hover:bg-[#0e32c2]"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {saved ? "✅ Tersimpan!" : "Publish Perubahan"}
            </button>
            <button
              onClick={() => setWeights({ konsistensi: 35, kas: 35, legalitas: 25, stabilitas: 5 })}
              className="flex-1 py-3 rounded-xl font-semibold text-sm border border-[#c5c5d7] text-[#444655] hover:bg-[#f3f2ff]"
            >
              Buang Perubahan
            </button>
          </div>
        </div>

        {/* Right — Preview + History */}
        <div className="space-y-4">
          {/* Preview panel */}
          <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card p-5">
            <h2 className="font-bold text-[#141a34] mb-3">Preview Dampak</h2>
            <select
              className="w-full px-3 py-2 rounded-lg border border-[#c5c5d7] text-sm mb-4 focus:border-[#001b85] focus:outline-none"
              onChange={(e) => setSelectedUMKM(SAMPLE_UMKM.find((u) => u.id === e.target.value)!)}
            >
              {SAMPLE_UMKM.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-[#f3f2ff] rounded-xl border border-[#e5e7ff]">
                <p className="text-xs text-[#444655] font-semibold mb-1">Skor Lama</p>
                <p className="text-3xl font-bold text-[#444655] font-headline">{oldScore}</p>
                <p className="text-[10px] text-[#757686] mt-1">Bobot sebelumnya</p>
              </div>
              <div className="text-center p-4 rounded-xl border-2 border-[#001b85] bg-[#ececff]">
                <p className="text-xs text-[#001b85] font-semibold mb-1">Skor Baru</p>
                <p className="text-3xl font-bold text-[#001b85] font-headline">{newScore}</p>
                <p className={`text-xs font-bold mt-1 ${newScore > oldScore ? "text-green-600" : newScore < oldScore ? "text-red-600" : "text-[#444655]"}`}>
                  {newScore > oldScore ? `▲ +${newScore - oldScore}` : newScore < oldScore ? `▼ ${newScore - oldScore}` : "Tidak berubah"}
                </p>
              </div>
            </div>

            {/* Score breakdown */}
            <div className="mt-4 space-y-2">
              {(Object.keys(weights) as (keyof Weights)[]).map((key) => {
                const score = selectedUMKM.scores[key];
                const contribution = Math.round((score * weights[key]) / 100);
                return (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-[#444655] capitalize">{key} ({score} × {weights[key]}%)</span>
                    <span className="font-bold text-[#141a34]">{contribution}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Version history */}
          <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card p-5">
            <h2 className="font-bold text-[#141a34] mb-3">Riwayat Versi</h2>
            <div className="space-y-3">
              {VERSION_HISTORY.map((v) => (
                <div key={v.version} className="flex items-start gap-3 p-3 bg-[#f3f2ff] rounded-xl">
                  <span className="text-xs font-bold bg-[#001b85] text-white px-2 py-0.5 rounded-full mt-0.5">{v.version}</span>
                  <div>
                    <p className="text-xs font-semibold text-[#141a34]">{v.changes}</p>
                    <p className="text-[10px] text-[#444655]">{v.user} · {v.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
