"use client";

import { useState, useEffect } from "react";
import { Sliders, Save, History, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Weights = {
  konsistensi: number;
  kas: number;
  legalitas: number;
  stabilitas: number;
};

interface RuleVersion {
  version: string;
  date: string;
  user: string;
  changes: string;
}

const DEFAULT_SAMPLE_UMKM = [
  { id: "1", name: "Warung Ibu Sari", scores: { konsistensi: 75, kas: 60, legalitas: 20, stabilitas: 65 } },
  { id: "2", name: "Dapur Bu Ani", scores: { konsistensi: 80, kas: 70, legalitas: 50, stabilitas: 55 } },
  { id: "3", name: "Butik Muda", scores: { konsistensi: 40, kas: 80, legalitas: 90, stabilitas: 70 } },
];

export default function RulesPage() {
  const [weights, setWeights] = useState<Weights>({
    konsistensi: 35,
    kas: 35,
    legalitas: 25,
    stabilitas: 5,
  });
  const [thresholds, setThresholds] = useState({ maxDailyExpense: 500000, maxDailyIncome: 2000000 });
  const [sampleUMKM, setSampleUMKM] = useState(DEFAULT_SAMPLE_UMKM);
  const [selectedUMKM, setSelectedUMKM] = useState(DEFAULT_SAMPLE_UMKM[0]);
  const [versionHistory, setVersionHistory] = useState<RuleVersion[]>([
    { version: "v3", date: "2026-06-15 09:00", user: "admin@berkembang.id", changes: "Konsistensi ↑ 30→35, Legalitas ↑ 20→25" },
    { version: "v2", date: "2026-05-01 14:30", user: "admin@berkembang.id", changes: "Kas ↑ 30→35, Stabilitas ↓ 25→20" },
    { version: "v1", date: "2026-03-10 10:00", user: "system", changes: "Inisiasi bobot pertama" },
  ]);

  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    fetchActiveRulesAndHistory();
    fetchRealSampleUMKM();
  }, []);

  async function fetchActiveRulesAndHistory() {
    try {
      const { data, error } = await supabase
        .from("rules_config")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        const activeRule = data.find((r: any) => r.is_active) || data[0];
        if (activeRule.weights) {
          setWeights({
            konsistensi: Number(activeRule.weights.konsistensi) || 35,
            kas: Number(activeRule.weights.kas) || 35,
            legalitas: Number(activeRule.weights.legalitas) || 25,
            stabilitas: Number(activeRule.weights.stabilitas) || 5,
          });
        }
        if (activeRule.thresholds) {
          setThresholds({
            maxDailyExpense: Number(activeRule.thresholds.maxDailyExpense) || 500000,
            maxDailyIncome: Number(activeRule.thresholds.maxDailyIncome) || 2000000,
          });
        }

        // Map history
        const mappedHistory: RuleVersion[] = data.map((r: any) => ({
          version: r.version || "v1",
          date: r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : "Sebelumnya",
          user: r.created_by || "admin@berkembang.id",
          changes: `Weights: Konsistensi (${r.weights?.konsistensi}%), Kas (${r.weights?.kas}%), Legalitas (${r.weights?.legalitas}%), Stabilitas (${r.weights?.stabilitas}%)`
        }));
        setVersionHistory(mappedHistory);
      }
    } catch (err) {
      console.warn("Failed to fetch rules config from Supabase:", err);
    }
  }

  async function fetchRealSampleUMKM() {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .limit(5);

      if (!error && data && data.length > 0) {
        const mapped = data.map((p: any, idx: number) => {
          const sc = Number(p.readiness_score) || 65;
          return {
            id: p.id || String(idx + 1),
            name: p.name || p.nama_usaha || `UMKM #${idx + 1}`,
            scores: {
              konsistensi: Math.min(sc + 10, 95),
              kas: Math.max(sc - 5, 20),
              legalitas: sc > 70 ? 80 : 30,
              stabilitas: Math.min(sc, 90),
            }
          };
        });
        setSampleUMKM(mapped);
        setSelectedUMKM(mapped[0]);
      }
    } catch (err) {
      console.warn("Failed to fetch sample UMKM for preview:", err);
    }
  }

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

  const handlePublish = async () => {
    if (!isValid) return;
    setPublishing(true);

    try {
      const newVersionName = `v${versionHistory.length + 1}`;

      // Insert new rule config into Supabase
      const { data, error } = await supabase
        .from("rules_config")
        .insert({
          version: newVersionName,
          weights,
          thresholds,
          is_active: true,
          created_by: "admin@berkembang.id"
        })
        .select()
        .single();

      if (!error) {
        // Log into audit logs
        await supabase.from("audit_logs").insert({
          user_email: "admin@berkembang.id",
          action: "UPDATE_RULES_CONFIG",
          details: `Publish versi ${newVersionName}: Konsistensi (${weights.konsistensi}%), Kas (${weights.kas}%), Legalitas (${weights.legalitas}%), Stabilitas (${weights.stabilitas}%)`,
          status: "success"
        });

        const newVersionObj: RuleVersion = {
          version: newVersionName,
          date: new Date().toLocaleString("id-ID"),
          user: "admin@berkembang.id",
          changes: `Konsistensi: ${weights.konsistensi}%, Kas: ${weights.kas}%, Legalitas: ${weights.legalitas}%, Stabilitas: ${weights.stabilitas}%`
        };
        setVersionHistory([newVersionObj, ...versionHistory]);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error("Error publishing rules config:", err);
    } finally {
      setPublishing(false);
    }
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
                      className="w-full cursor-pointer"
                      style={{ accentColor: COLORS[key] }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thresholds */}
          <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card p-5">
            <h2 className="font-bold text-[#141a34] mb-3">Threshold Transaksi</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#444655]">Max Pengeluaran Harian (Rp)</label>
                <input
                  type="number"
                  value={thresholds.maxDailyExpense}
                  onChange={(e) => setThresholds((t) => ({ ...t, maxDailyExpense: Number(e.target.value) }))}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs font-semibold focus:border-[#001b85] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#444655]">Max Pemasukan Harian (Rp)</label>
                <input
                  type="number"
                  value={thresholds.maxDailyIncome}
                  onChange={(e) => setThresholds((t) => ({ ...t, maxDailyIncome: Number(e.target.value) }))}
                  className="w-full mt-1 px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs font-semibold focus:border-[#001b85] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handlePublish}
              disabled={!isValid || publishing}
              className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer ${
                isValid
                  ? "bg-[#001b85] text-white hover:bg-[#0e32c2]"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {publishing ? "Menyimpan ke Supabase..." : saved ? "✅ Perubahan Berhasil Dipublish!" : "Publish Perubahan Ke Supabase"}
            </button>
            <button
              onClick={() => setWeights({ konsistensi: 35, kas: 35, legalitas: 25, stabilitas: 5 })}
              className="flex-1 py-3 rounded-xl font-semibold text-xs border border-[#c5c5d7] text-[#444655] hover:bg-[#f3f2ff] cursor-pointer"
            >
              Reset ke Default
            </button>
          </div>
        </div>

        {/* Right — Preview + History */}
        <div className="space-y-4">
          {/* Preview panel */}
          <div className="bg-white rounded-2xl border border-[#e5e7ff] shadow-card p-5">
            <h2 className="font-bold text-[#141a34] mb-3">Preview Dampak pada UMKM</h2>
            <select
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#c5c5d7] text-xs font-semibold mb-4 focus:border-[#001b85] focus:outline-none bg-white cursor-pointer"
              onChange={(e) => setSelectedUMKM(sampleUMKM.find((u) => u.id === e.target.value) || sampleUMKM[0])}
            >
              {sampleUMKM.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-[#f3f2ff] rounded-xl border border-[#e5e7ff]">
                <p className="text-xs text-[#444655] font-semibold mb-1">Skor Lama</p>
                <p className="text-3xl font-bold text-[#444655] font-headline">{oldScore}</p>
                <p className="text-[10px] text-[#757686] mt-1">Formula standar</p>
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
                const score = selectedUMKM.scores[key] || 50;
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
            <h2 className="font-bold text-[#141a34] mb-3">Riwayat Versi (Supabase)</h2>
            <div className="space-y-3 max-h-60 overflow-y-auto hide-scrollbar">
              {versionHistory.map((v, idx) => (
                <div key={idx} className="p-3 bg-[#fbf8ff] rounded-xl border border-[#e5e7ff] space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-[#001b85] bg-[#ececff] px-2 py-0.5 rounded-full">{v.version}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{v.date}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium leading-snug">{v.changes}</p>
                  <p className="text-[10px] text-slate-400 font-mono-label">Oleh: {v.user}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
