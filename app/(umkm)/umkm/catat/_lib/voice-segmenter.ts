/**
 * Pemotong ucapan untuk mode catat terus-menerus.
 *
 * Mesin keadaan murni: diberi satu angka kekerasan suara (RMS, 0..1) setiap
 * `frameMs`, ia menjawab kapan satu penjualan selesai diucapkan. Tidak menyentuh
 * mikrofon, jadi bisa diuji dengan deret angka buatan.
 *
 * ATURANNYA:
 *   - Detik pertama dipakai mengukur kebisingan tempat. Warung di pinggir
 *     jalan tidak pernah sunyi; ambang « bicara » dihitung dari bisingnya
 *     sendiri, bukan dari angka tetap yang cocok untuk kamar sepi.
 *   - Ucapan baru dianggap mulai setelah suara di atas ambang bertahan
 *     `minSpeechMs` -- ketukan sendok atau klakson sekali tidak memulai apa pun.
 *   - Ucapan selesai setelah hening `silenceMs`. Jeda pendek di tengah kalimat
 *     (« nasi kotak... sepuluh ») tidak memotong.
 *   - Satu potongan paling lama `maxSegmentMs`: bila orang bicara terus, ia
 *     tetap dipotong supaya berkasnya kecil dan hasilnya cepat keluar.
 *   - Potongan yang tidak berisi ucapan sama sekali dibuang (`discard`) setiap
 *     `maxSegmentMs`, supaya rekaman hening tidak menumpuk di memori.
 *   - Selama tidak ada ucapan, ukuran bising diperbarui perlahan, jadi
 *     warung yang makin ramai menjelang siang tidak dikira bicara terus.
 */

export type SegmenterConfig = {
  frameMs: number;
  silenceMs: number;
  maxSegmentMs: number;
  calibrationMs: number;
  minSpeechMs: number;
  /** Ambang = bising × faktor ini, dan tidak pernah di bawah `minThreshold`. */
  speechFactor: number;
  minThreshold: number;
};

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  frameMs: 50,
  silenceMs: 1500,
  maxSegmentMs: 30_000,
  calibrationMs: 1000,
  minSpeechMs: 250,
  speechFactor: 2.5,
  minThreshold: 0.015,
};

/**
 * - `calibrating`: detik pertama, belum ada keputusan.
 * - `speech_start`: ucapan baru dimulai.
 * - `cut`: ucapan selesai -- kirim potongan ini.
 * - `force_cut`: ucapan terlalu panjang -- kirim, rekam lanjut.
 * - `discard`: potongan tanpa ucapan sudah terlalu lama -- buang.
 * - `none`: tidak ada yang berubah.
 */
export type SegmenterEvent = "calibrating" | "speech_start" | "cut" | "force_cut" | "discard" | "none";

export type Segmenter = {
  push: (level: number) => SegmenterEvent;
  /** Potongan diputus dari luar (tombol « Kirim sekarang »); mulai hitung baru. */
  resetSegment: () => void;
  readonly speaking: boolean;
  readonly threshold: number;
};

export function createSegmenter(config: Partial<SegmenterConfig> = {}): Segmenter {
  const c = { ...DEFAULT_SEGMENTER_CONFIG, ...config };
  const calibrationFrames = Math.max(1, Math.round(c.calibrationMs / c.frameMs));
  const minSpeechFrames = Math.max(1, Math.round(c.minSpeechMs / c.frameMs));
  const silenceFrames = Math.max(1, Math.round(c.silenceMs / c.frameMs));
  const maxSegmentFrames = Math.max(1, Math.round(c.maxSegmentMs / c.frameMs));

  let calibrated = 0;
  let noiseSum = 0;
  let noise = 0;
  let threshold = c.minThreshold;

  let segmentFrames = 0;
  let voicedRun = 0;
  let silentRun = 0;
  let speaking = false;

  const updateThreshold = () => {
    threshold = Math.max(c.minThreshold, noise * c.speechFactor);
  };

  const resetSegment = () => {
    segmentFrames = 0;
    voicedRun = 0;
    silentRun = 0;
    speaking = false;
  };

  const push = (raw: number): SegmenterEvent => {
    const level = Number.isFinite(raw) && raw > 0 ? raw : 0;

    if (calibrated < calibrationFrames) {
      calibrated += 1;
      noiseSum += level;
      noise = noiseSum / calibrated;
      updateThreshold();
      segmentFrames += 1;
      return "calibrating";
    }

    segmentFrames += 1;
    const voiced = level > threshold;

    if (!speaking) {
      if (voiced) {
        voicedRun += 1;
        if (voicedRun >= minSpeechFrames) {
          speaking = true;
          silentRun = 0;
          return "speech_start";
        }
      } else {
        voicedRun = 0;
        // Bising tempat diikuti perlahan hanya selama tidak ada ucapan.
        noise = noise * 0.98 + level * 0.02;
        updateThreshold();
      }
      if (segmentFrames >= maxSegmentFrames) {
        resetSegment();
        return "discard";
      }
      return "none";
    }

    if (voiced) {
      silentRun = 0;
    } else {
      silentRun += 1;
      if (silentRun >= silenceFrames) {
        resetSegment();
        return "cut";
      }
    }
    if (segmentFrames >= maxSegmentFrames) {
      resetSegment();
      return "force_cut";
    }
    return "none";
  };

  return {
    push,
    resetSegment,
    get speaking() { return speaking; },
    get threshold() { return threshold; },
  };
}

/** Kekerasan suara dari sampel gelombang (-1..1): akar rata-rata kuadrat. */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / samples.length);
}
