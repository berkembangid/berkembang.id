import { describe, expect, it } from "vitest";
import { createSegmenter, rms, type SegmenterEvent } from "@/app/(umkm)/umkm/catat/_lib/voice-segmenter";

/** Deret level: `ms` milidetik pada kekerasan `level`, per bingkai 50 ms. */
const run = (ms: number, level: number) => Array<number>(Math.round(ms / 50)).fill(level);

function feed(levels: number[], config = {}) {
  const segmenter = createSegmenter(config);
  const events: Array<{ at: number; event: SegmenterEvent }> = [];
  levels.forEach((level, index) => {
    const event = segmenter.push(level);
    if (event !== "none" && event !== "calibrating") events.push({ at: index * 50, event });
  });
  return events.map((entry) => entry.event);
}

const QUIET = 0.005;
const SPEECH = 0.2;

describe("pemotong ucapan", () => {
  it("satu ucapan lalu hening panjang menjadi satu potongan", () => {
    expect(feed([...run(1000, QUIET), ...run(2000, SPEECH), ...run(1600, QUIET)])).toEqual(["speech_start", "cut"]);
  });

  it("jeda pendek di tengah kalimat tidak memotong", () => {
    expect(feed([
      ...run(1000, QUIET),
      ...run(800, SPEECH), ...run(700, QUIET), ...run(800, SPEECH),
      ...run(1600, QUIET),
    ])).toEqual(["speech_start", "cut"]);
  });

  it("tiga penjualan dipisah hening menjadi tiga potongan", () => {
    const sale = [...run(1200, SPEECH), ...run(2000, QUIET)];
    expect(feed([...run(1000, QUIET), ...sale, ...sale, ...sale])).toEqual([
      "speech_start", "cut", "speech_start", "cut", "speech_start", "cut",
    ]);
  });

  it("bunyi sesaat (ketukan, klakson) tidak dianggap ucapan", () => {
    expect(feed([...run(1000, QUIET), ...run(100, SPEECH), ...run(3000, QUIET)])).toEqual([]);
  });

  it("bicara terus melewati batas dipotong paksa", () => {
    expect(feed([...run(1000, QUIET), ...run(12_000, SPEECH)], { maxSegmentMs: 5000 })).toContain("force_cut");
  });

  it("hening panjang tanpa ucapan dibuang, bukan dikirim", () => {
    expect(feed([...run(1000, QUIET), ...run(6000, QUIET)], { maxSegmentMs: 5000 })).toEqual(["discard"]);
  });

  it("ambang mengikuti bising tempat: suara setara bising warung bukan ucapan", () => {
    const busy = 0.05;
    expect(feed([...run(1000, busy), ...run(3000, busy * 1.5)])).toEqual([]);
    expect(feed([...run(1000, busy), ...run(1500, 0.4), ...run(2000, busy)])).toEqual(["speech_start", "cut"]);
  });

  it("rms dari gelombang", () => {
    expect(rms([0, 0, 0])).toBe(0);
    expect(rms([0.5, -0.5])).toBeCloseTo(0.5);
  });
});
